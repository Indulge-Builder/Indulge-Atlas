/**
 * Academy model + endpoint constants.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ATLAS MODEL POLICY: HAIKU ONLY. Never Opus, never Sonnet, never Fable.   │
 * │ This is a standing product decision, not a tuning knob — it holds for    │
 * │ every Anthropic call in this repo (Academy, Elia, Gupshup, Freshdesk).   │
 * │ Do not "upgrade" a call because a task looks hard; make the prompt       │
 * │ better or bound the input instead.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Atlas calls Anthropic over raw REST (matches every Elia call). Academy runs
 * on ONE model — Haiku 4.5 ($1/$5 per MTok) — end to end: the client persona,
 * the AI-assist style estimator, the end-of-session evaluator and the Freshdesk
 * ticket reviewer. The judges once sat a tier up (Opus 4.8, then Sonnet 5) on
 * the argument that scoring resists inflation better on a stronger model. That
 * is settled: the whole Academy is single-tier, so cost is bounded by the
 * cheapest tier no matter how many interns run at once. All four Anthropic keys
 * bill one org cap, so a judge on a higher tier does not spend its own budget —
 * it starves Elia and the Gupshup bot.
 *
 * Two things carry the weight the model tier used to:
 *   - The judges' prompts are bounded (`judgeTranscript` caps per-turn and
 *     whole-transcript length), so a judge reads a fixed-size transcript.
 *   - The pass decision is NOT the model's. `computeTicketQuality` /
 *     `decidePassed` recompute it in code, and a model "pass" can only ever be
 *     downgraded — a softer judge cannot hand out progress.
 *
 * The version constants are stored on every review so scores stay comparable
 * across model/rubric changes — a tier change is visible in the data, and
 * scores from two different tiers must never be compared as one series.
 *
 * NB: Haiku 4.5 has a 200K context window (the Sonnet/Opus tiers have 1M).
 * The judge caps keep every prompt far under that, but a future change that
 * lifts them has to re-check the ceiling.
 */

/** Client-persona model — streamed, in-character, latency-sensitive. */
export const ACADEMY_PERSONA_MODEL = "claude-haiku-4-5-20251001";

/**
 * End-of-session evaluator — runs once per session against the full transcript.
 * Haiku like everything else in Academy; the transcript it reads is capped and
 * the overall score is computed in code, not taken from the model.
 */
export const ACADEMY_EVALUATOR_MODEL = "claude-haiku-4-5-20251001";

/**
 * Bump whenever the evaluator model OR the rubric/prompt changes. Persisted on
 * `training_reviews.model_version` so a later analysis can tell whether a score
 * shift is real or an artefact of a tier change.
 * History: eval-1 Opus 4.8 → eval-2 Haiku 4.5 (cost stopgap) → eval-3 Sonnet 5
 * → eval-4 Haiku 4.5 (Academy is single-tier by decision).
 */
export const ACADEMY_EVALUATOR_VERSION = "academy-eval-4@claude-haiku-4-5";

/**
 * Freshdesk ticket reviewer — judges the intern's written ticket, separately
 * from the transcript. Same model as the evaluator: a split would make the two
 * halves of one request's score incomparable.
 */
export const ACADEMY_TICKET_REVIEW_MODEL = "claude-haiku-4-5-20251001";

/** Bump when the ticket-review model OR its rubric/prompt changes. */
export const ACADEMY_TICKET_REVIEW_VERSION =
  // v5: Haiku, matching the evaluator (v4 Sonnet 5; v3 a brief Haiku stopgap;
  // v2 removed the public reply from the ticket). Scores across any line are
  // not comparable.
  "academy-ticket-5@claude-haiku-4-5";

/**
 * Does this model accept `output_config.effort`?
 *
 * It is NOT universal, and getting this wrong is a hard failure rather than a
 * degraded one: Haiku 4.5 and Sonnet 4.5 reject the parameter outright, so a
 * request carrying it 400s before the model ever sees the prompt. Both judges
 * are on Haiku today, so nothing sends `effort` — this stays a capability check
 * rather than a constant so a future tier move re-enables it (and a move back
 * to Haiku disables it) without touching the call sites.
 */
export function modelSupportsEffort(model: string): boolean {
  return !/^claude-(haiku-4-5|sonnet-4-5)/.test(model);
}

/**
 * Style estimator for the AI-assistance signal. Runs once per submitted reply
 * rather than once per session, and the judgment is a shallow read of register
 * — not the deep rubric work the evaluator does.
 */
export const ACADEMY_AI_ASSIST_MODEL = "claude-haiku-4-5-20251001";

/** Bump when the estimator model OR its prompt changes. Stored on every row. */
export const ACADEMY_AI_ASSIST_VERSION = "academy-aiassist-1@claude-haiku-4-5";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Max intern messages before the session auto-closes into evaluation. */
export const ACADEMY_TURN_CAP = 24;
