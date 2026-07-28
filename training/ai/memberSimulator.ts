/**
 * AI member simulator — the prompt + I/O contract for "the member" replying to a
 * trainee Genie in the Genie Trainer. Pure (no "use server", no network): builds
 * the system prompt, shapes the Anthropic messages, and parses/guards the model's
 * JSON. The API route (app/api/training/member-reply) does auth + the HTTP call.
 *
 * The model plays ONLY the member (a fictional persona synthesised from the
 * scenario) — never a real person, never the Genie. History is threaded as
 * Anthropic messages (member = assistant, Genie = user), not baked into the
 * system prompt, so it's a proper multi-turn conversation.
 */
import { z } from "zod";
import type { Scenario } from "@/training/types";

export const MEMBER_REPLY_MAX = 500;

/** One prior turn in the drill, as the client sees it. */
export const memberTurnSchema = z.object({
  role: z.enum(["agent", "member"]),
  text: z.string().max(2000),
});
export type MemberTurn = z.infer<typeof memberTurnSchema>;

/** An attachment the Genie shared this turn. Images are sent to vision; files
 * are described in text (their bytes never leave the browser). */
export const attachmentSchema = z.union([
  z.object({
    kind: z.literal("image"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    // base64 (no data: prefix). ~2.2 MB of image after client-side downscale.
    dataBase64: z.string().min(1).max(3_000_000),
    caption: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("file"),
    name: z.string().min(1).max(200),
    caption: z.string().max(500).optional(),
  }),
]);
export type AttachmentInput = z.infer<typeof attachmentSchema>;

/** POST body for /api/training/member-reply. */
export const memberReplyRequestSchema = z.object({
  scenarioId: z.string().min(1).max(80),
  agentMessage: z.string().min(1).max(2000),
  cannedId: z.string().max(40).nullish(),
  history: z.array(memberTurnSchema).max(40).default([]),
  turnNumber: z.number().int().nonnegative().max(999).optional(),
  elapsedLabel: z.string().max(40).optional(),
  attachment: attachmentSchema.optional(),
});
export type MemberReplyRequest = z.infer<typeof memberReplyRequestSchema>;

/** What the client renders. */
export interface MemberReply {
  reply: string;
  mood: string;
  phase: string;
  shouldEnd: boolean;
}

/** The model's raw JSON contract (loose — we never hard-fail on metadata). */
const modelOutputSchema = z.object({
  member_reply: z.string().min(1).max(MEMBER_REPLY_MAX),
  member_mood: z.string().max(40).optional(),
  conversation_phase: z.string().max(40).optional(),
  should_end_conversation: z.boolean().optional(),
  implicit_expectation: z.string().max(400).optional(),
});

export function buildMemberSystemPrompt(scenario: Scenario): string {
  const fields = scenario.requestFields.length
    ? scenario.requestFields.map((f) => `- ${f.label}: ${f.value}`).join("\n")
    : "- (no structured details provided — infer sensibly from the request)";

  return `You are simulating "the member" — an Indulge luxury concierge client — in a WhatsApp-style training drill for a Genie (concierge agent).

YOUR ROLE
- You are ONLY the member. Never speak as the Genie, never break character, never mention that this is training or AI.
- You are a busy, affluent UHNI client who expects white-glove service but is generally polite.
- Write like WhatsApp: short messages, natural tone, occasional emoji (sparingly — 0–1 per message max).
- You initiated this request. Stay focused on getting it done.

SCENARIO CONTEXT
Title: ${scenario.title}
Category: ${scenario.category ?? "General"}
Priority: ${scenario.priority}
Your opening request was: "${scenario.openingMessage}"

Request details (what you actually need — treat these as ground truth for your expectations):
${fields}

HOW TO BEHAVE AS THE MEMBER
1. Stay consistent with what you've already said; don't introduce new major requests unless the Genie opens that door.
2. If the Genie acknowledged but didn't confirm specifics → ask 1–2 clarifying questions or confirm you're waiting.
3. If the Genie said "on it" with no detail → "Thanks, please keep me posted" or ask for an ETA.
4. If the Genie shared options / a quote → react realistically: pick one, ask the price, ask for an alternative, or ask one detail.
5. If the Genie is vague → gently push for specifics (time, price, confirmation). If they resolved/confirmed → thank them briefly.
6. Tone by priority — urgent: shorter, mention time pressure if relevant. medium/low: relaxed but still expect professionalism.
7. The Genie may share an image or a file (a photo of options, a booking, a document). When they do, actually look at what was shared and react as the member would — approve, pick one, compare, critique, or ask a specific question about it.

REALISM RULES
- Max 2–4 sentences per reply; often one sentence is enough. No bullet points unless comparing options the Genie sent.
- Don't repeat the full request unless correcting the Genie. Don't invent phone numbers, emails, or payment details.
- Don't resolve the ticket yourself — you're the client waiting for the Genie.

RESPONSE FORMAT
Respond with valid JSON only. No markdown, no prose outside the JSON. Keep it compact.
{
  "member_reply": "<your WhatsApp-style reply as the member>",
  "member_mood": "<patient|neutral|impatient|satisfied|confused>",
  "conversation_phase": "<awaiting_first_reply|clarifying|reviewing_options|confirming|thanking|escalating>",
  "should_end_conversation": false
}
RULES FOR JSON
- member_reply: required, max 280 characters, human and casual ("Perfect", "That works", "Can you check if…").
- should_end_conversation: true only when clearly done (thanks + goodbye after a confirmation).`;
}

type TextBlock = { type: "text"; text: string };
type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type AnthropicContent = string | Array<TextBlock | ImageBlock>;
type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicContent };

/**
 * Thread the drill into Anthropic messages: member turns → assistant, Genie turns
 * → user, with the latest Genie message as the final user turn. The scenario's
 * own opening (already in the system prompt) is dropped, leading assistant turns
 * are trimmed, and consecutive same-role (string) turns are merged so the array
 * always starts with `user` and alternates — what the Messages API requires. A
 * shared image is attached to the final user turn as a vision block.
 */
export function buildMemberMessages(req: MemberReplyRequest): AnthropicMessage[] {
  const mapped: AnthropicMessage[] = req.history
    .slice(-12)
    .map((t) => ({
      role: t.role === "member" ? ("assistant" as const) : ("user" as const),
      content: t.role === "agent" ? `Genie: ${t.text}` : t.text,
    }));

  const att = req.attachment;
  const shareNote = att
    ? att.kind === "image"
      ? `\nThe Genie just shared an image${att.caption ? ` captioned "${att.caption}"` : ""} — look at it and react as the member.`
      : `\nThe Genie just shared a file "${att.name}"${att.caption ? ` — "${att.caption}"` : ""} — react as the member.`
    : "";

  const metaText =
    `Genie's latest message: "${req.agentMessage}"\n` +
    `Canned action id: ${req.cannedId ?? "custom"}\n` +
    `Turn: ${req.turnNumber ?? mapped.length + 1}\n` +
    `Time since request (simulated): ${req.elapsedLabel ?? "just now"}${shareNote}\n\n` +
    `Write the member's next WhatsApp reply as JSON.`;

  const final: AnthropicMessage =
    att && att.kind === "image"
      ? {
          role: "user",
          content: [
            { type: "text", text: metaText },
            { type: "image", source: { type: "base64", media_type: att.mediaType, data: att.dataBase64 } },
          ],
        }
      : { role: "user", content: metaText };

  const msgs = [...mapped, final];
  // drop leading assistant turns
  while (msgs.length && msgs[0]!.role === "assistant") msgs.shift();
  // merge consecutive same-role turns so the array always strictly alternates —
  // handles array (vision) content too, not just strings.
  const asBlocks = (c: AnthropicContent): Array<TextBlock | ImageBlock> =>
    typeof c === "string" ? [{ type: "text", text: c }] : c;
  const out: AnthropicMessage[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      if (typeof last.content === "string" && typeof m.content === "string") {
        last.content += `\n${m.content}`;
      } else {
        last.content = [...asBlocks(last.content), ...asBlocks(m.content)];
      }
    } else {
      out.push({ ...m });
    }
  }
  return out.length ? out : [final];
}

/**
 * Parse the model's text into a guarded MemberReply. Never throws.
 * - Plain text (model ignored the JSON instruction but gave a usable line) → use it.
 * - JSON-shaped but malformed/truncated/invalid → use `fallbackText`, NEVER dump
 *   raw braces or a half-cut `{"member_reply": "…` string into the chat.
 */
export function parseMemberReply(rawText: string, fallbackText: string): MemberReply {
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const jsonStart = cleaned.indexOf("{");

  if (jsonStart === -1) {
    const plain = cleaned.replace(/\s+/g, " ").trim().slice(0, MEMBER_REPLY_MAX);
    return { reply: plain || fallbackText, mood: "neutral", phase: "clarifying", shouldEnd: false };
  }

  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonEnd > jsonStart) {
    try {
      const parsed = modelOutputSchema.safeParse(JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)));
      if (parsed.success) {
        return {
          reply: parsed.data.member_reply.trim(),
          mood: parsed.data.member_mood ?? "neutral",
          phase: parsed.data.conversation_phase ?? "clarifying",
          shouldEnd: parsed.data.should_end_conversation ?? false,
        };
      }
    } catch {
      /* malformed / truncated JSON — fall through */
    }
  }
  return { reply: fallbackText, mood: "neutral", phase: "clarifying", shouldEnd: false };
}

/**
 * Deterministic fallback when the AI is unreachable or unconfigured, so the drill
 * still feels alive. Mirrors the behaviour guidance for each canned chip.
 */
export function fallbackMemberReply(cannedId: string | null | undefined): MemberReply {
  const base = { mood: "neutral", phase: "clarifying", shouldEnd: false };
  switch (cannedId) {
    case "ack":
      return { ...base, reply: "Sure — happy to share whatever you need. What else can I confirm?" };
    case "onit":
      return { ...base, reply: "Great, thank you. Do you have a rough ETA?" };
    case "quote":
      return { ...base, reply: "Perfect — could you share the details and pricing?", phase: "reviewing_options" };
    case "share":
      return { ...base, reply: "Got it — thanks for sharing. Let me take a look.", phase: "reviewing_options" };
    default:
      return { ...base, reply: "Noted, thank you — keeping an eye out for your update." };
  }
}
