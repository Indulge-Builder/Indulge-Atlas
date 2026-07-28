/**
 * Academy model + endpoint constants.
 *
 * Atlas calls Anthropic over raw REST (matches every Elia call). The persona
 * (client) runs on Haiku for low-latency streaming; the evaluator runs on Opus
 * for rigorous, anti-inflation scoring. `ACADEMY_EVALUATOR_VERSION` is stored on
 * every review so scores stay comparable across model/rubric upgrades.
 */

/** Client-persona model — streamed, in-character, latency-sensitive. */
export const ACADEMY_PERSONA_MODEL = "claude-haiku-4-5-20251001";

/** End-of-session evaluator — rigorous judgment; runs once per session. */
export const ACADEMY_EVALUATOR_MODEL = "claude-opus-4-8";

/**
 * Bump whenever the evaluator model OR the rubric/prompt changes. Persisted on
 * `training_reviews.model_version` so a later analysis can tell whether a score
 * shift is real or an artefact of an upgrade.
 */
export const ACADEMY_EVALUATOR_VERSION = "academy-eval-1@claude-opus-4-8";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Max intern messages before the session auto-closes into evaluation. */
export const ACADEMY_TURN_CAP = 24;
