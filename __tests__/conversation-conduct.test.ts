/**
 * Concierge conversation conduct — "you already have that" regression suite.
 *
 * THE BUG THIS PINS
 *   Client: "What is the hotel address?"
 *   AI:     "You already have the information."
 *
 * It reads as a tone problem and is not one. The Gupshup bot fed the model a
 * *summary* of the conversation instead of the conversation: `context_jsonb.
 * last_turns` kept the last 4 turns with each side truncated to 200 characters,
 * while `bot_messages` — the authoritative record of every message actually
 * sent — was written on every turn and never read back. Truncation destroys the
 * answer but preserves the evidence that an answer happened, which is precisely
 * the state in which a model asserts "I already shared that".
 *
 * Worse, the stored assistant turn was `parsed.text_reply` (the JSON fallback
 * field) even on turns where the client was sent a rendered list or an image
 * caption — so the bot's memory of its own words was of words nobody read.
 *
 * These tests cover the two halves of the fix: the conduct policy (pure, so it
 * is directly testable) and source-level guards that the retrieval path really
 * did move to the authoritative transcript.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONCIERGE_CONVERSATION_CONDUCT,
  DEFLECTION_PATTERNS,
  deflectionRetryInstruction,
  findDeflection,
  isInformationRequest,
} from "@/lib/ai/conversationConduct";
import { eliaClientScopedPrompt, eliaSystemPrompt } from "@/lib/elia/chat-prompt";

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

// ── The replies that must never reach a client ───────────────────────────────

/** Verbatim from the bug report and the acceptance criteria. */
const DEFLECTIONS = [
  "You already have the information.",
  "You already have this information.",
  "I already shared those details with you.",
  "I already told you the hotel.",
  "I already sent that to you.",
  "I already provided that information.",
  "As I said before, the reservation is at 8 PM.",
  "As mentioned earlier, the hotel is the Four Seasons.",
  "As previously mentioned, your booking is confirmed.",
  "Why are you asking again?",
  "You asked me this already.",
  "You were already told this.",
  "That was already sent.",
];

/** Good answers — these must NOT trip the detector. */
const GOOD_REPLIES = [
  "Of course — the hotel is Four Seasons Mumbai, Worli.",
  "Certainly. Your reservation is at 8:00 PM.",
  "Absolutely, here's the information again: Zuma, 8 PM, table for four.",
  "Sure, let me share that again — the confirmation number is IND-44821.",
  "I don't have the confirmed address yet. Let me check that for you.",
  "I don't have that detail available right now. I'll need to verify it.",
  "Your booking is already confirmed — here are the details: 8 PM, Zuma.",
  "The table is already held under your name, Mr Sharma. 8:00 PM, four guests.",
  "I have already-prepared options for you: the Rolex Daytona and the AP Royal Oak.",
];

describe("findDeflection", () => {
  it.each(DEFLECTIONS)("flags %j", (reply) => {
    expect(findDeflection(reply)).not.toBeNull();
  });

  it.each(GOOD_REPLIES)("leaves %j alone", (reply) => {
    expect(findDeflection(reply)).toBeNull();
  });

  it("returns the offending phrase, not just a boolean", () => {
    // The phrase is quoted back to the model on the retry, and into the log —
    // "a deflection occurred" is not a diagnosable log line.
    const hit = findDeflection("Sure. I already told you that it's at 8 PM.");
    expect(hit).toMatch(/already told/i);
  });

  it("catches a deflection buried mid-reply, not only at the start", () => {
    expect(
      findDeflection("Thanks for checking in! I already sent you those details earlier today."),
    ).not.toBeNull();
  });

  it("handles empty and missing input without throwing", () => {
    expect(findDeflection("")).toBeNull();
    expect(findDeflection(null)).toBeNull();
    expect(findDeflection(undefined)).toBeNull();
  });

  it("does not fire on 'already' used about the world rather than the client", () => {
    // "already confirmed" describes a booking's state; it is not a refusal.
    expect(findDeflection("The restaurant has already confirmed the table for 8 PM.")).toBeNull();
    expect(findDeflection("Your visa is already valid, so no application is needed.")).toBeNull();
  });
});

// ── Question detection (§14 scenarios) ───────────────────────────────────────

describe("isInformationRequest — the acceptance-criteria scenarios", () => {
  it.each([
    "What is the hotel address?",
    "Can you send me the address again?",
    "What time is my reservation?",
    "Are you sure? Tell me the time again.",
    "What was the price?",
    "You already told me, but send me the details again.",
    "Which hotel did you book?",
    "What was the confirmation number?",
    "Can you send me the booking details again?",
    "send it again",
    "resend the details please",
    "remind me of the time",
    "confirm me the address",
    "how much was it",
    "how many guests",
    // Bare follow-ups that depend on prior context (§9)
    "What time?",
    "Where?",
    "For how many?",
  ])("treats %j as an information request", (message) => {
    expect(isInformationRequest(message)).toBe(true);
  });

  it.each([
    "Thanks!",
    "Perfect, see you then.",
    "I'm interested",
    "Book it",
    "That works for me",
  ])("treats %j as not an information request", (message) => {
    expect(isInformationRequest(message)).toBe(false);
  });

  it("handles empty input", () => {
    expect(isInformationRequest("")).toBe(false);
    expect(isInformationRequest(null)).toBe(false);
  });
});

// ── The policy text itself ───────────────────────────────────────────────────

describe("the conduct policy states each required behaviour", () => {
  const policy = CONCIERGE_CONVERSATION_CONDUCT;

  it("makes the latest message the primary intent", () => {
    expect(policy).toMatch(/answer the question that was just asked/i);
    expect(policy).toMatch(/latest message/i);
  });

  it("declares repeating information normal, not a problem", () => {
    expect(policy).toMatch(/repeating yourself is part of the job/i);
    expect(policy).toMatch(/missed the message, forgot/i);
    expect(policy).toMatch(/as fully the fifth time as the first/i);
  });

  it("bans the exact phrasings, and supplies replacements", () => {
    for (const banned of [
      "You already have this information.",
      "I already told you.",
      "As mentioned earlier",
      "Why are you asking again?",
    ]) {
      expect(policy).toContain(banned);
    }
    // A prohibition with no permitted alternative just gets reworded.
    expect(policy).toMatch(/of course — here it is again/i);
    expect(policy).toMatch(/absolutely, sharing that again/i);
  });

  it("separates 'discussed earlier' from 'does not need it again'", () => {
    expect(policy).toMatch(/is not "does not need it again"/i);
    expect(policy).toMatch(/reason you CAN answer, never a reason to\s+decline/i);
  });

  it("forbids inventing past actions and assuming the message was read", () => {
    expect(policy).toMatch(/do not invent past actions/i);
    expect(policy).toMatch(/never assume the client read/i);
  });

  it("states the freshness priority order", () => {
    expect(policy).toMatch(/use the freshest reliable value/i);
    expect(policy).toMatch(/confirmed booking \/ database records/i);
    expect(policy).toMatch(/do not assert an outdated value confidently/i);
  });

  it("says what to do when the information is genuinely missing", () => {
    expect(policy).toMatch(/let me check and come back to you/i);
    expect(policy).toMatch(/never dress a gap up as the client\s+already having the answer/i);
    expect(policy).toMatch(/i'll verify it and confirm/i);
  });

  it("handles short follow-ups from context", () => {
    expect(policy).toMatch(/answer short follow-ups in context/i);
    expect(policy).toContain('"What time?"');
    expect(policy).toContain('"Where?"');
  });

  it("tells the model to answer the question, not dump everything", () => {
    expect(policy).toMatch(/answer what was asked, not everything you know/i);
    expect(policy).toMatch(/not a full dossier/i);
  });

  it("requires warmth however many times the client asks", () => {
    expect(policy).toMatch(/never become curt, defensive, impatient or\s+argumentative/i);
    expect(policy).toMatch(/however many times they ask/i);
  });

  it("outranks the surrounding prompt rather than reading as a suggestion", () => {
    expect(policy).toMatch(/outrank everything else above/i);
  });

  it("contains no banned phrase outside the list that bans it", () => {
    // Guard against the policy itself modelling the behaviour it forbids: every
    // deflection in the text must sit on a line marked as prohibited.
    const offending = policy
      .split("\n")
      .filter((line) => DEFLECTION_PATTERNS.some((re) => re.test(line)))
      .filter((line) => !/^\s*-\s*"/.test(line) && !/NEVER SAY/i.test(line));
    expect(offending).toEqual([]);
  });
});

describe("deflectionRetryInstruction", () => {
  it("quotes the offending phrase back so the retry does not reword it", () => {
    const instruction = deflectionRetryInstruction("I already told you");
    expect(instruction).toContain('"I already told you"');
    expect(instruction).toMatch(/rewrite it/i);
    expect(instruction).toMatch(/give the client the information/i);
    expect(instruction).toMatch(/do not suggest the client already has it/i);
  });
});

// ── Every concierge-side prompt carries the policy ───────────────────────────

describe("the policy reaches every AI that speaks as the concierge", () => {
  it("is in the Elia global member prompt", () => {
    expect(eliaSystemPrompt("CLIENT: Test")).toContain(CONCIERGE_CONVERSATION_CONDUCT);
  });

  it("is in the Elia client-scoped prompt", () => {
    expect(eliaClientScopedPrompt("Anya", "CLIENT: Anya")).toContain(
      CONCIERGE_CONVERSATION_CONDUCT,
    );
  });

  it("is in the Gupshup WhatsApp bot prompt", () => {
    const src = read("lib", "services", "gupshupChatbot.ts");
    expect(src).toContain("CONCIERGE_CONVERSATION_CONDUCT");
  });

  it("is NOT applied to the Academy client persona", () => {
    // There the AI plays the MEMBER, not the concierge. Its reluctance is the
    // training design — seed archetypes include "expects recall, not questions".
    // Making it endlessly accommodating would delete the drill.
    const src = read("lib", "academy", "persona.ts");
    expect(src).not.toContain("CONCIERGE_CONVERSATION_CONDUCT");
  });
});

// ── The retrieval half of the fix ────────────────────────────────────────────

describe("the bot reads the conversation that actually happened", () => {
  const src = () => read("lib", "services", "gupshupChatbot.ts");

  it("loads history from bot_messages, the authoritative transcript", () => {
    expect(src()).toContain("loadConversationHistory");
    expect(src()).toMatch(/from\("bot_messages"\)[\s\S]{0,200}?\.eq\("session_id"/);
  });

  it("no longer feeds inference the summarised context_jsonb copy", () => {
    // This was the bug: 4 turns, 200 chars a side, read straight into the model.
    // (`normalizedPhone.slice(-4)` is an unrelated log suffix — match the read.)
    expect(src()).not.toMatch(/context_jsonb\?\.last_turns as ConversationTurn/);
    expect(src()).not.toMatch(/last_turns[\s\S]{0,80}\.slice\(-4\)/);
  });

  it("does not truncate remembered messages to 200 characters", () => {
    // Truncation is what removed the answer while leaving the fact of answering.
    expect(src()).not.toMatch(/incomingText\.slice\(0,\s*200\)/);
    expect(src()).not.toMatch(/text_reply\.slice\(0,\s*200\)/);
  });

  it("remembers what was SENT, not the unused JSON fallback field", () => {
    // On image/list/buttons turns the client receives sentText, not text_reply.
    expect(src()).toMatch(/\{\s*in:\s*incomingText,\s*out:\s*sentText\s*\}/);
  });

  it("excludes the just-logged inbound message from its own context", () => {
    expect(src()).toContain("inboundMessageId");
    expect(src()).toContain("excludeMessageId");
  });

  it("keeps the 24h reset meaningful now that the transcript is permanent", () => {
    expect(src()).toContain("history_since");
    expect(src()).toMatch(/\.gte\("created_at",\s*since\)/);
  });

  it("maps human agent messages into the assistant voice", () => {
    // One voice from the client's side; dropping them would let the bot
    // contradict a colleague who already answered.
    expect(src()).toMatch(/row\.role === "user" \? "user" : "assistant"/);
  });

  it("regenerates once when a draft deflects instead of answering", () => {
    const s = src();
    expect(s).toContain("findDeflection");
    expect(s).toContain("isInformationRequest");
    expect(s).toContain("deflectionRetryInstruction");
  });
});
