import { createClient } from "@/lib/supabase/server";
import { getScenarioById } from "@/training/store/loadScenarios";
import {
  buildMemberMessages,
  buildMemberSystemPrompt,
  fallbackMemberReply,
  memberReplyRequestSchema,
  parseMemberReply,
  type MemberReply,
} from "@/training/ai/memberSimulator";

export const runtime = "nodejs";

/**
 * POST /api/training/member-reply — the AI member simulator.
 *
 * The trainee (a Genie) sends a reply; this returns "the member's" next WhatsApp
 * message. Auth-gated; the scenario is loaded server-side from the training store
 * (the client only sends its id + the conversation), so no member/PII data is
 * trusted from the client. Degrades gracefully: if Anthropic is unconfigured or
 * fails, a deterministic fallback keeps the drill alive rather than 500-ing.
 */
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

  // 2. Reject oversized bodies before buffering (image base64 is capped in the
  //    schema, but don't read a huge payload into memory just to reject it).
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 4_000_000) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  // 3. Validate input
  const raw = await req.json().catch(() => null);
  const parsed = memberReplyRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const input = parsed.data;

  // 3. Load the scenario server-side (never trust scenario data from the client)
  const scenario = getScenarioById(input.scenarioId);
  if (!scenario) {
    return Response.json({ error: "Scenario not found" }, { status: 404 });
  }

  // 4. If AI isn't configured, fall back — the drill must not break.
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return json(fallbackMemberReply(input.cannedId), { degraded: true });
  }

  // 5. Ask Haiku for the member's next line (with a hard timeout so a stalled
  //    upstream can't hang the request and freeze the client's reply chips).
  const fallback = fallbackMemberReply(input.cannedId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        stream: false,
        system: buildMemberSystemPrompt(scenario),
        messages: buildMemberMessages(input),
      }),
      signal: controller.signal,
    });
    if (!ar.ok) {
      console.error("[training/member-reply] Anthropic error:", ar.status, await ar.text().catch(() => ""));
      return json(fallback, { degraded: true });
    }
    const result = (await ar.json()) as { content?: { text?: string }[] };
    const text = result.content?.[0]?.text ?? "";
    return json(parseMemberReply(text, fallback.reply), { degraded: false });
  } catch (e) {
    console.error("[training/member-reply] request failed:", e);
    return json(fallback, { degraded: true });
  } finally {
    clearTimeout(timeout);
  }
}

function json(reply: MemberReply, meta: { degraded: boolean }): Response {
  return Response.json({ ...reply, degraded: meta.degraded });
}
