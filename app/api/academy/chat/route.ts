import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { sanitizeText } from "@/lib/utils/sanitize";
import { buildPersonaSystemPrompt } from "@/lib/academy/persona";
import { runAiAssistanceEstimate } from "@/lib/services/academyAiAssistance";
import {
  ACADEMY_PERSONA_MODEL,
  ACADEMY_TURN_CAP,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
} from "@/lib/academy/models";
import type {
  AcademyHiddenConstraint,
  AcademySessionVars,
  ScenarioSeed,
  TrainingTurn,
} from "@/lib/types/database";

export const runtime = "nodejs";

/**
 * POST /api/academy/chat — the client-persona turn.
 *
 * Wire contract:
 *   req  { sessionId: uuid, message: string }
 *   res  text/plain streaming chunks of the client's reply (no SSE framing —
 *        the browser reads it as plain text deltas)
 *   headers  X-Academy-Degraded: "1"      → canned fallback, Anthropic not used
 *            X-Academy-Turn-Cap: "1"      → this was the intern's last turn
 *
 * Only the owning intern may send. The persona system prompt is built here,
 * server-side, from the seed + the session's randomisation snapshot — the seed's
 * secrets (hidden constraints, escalation trigger) never reach the browser, and
 * the rubric never reaches the persona model.
 *
 * The client turn is persisted in an `after()` callback once the stream closes,
 * so the intern sees tokens immediately and the write never blocks the response.
 */

const attachmentSchema = z.object({
  path: z.string().min(1).max(400),
  kind: z.enum(["image", "video"]),
  mime: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  size: z.number().int().nonnegative(),
});

/**
 * Editor telemetry, when the composer reports it. Every field is something the
 * browser observed while the reply was written — never an inference about where
 * the text came from. Optional: an older client simply omits it.
 */
const compositionSchema = z.object({
  pasteCount: z.number().int().nonnegative().max(1000),
  pastedChars: z.number().int().nonnegative().max(100_000),
  largestPasteChars: z.number().int().nonnegative().max(100_000),
  typedChars: z.number().int().nonnegative().max(100_000),
  timeToFirstInputMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  compositionMs: z.number().int().nonnegative().max(86_400_000).nullable(),
});

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  // A share can carry only media, so the text may be empty when attachments exist.
  message: z.string().max(4000).default(""),
  attachments: z.array(attachmentSchema).max(4).default([]),
  composition: compositionSchema.nullish(),
});

/** Anthropic vision accepts these; anything else is described, not shown. */
const VISION_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Don't inline anything huge into the prompt. */
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;

const FALLBACK_REPLY =
  "Sorry, I got distracted for a moment — could you say that again?";

function resolveConstraints(
  seed: ScenarioSeed,
  vars: AcademySessionVars | null,
): AcademyHiddenConstraint[] {
  const constraints = Array.isArray(seed.hidden_constraints)
    ? seed.hidden_constraints
    : [];
  const override = vars?.constraint_override ?? null;
  if (!override) return constraints;
  return constraints.map((c) =>
    c.id === override.id ? { ...c, value: override.value } : c,
  );
}

export async function POST(req: Request): Promise<Response> {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { sessionId, message, attachments, composition } = parsed.data;
  const internBody = sanitizeText(message).trim();
  // A turn must carry something — text, media, or both.
  if (!internBody && attachments.length === 0) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  const db = getServiceSupabaseClient();

  // 3. Load session — only the owning intern may send a turn.
  const { data: session, error: sErr } = await db
    .from("training_sessions")
    .select("id, intern_id, seed_id, status, session_vars")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr || !session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.intern_id !== user.id) {
    return Response.json({ error: "Not your session" }, { status: 403 });
  }
  if (session.status !== "open") {
    return Response.json({ error: "Session is closed" }, { status: 409 });
  }

  // 4. Transcript so far (append-only; ordering axis is seq).
  const { data: turnRows, error: tErr } = await db
    .from("training_turns")
    .select("id, session_id, role, body, seq, created_at")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (tErr) {
    return Response.json({ error: "Could not load transcript" }, { status: 500 });
  }
  const turns = (turnRows ?? []) as TrainingTurn[];

  const internCount = turns.filter((t) => t.role === "intern").length;
  if (internCount >= ACADEMY_TURN_CAP) {
    return Response.json(
      { error: "Turn cap reached — close the conversation to see your review." },
      { status: 409 },
    );
  }

  // 5. Append the intern's turn.
  //    Attachment paths are re-scoped to this session's folder — a client could
  //    otherwise post a path belonging to someone else's session.
  const allowedPrefix = `academy/${sessionId}/`;
  const safeAttachments = attachments.filter((a) => a.path.startsWith(allowedPrefix));

  const internSeq = (turns.at(-1)?.seq ?? 0) + 1;
  // Give a media-only turn a readable body so transcripts and the evaluator
  // still make sense without rendering the file.
  const internTurnBody =
    internBody ||
    (safeAttachments[0]?.kind === "video" ? "[shared a video]" : "[shared a photo]");

  const baseTurn = {
    session_id: sessionId,
    role: "intern" as const,
    body: internTurnBody,
    seq: internSeq,
  };

  // `attachments` arrives with migration 127. Text chat must not break when that
  // migration has not been applied yet, so only send the column when there is
  // something to store, and fall back to a plain insert if the column is absent
  // (PostgREST reports an unknown column as PGRST204 / 42703).
  // The inserted id is needed to attach the AI-assistance estimate to this exact
  // reply — the estimate lives in a sibling table because `training_turns` is
  // append-only and must never be updated after the fact.
  const insertTurn = (payload: Record<string, unknown>) =>
    db.from("training_turns").insert(payload).select("id").single();

  let internTurnId: string | null = null;
  let insErr: Awaited<ReturnType<typeof insertTurn>>["error"] = null;
  {
    const res = safeAttachments.length
      ? await insertTurn({ ...baseTurn, attachments: safeAttachments })
      : await insertTurn(baseTurn);
    internTurnId = res.data?.id ?? null;
    insErr = res.error;
  }

  const missingAttachmentsColumn =
    !!insErr &&
    (insErr.code === "PGRST204" ||
      insErr.code === "42703" ||
      /attachments/i.test(insErr.message ?? ""));

  if (missingAttachmentsColumn && safeAttachments.length) {
    console.error(
      "[academy/chat] `training_turns.attachments` is missing — apply migration 127 " +
        "(supabase/manual/academy_part5_attachments.sql). Saving the turn without media.",
    );
    const retry = await insertTurn(baseTurn);
    internTurnId = retry.data?.id ?? null;
    insErr = retry.error;
  }

  if (insErr) {
    // Surface the real cause — swallowing it makes this undiagnosable from the UI.
    console.error(
      "[academy/chat] failed to insert intern turn:",
      insErr.code,
      insErr.message,
      insErr.details ?? "",
    );
    return Response.json(
      { error: "Could not save your message", detail: insErr.message },
      { status: 500 },
    );
  }

  // Estimate AI assistance out of band. It costs a model round-trip, so running
  // it inline would delay the persona's reply for a signal nobody is waiting on.
  // Media-only turns carry a synthetic body ("[shared a photo]") and are not
  // writing, so there is nothing to judge.
  if (internTurnId && internBody) {
    const turnId = internTurnId;
    after(async () => {
      await runAiAssistanceEstimate({
        turnId,
        sessionId,
        internId: session.intern_id as string,
        text: internBody,
        composition: composition
          ? { ...composition, finalChars: internBody.length }
          : null,
      });
    });
  }

  const isLastTurn = internCount + 1 >= ACADEMY_TURN_CAP;
  const clientSeq = internSeq + 1;

  /** Persist the persona's reply as the next client turn. */
  const persistClientTurn = async (body: string) => {
    const clean = body.trim() || FALLBACK_REPLY;
    const { error } = await db.from("training_turns").insert({
      session_id: sessionId,
      role: "client",
      body: clean,
      seq: clientSeq,
    });
    if (error) {
      console.error("[academy/chat] failed to persist client turn:", error.message);
    }
  };

  // 6. Seed + persona prompt (server-side only).
  const { data: seedRow, error: seedErr } = await db
    .from("scenario_seeds")
    .select(
      "id, archetype, vertical, hidden_constraints, escalation_trigger, opening_message",
    )
    .eq("id", session.seed_id)
    .maybeSingle();

  const key = process.env.ANTHROPIC_API_KEY?.trim();

  // Degrade rather than break the drill if the seed or the API is unavailable.
  if (seedErr || !seedRow || !key) {
    after(async () => {
      await persistClientTurn(FALLBACK_REPLY);
    });
    return new Response(FALLBACK_REPLY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Academy-Degraded": "1",
        ...(isLastTurn ? { "X-Academy-Turn-Cap": "1" } : {}),
      },
    });
  }

  const vars = session.session_vars as AcademySessionVars | null;
  const seed = seedRow as ScenarioSeed;
  // The rendered opening (transcript seq 1) — the randomised text the intern
  // actually sees. Passed into the system prompt because it gets stripped from
  // the message array below (Anthropic requires a `user` first message), and
  // without it the persona invents a different scenario.
  const openingMessage = turns.find((t) => t.role === "client")?.body;

  const systemPrompt = buildPersonaSystemPrompt({
    name: vars?.randomized?.name ?? "the member",
    archetype: seed.archetype,
    vertical: seed.vertical,
    escalationTrigger: seed.escalation_trigger,
    resolvedConstraints: resolveConstraints(seed, vars),
    openingMessage,
  });

  // Anthropic messages must alternate and start with `user`. The transcript
  // opens with the client's message, so the persona's own lines map to
  // `assistant` and the intern's to `user`.
  const history = [...turns, {
    role: "intern" as const,
    body: internBody || "[shared media]",
  }];

  type TextBlock = { type: "text"; text: string };
  type ImageBlock = {
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  };
  type Content = string | (TextBlock | ImageBlock)[];

  const messages: { role: "user" | "assistant"; content: Content }[] = [];
  for (const t of history) {
    const role = t.role === "intern" ? "user" : "assistant";
    const last = messages.at(-1);
    if (last && last.role === role && typeof last.content === "string") {
      last.content += `\n\n${t.body}`; // collapse consecutive same-role turns
    } else {
      messages.push({ role, content: t.body });
    }
  }
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }

  // Let the persona actually SEE shared photos — otherwise it would blandly
  // acknowledge an image it knows nothing about, which reads as fake. Videos
  // can't be inlined, so they're described instead.
  if (safeAttachments.length > 0 && messages.length > 0) {
    const blocks: (TextBlock | ImageBlock)[] = [];
    for (const att of safeAttachments) {
      if (att.kind === "image" && VISION_MIMES.has(att.mime) && att.size <= MAX_INLINE_IMAGE_BYTES) {
        const { data: blob, error } = await db.storage
          .from("academy-attachments")
          .download(att.path);
        if (!error && blob) {
          const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: att.mime, data: b64 },
          });
          continue;
        }
      }
      blocks.push({
        type: "text",
        text:
          att.kind === "video"
            ? `[The concierge shared a video: ${att.name}. You can see it plays, but describe only what they tell you about it.]`
            : `[The concierge shared an image: ${att.name}.]`,
      });
    }
    if (internBody) blocks.push({ type: "text", text: internBody });

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "user") lastMsg.content = blocks;
  }

  // 7. Stream the persona's reply.
  const controllerAbort = new AbortController();
  const timeout = setTimeout(() => controllerAbort.abort(), 30_000);

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ACADEMY_PERSONA_MODEL,
        // Hard ceiling on rambling. The prompt asks for one or two sentences;
        // this makes a paragraph physically impossible rather than merely
        // discouraged, which is what keeps the chat feeling like messaging.
        max_tokens: 200,
        stream: true,
        system: systemPrompt,
        messages,
      }),
      signal: controllerAbort.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error("[academy/chat] upstream request failed:", e);
    after(async () => {
      await persistClientTurn(FALLBACK_REPLY);
    });
    return new Response(FALLBACK_REPLY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Academy-Degraded": "1",
        ...(isLastTurn ? { "X-Academy-Turn-Cap": "1" } : {}),
      },
    });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    console.error(
      "[academy/chat] Anthropic error:",
      upstream.status,
      await upstream.text().catch(() => ""),
    );
    after(async () => {
      await persistClientTurn(FALLBACK_REPLY);
    });
    return new Response(FALLBACK_REPLY, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Academy-Degraded": "1",
        ...(isLastTurn ? { "X-Academy-Turn-Cap": "1" } : {}),
      },
    });
  }

  // Resolved with the full reply once the upstream stream closes; `after()`
  // awaits it so the DB write happens off the response path.
  let settle: (text: string) => void;
  const fullText = new Promise<string>((resolve) => {
    settle = resolve;
  });

  after(async () => {
    await persistClientTurn(await fullText);
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /*
   * Hoisted out of `start()` so `cancel()` can see what actually streamed.
   *
   * When the trainee switched clients mid-stream the cancel path settled with
   * an empty string, which `persistClientTurn` coerced to FALLBACK_REPLY — so
   * "Sorry, I got distracted for a moment" was written over the reply they had
   * just watched arrive. training_turns is append-only, so that was permanent,
   * and the persona, the evaluator and the ticket reviewer all read it back
   * afterwards as though the member had really said it.
   */
  let accumulated = "";
  /** Guards against cancel() settling after a completed read already did. */
  let settled = false;
  const settleOnce = (text: string) => {
    if (settled) return;
    settled = true;
    settle(text);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Anthropic SSE frames are separated by a blank line.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const evt = JSON.parse(payload) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                };
                if (
                  evt.type === "content_block_delta" &&
                  evt.delta?.type === "text_delta" &&
                  typeof evt.delta.text === "string"
                ) {
                  accumulated += evt.delta.text;
                  controller.enqueue(encoder.encode(evt.delta.text));
                }
              } catch {
                // Ignore malformed frames — keep the conversation alive.
              }
            }
          }
        }
      } catch (e) {
        console.error("[academy/chat] stream read failed:", e);
        if (!accumulated) {
          accumulated = FALLBACK_REPLY;
          controller.enqueue(encoder.encode(FALLBACK_REPLY));
        }
      } finally {
        clearTimeout(timeout);
        reader.releaseLock();
        settleOnce(accumulated || FALLBACK_REPLY);
        controller.close();
      }
    },
    cancel() {
      // Client navigated away mid-stream — persist what actually arrived, not
      // an empty string. A partial reply is a true record of the conversation;
      // the canned line is a fabrication the evaluator would later grade.
      clearTimeout(timeout);
      controllerAbort.abort();
      settleOnce(accumulated);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(isLastTurn ? { "X-Academy-Turn-Cap": "1" } : {}),
    },
  });
}
