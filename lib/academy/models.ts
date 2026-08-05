/**
 * Academy model + endpoint constants.
 *
 * Atlas calls Anthropic over raw REST (matches every Elia call). The tiering is
 * deliberate and two-level:
 *
 *   TALKING + LOW-EFFORT  → Haiku 4.5   ($1/$5 per MTok)
 *     The client persona (streamed, latency-sensitive, 200-token replies) and
 *     the AI-assist style estimator (one shallow read per submitted reply).
 *     These run on every message, so they sit on the cheapest tier.
 *
 *   PROCESSING + JUDGMENT → Sonnet 5    ($3/$15; intro $2/$10 to 2026-08-31)
 *     The end-of-session evaluator and the Freshdesk ticket reviewer. These
 *     gate progress and have to resist score inflation, so they get the
 *     stronger model — but they run once per session/ticket, not per message,
 *     so the cost lands where the leverage is.
 *
 * The version constants are stored on every review so scores stay comparable
 * across model/rubric upgrades — a tier change is visible in the data.
 */

/** Client-persona model — streamed, in-character, latency-sensitive. */
export const ACADEMY_PERSONA_MODEL = "claude-haiku-4-5-20251001";

/**
 * End-of-session evaluator — runs once per session against the full transcript.
 * Sonnet-tier judgment: near-Opus scoring rigour at a fifth of Opus cost, and
 * it accepts `effort` so the depth is tunable.
 */
export const ACADEMY_EVALUATOR_MODEL = "claude-sonnet-5";

/**
 * Bump whenever the evaluator model OR the rubric/prompt changes. Persisted on
 * `training_reviews.model_version` so a later analysis can tell whether a score
 * shift is real or an artefact of an upgrade.
 * History: eval-1 Opus 4.8 → eval-2 Haiku 4.5 (hours, cost stopgap) → eval-3.
 */
export const ACADEMY_EVALUATOR_VERSION = "academy-eval-3@claude-sonnet-5";

/**
 * Freshdesk ticket reviewer — judges the intern's written ticket, separately
 * from the transcript. Same tier as the evaluator: it gates completion, so it
 * has to be as hard to fool.
 */
export const ACADEMY_TICKET_REVIEW_MODEL = "claude-sonnet-5";

/** Bump when the ticket-review model OR its rubric/prompt changes. */
export const ACADEMY_TICKET_REVIEW_VERSION =
  // v4: judging settled on Sonnet 5 (v3 was a brief Haiku stopgap; v2 removed
  // the public reply from the ticket). Scores across any line are not
  // comparable.
  "academy-ticket-4@claude-sonnet-5";

/**
 * Does this model accept `output_config.effort`?
 *
 * It is NOT universal, and getting this wrong is a hard failure rather than a
 * degraded one: Haiku 4.5 and Sonnet 4.5 reject the parameter outright, so a
 * request carrying it 400s before the model ever sees the prompt. The judges
 * send `effort: "medium"` on Opus-tier models and must omit it on Haiku — hence
 * a capability check rather than a constant.
 */
export function modelSupportsEffort(model: string): boolean {
  return !/^claude-(haiku-4-5|sonnet-4-5)/.test(model);
}

/**
 * Style estimator for the AI-assistance signal. Haiku, not Opus: this runs once
 * per submitted reply rather than once per session, and the judgment is a
 * shallow read of register — not the deep rubric work the evaluator does.
 */
export const ACADEMY_AI_ASSIST_MODEL = "claude-haiku-4-5-20251001";

/** Bump when the estimator model OR its prompt changes. Stored on every row. */
export const ACADEMY_AI_ASSIST_VERSION = "academy-aiassist-1@claude-haiku-4-5";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Max intern messages before the session auto-closes into evaluation. */
export const ACADEMY_TURN_CAP = 24;
