/**
 * Which Anthropic account pays for Academy.
 *
 * Atlas holds keys for two separate Anthropic organizations, and on 2026-08-05
 * the one behind `ANTHROPIC_API_KEY` ran out of credit — every Academy call
 * (persona, evaluator, ticket reviewer, AI-assist) started failing with
 * "Your credit balance is too low", stranding closed sessions that could not be
 * scored and tickets that could not be submitted. `GUPSHUP_ANTHROPIC_API_KEY`
 * belongs to a funded organization, so Academy is pointed there.
 *
 * THIS IS A BILLING ARRANGEMENT, NOT AN ARCHITECTURAL ONE. Academy's spend now
 * lands on the WhatsApp bot's organization, which is not what that budget was
 * provisioned for — scoring runs on every request every intern handles. When
 * the primary organization is funded again, delete the middle candidate below
 * and Academy returns to `ANTHROPIC_API_KEY` with no other change.
 *
 * The resolution order is deliberate:
 *   1. ACADEMY_ANTHROPIC_API_KEY — an explicit, permanent home for Academy's
 *      spend. Set this and the rest of the chain stops mattering.
 *   2. GUPSHUP_ANTHROPIC_API_KEY — the funded organization. Already configured
 *      in every environment (the chatbot needs it), so this needed no new
 *      variable anywhere to take effect.
 *   3. ANTHROPIC_API_KEY — the original default, shared with Elia.
 *
 * `source` is returned alongside the key so callers can log WHICH account was
 * charged without ever logging the key itself. A silent switch between billing
 * accounts is exactly the kind of thing that should be visible in a log line.
 *
 * Pure module — reads env, no I/O.
 */

const KEY_CANDIDATES = [
  "ACADEMY_ANTHROPIC_API_KEY",
  "GUPSHUP_ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export interface AcademyApiKey {
  key: string;
  /** The env var the key came from — safe to log; the key itself is not. */
  source: (typeof KEY_CANDIDATES)[number];
}

/** First configured key in precedence order, or null when none is set. */
export function resolveAcademyApiKey(): AcademyApiKey | null {
  for (const source of KEY_CANDIDATES) {
    const key = process.env[source]?.trim();
    if (key) return { key, source };
  }
  return null;
}

/** Message for the callers that treat a missing key as fatal. */
export const ACADEMY_KEY_MISSING = `No Anthropic API key configured for Academy — set one of ${KEY_CANDIDATES.join(", ")}`;
