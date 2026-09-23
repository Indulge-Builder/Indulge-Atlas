/**
 * Conversation conduct for every AI that speaks **as the concierge**.
 *
 * ── THE FAILURE THIS EXISTS TO STOP ──────────────────────────────────────────
 *
 *   Client:  "What is the hotel address?"
 *   AI:      "You already have the information."
 *
 * That answer is never acceptable, and it is not primarily a tone problem — it
 * is what a model says when its own transcript tells it *that* it answered but
 * no longer contains *what* it answered. Give a model a history of
 * `assistant: "Here are three options…"` with the options truncated away and it
 * will reliably assert that the details were already shared. So this module is
 * one half of the fix; the other half is feeding the model the real transcript
 * (see `loadConversationHistory` in `lib/services/gupshupChatbot.ts`).
 *
 * ── WHO THIS APPLIES TO ──────────────────────────────────────────────────────
 * The concierge-side AIs: the Gupshup WhatsApp bot (Elia talking to a real
 * client) and Elia chat (answering staff questions about members).
 *
 * It deliberately does NOT apply to the Academy client persona
 * (`lib/academy/persona.ts`). There the AI plays the *member*, not the
 * concierge, and its reluctance is the training design — a member who "expects
 * recall, not questions" is a difficulty the intern is meant to handle. Applying
 * a be-endlessly-accommodating policy to it would delete the drill.
 *
 * Pure module — no I/O, no "use server". Imported by prompt builders and tests.
 */

/**
 * The conduct block appended to every concierge-side system prompt.
 *
 * Written as behaviour, not etiquette: each rule says what to DO, because a
 * model given only prohibitions still needs a permitted action to fall back on.
 */
export const CONCIERGE_CONVERSATION_CONDUCT = `ANSWERING THE CLIENT — THESE RULES OUTRANK EVERYTHING ELSE ABOVE:

1. ANSWER THE QUESTION THAT WAS JUST ASKED. The client's latest message is the
   request you are serving. Identify what they asked for, find it, and give it.
   Never audit whether they "should" already have it — that is not your call.

2. REPEATING YOURSELF IS PART OF THE JOB, NOT A PROBLEM. A client re-asks
   because they missed the message, forgot, want confirmation, are checking
   whether something changed, or are forwarding it to someone else. All of these
   are normal. Answer as fully the fifth time as the first.

3. NEVER SAY ANY OF THESE, IN ANY WORDING:
   - "You already have this information."
   - "I already told you." / "I already sent that." / "I already shared that."
   - "As I said before…" / "As mentioned earlier…"
   - "You were already told this." / "Why are you asking again?"
   Say this instead, then immediately give the answer:
   - "Of course — here it is again."
   - "Certainly. The booking is at 8:00 PM."
   - "Absolutely, sharing that again."

4. "DISCUSSED EARLIER" IS NOT "DOES NOT NEED IT AGAIN". That a fact appears
   earlier in this conversation is a reason you CAN answer, never a reason to
   decline. Retrieve it and state it.

5. DO NOT INVENT PAST ACTIONS. Only refer to something you sent if it is
   actually present in the conversation above. Never claim you sent, confirmed
   or explained something you cannot see. And never assume the client read,
   received or understood a message just because it was sent — those are
   different things.

6. USE THE FRESHEST RELIABLE VALUE. When sources disagree, prefer, in order:
   (a) confirmed booking / database records, (b) verified request or ticket
   records, (c) the most recent thing said in this conversation, (d) older
   messages. If a newer confirmed value contradicts something said earlier, give
   the newer value. If you genuinely cannot tell which is current, say so and
   offer to confirm — do not assert an outdated value confidently.

7. WHEN YOU DO NOT HAVE IT, SAY THAT — and never dress a gap up as the client
   already having the answer. Correct:
   - "I don't have the confirmed address yet — let me check and come back to you."
   - "I don't have that detail to hand. I'll verify it and confirm."
   Not correct, and never acceptable as a substitute for either of those:
   - "You already have this information."

8. ANSWER SHORT FOLLOW-UPS IN CONTEXT. After "Your reservation is at Zuma,
   8 PM": "What time?" → "8 PM." · "Where?" → "Zuma." · "Send it again." →
   resend the relevant details. Resolve the reference from the conversation
   rather than asking what they mean.

9. ANSWER WHAT WAS ASKED, NOT EVERYTHING YOU KNOW. "What time is dinner?" gets
   the time, not a full dossier of hotel, address, booking reference, guest count
   and payment status. Add surrounding detail only when it is actually needed.

10. STAY WARM THROUGHOUT. Never become curt, defensive, impatient or
    argumentative with a client, however many times they ask. Patience is the
    service.`;

/**
 * Phrasings that must never reach a client.
 *
 * Used three ways: pinned by tests, checked at runtime as a safety net, and
 * quoted back to the model when a reply has to be regenerated. Each pattern
 * targets the *deflection* — a claim about the client's prior knowledge offered
 * in place of an answer.
 */
export const DEFLECTION_PATTERNS: readonly RegExp[] = [
  /\byou\s+(?:already\s+)?(?:have|got|received|were\s+(?:given|told|sent))\s+(?:this|that|the|these|those|it)\b[^.?!]*\b(?:information|details?|already)\b/i,
  /\byou\s+already\s+(?:have|know|got|received|asked|were)\b/i,
  // "You were already told this" — the adverb sits after the verb here, so the
  // pattern above misses it.
  /\byou\s+(?:were|have\s+been)\s+already\s+(?:told|sent|given|shown|provided)\b/i,
  /\bi\s+(?:have\s+)?already\s+(?:told|sent|shared|given|provided|mentioned|said|explained|confirmed)\b/i,
  /\bi\s+(?:told|sent|shared|gave|provided)\s+you\s+(?:this|that|it|those|these)\s+(?:already|before|earlier)\b/i,
  /\bas\s+(?:i\s+)?(?:said|mentioned|stated|explained|noted)\s+(?:before|earlier|already|previously)\b/i,
  /\bas\s+(?:previously|already)\s+(?:mentioned|stated|said|shared|sent)\b/i,
  /\bwhy\s+are\s+you\s+asking\s+(?:me\s+)?(?:this\s+)?again\b/i,
  /\byou\s+(?:have\s+)?asked\s+(?:me\s+)?(?:this|that)\s+(?:already|before)\b/i,
  /\b(?:this|that)\s+(?:was|has\s+been)\s+already\s+(?:sent|shared|provided|answered)\b/i,
];

/**
 * The offending phrase, or null when the reply is clean.
 *
 * Returns the match rather than a boolean so callers can log exactly what the
 * model produced — "a deflection was detected" is not a diagnosable log line.
 */
export function findDeflection(text: string | null | undefined): string | null {
  const body = (text ?? "").trim();
  if (!body) return null;
  for (const pattern of DEFLECTION_PATTERNS) {
    const hit = pattern.exec(body);
    if (hit) return hit[0];
  }
  return null;
}

/**
 * Does this message ask for something?
 *
 * Deliberately generous. A false positive costs one extra guarded regeneration
 * on an already-clean reply; a false negative lets "you already have that"
 * through to a client. The asymmetry decides the tuning.
 */
export function isInformationRequest(text: string | null | undefined): boolean {
  const body = (text ?? "").trim().toLowerCase();
  if (!body) return false;
  if (body.includes("?")) return true;

  return [
    // Interrogatives, including the bare follow-up forms ("what time?", "where?")
    /^(?:what|when|where|which|who|whose|how|why)\b/,
    /\b(?:what|when|where|which|who)\s+(?:is|are|was|were|time|address|name|price|number)\b/,
    /\bhow\s+(?:much|many|long)\b/,
    // Explicit re-send requests — the exact case that used to be refused
    /\b(?:send|share|resend|forward|give|tell|show)\s+(?:me|it|that|them|us)?\s*(?:the\s+\w+\s*)?(?:again|once\s+more|one\s+more\s+time)\b/,
    // "resend the details please" — a re-send request carries no "again"
    /\bre-?send\b/,
    /\b(?:again|once\s+more)\b.*\b(?:please|pls)\b/,
    /\bcan\s+you\s+(?:send|share|resend|confirm|tell|give|remind)\b/,
    /\b(?:remind|confirm)\s+me\b/,
    /\blet\s+me\s+know\s+(?:the|what|when|where)\b/,
    /\bi\s+(?:need|want)\s+(?:the|that|those|it)\b/,
    /\bplease\s+(?:send|share|resend|confirm|repeat)\b/,
  ].some((re) => re.test(body));
}

/**
 * Corrective instruction for the one guarded retry.
 *
 * Names the exact offending phrase: a generic "be more helpful" nudge tends to
 * produce the same deflection reworded.
 */
export function deflectionRetryInstruction(offendingPhrase: string): string {
  return `Your previous draft replied with "${offendingPhrase}", which tells the client what they supposedly already know instead of answering them. That is never acceptable.

Rewrite it. Give the client the information they just asked for, taken from the conversation above or from the data you were given. Open with something like "Of course — here it is again," and then state the actual detail. If you genuinely do not have the information, say plainly that you will check and confirm it — do not suggest the client already has it.`;
}
