/**
 * Academy model + endpoint constants.
 *
 * Atlas calls Anthropic over raw REST (matches every Elia call). Every Academy
 * call now runs on Haiku 4.5: the persona for low-latency streaming, and both
 * judges for cost. The version constants are stored on every review so scores
 * stay comparable across model/rubric upgrades — and so a scoring shift caused
 * by this tier change is visible in the data rather than invisible.
 */

/** Client-persona model — streamed, in-character, latency-sensitive. */
export const ACADEMY_PERSONA_MODEL = "claude-haiku-4-5-20251001";

/**
 * End-of-session evaluator — runs once per session against the full transcript.
 *
 * Haiku rather than Opus, deliberately: Academy's judging cost scales with every
 * request every intern handles, and at $1/$5 per million tokens this is roughly
 * a fifth of the Opus 4.8 bill. The trade is real — Opus is harder to fool on
 * the rubric, and a cheaper judge is a more inflatable one — so the version
 * stamp below moves with it, and scores either side of that line are not
 * comparable.
 */
export const ACADEMY_EVALUATOR_MODEL = "claude-haiku-4-5-20251001";

/**
 * Bump whenever the evaluator model OR the rubric/prompt changes. Persisted on
 * `training_reviews.model_version` so a later analysis can tell whether a score
 * shift is real or an artefact of an upgrade.
 */
export const ACADEMY_EVALUATOR_VERSION = "academy-eval-2@claude-haiku-4-5";

/**
 * Freshdesk ticket reviewer — judges the intern's written ticket, separately
 * from the transcript. Same tier as the evaluator, for the same reason.
 */
export const ACADEMY_TICKET_REVIEW_MODEL = "claude-haiku-4-5-20251001";

/** Bump when the ticket-review model OR its rubric/prompt changes. */
export const ACADEMY_TICKET_REVIEW_VERSION =
  // v3: judging moved from Opus 4.8 to Haiku 4.5 for cost. v2 removed the public
  // reply from the ticket, so `professionalism` and `client_satisfaction` judge
  // the write-up and the conversation. Scores across either line are not
  // comparable.
  "academy-ticket-3@claude-haiku-4-5";

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
