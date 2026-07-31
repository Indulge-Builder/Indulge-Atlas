/**
 * Estimated AI assistance for a trainee's submitted reply.
 *
 * Two independent things live here, and keeping them apart is the whole design:
 *
 *   1. STYLE ESTIMATE — a model's opinion of how machine-like the writing reads.
 *      It is an opinion. It cannot observe provenance, and it is not evidence
 *      that any particular tool was used.
 *   2. COMPOSITION SIGNALS — what the editor actually observed: characters
 *      pasted vs typed, how large the biggest paste was, how long the trainee
 *      waited before the first keystroke. These are facts about the editing
 *      session and nothing more. A paste is a paste; it is not an accusation.
 *
 * They are never blended into one number. The headline percentage is the style
 * estimate alone; composition signals sit beside it so a reviewer can see what
 * the estimate is and is not based on.
 *
 * ── On accuracy ──────────────────────────────────────────────────────────────
 * Detectors of this kind are unreliable in general and least reliable on short
 * text — and Academy replies are WhatsApp-length by design. `MIN_WORDS_FOR_ESTIMATE`
 * is the guard: below it no number is produced at all, because a score on an
 * eight-word reply would be noise wearing a percentage sign. Those responses are
 * recorded as `insufficient_text` and excluded from every average, rather than
 * being scored at some invented midpoint.
 *
 * Nothing here decides anything about a trainee. It is a coaching signal.
 */

// ── Bands ─────────────────────────────────────────────────────────────────────

export type AiAssistanceBandId = "low" | "moderate" | "high" | "very_high";

export interface AiAssistanceBand {
  id: AiAssistanceBandId;
  label: string;
  /** Inclusive lower bound, 0–100. */
  min: number;
  /** Inclusive upper bound, 0–100. */
  max: number;
}

export const AI_ASSISTANCE_BANDS: AiAssistanceBand[] = [
  { id: "low", label: "Low estimated AI assistance", min: 0, max: 20 },
  { id: "moderate", label: "Moderate", min: 21, max: 50 },
  { id: "high", label: "High", min: 51, max: 75 },
  { id: "very_high", label: "Very high", min: 76, max: 100 },
];

/** At or above this, a response counts as "high AI-assistance" in the rollups. */
export const HIGH_ASSISTANCE_THRESHOLD = 51;

/**
 * Below this word count no estimate is produced. Short-text detection is the
 * weakest case for every method available, and a concierge reply is often one
 * sentence — scoring those would manufacture precision that does not exist.
 */
export const MIN_WORDS_FOR_ESTIMATE = 12;

export function bandFor(percent: number): AiAssistanceBand {
  const p = clampPercent(percent);
  // Last band wins the 100 edge; bands are contiguous and ordered.
  return (
    AI_ASSISTANCE_BANDS.find((b) => p >= b.min && p <= b.max) ??
    AI_ASSISTANCE_BANDS[AI_ASSISTANCE_BANDS.length - 1]
  );
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Whether a reply is long enough for an estimate to mean anything. */
export function isEstimable(text: string): boolean {
  return wordCount(text) >= MIN_WORDS_FOR_ESTIMATE;
}

// ── Composition signals (observed facts, not inferences) ──────────────────────

/**
 * Raw counters collected by the composer while the trainee wrote the reply.
 * Every field is something the browser genuinely observed.
 */
export interface CompositionInput {
  /** Number of paste events during composition. */
  pasteCount: number;
  /** Total characters introduced by paste events. */
  pastedChars: number;
  /** Largest single paste, in characters. */
  largestPasteChars: number;
  /** Characters entered by keystroke. */
  typedChars: number;
  /** Milliseconds from opening the composer to the first keystroke or paste. */
  timeToFirstInputMs: number | null;
  /** Milliseconds from first input to submit. */
  compositionMs: number | null;
  /** Length of the text actually submitted. */
  finalChars: number;
}

export interface CompositionSignals extends CompositionInput {
  /** Share of the submitted text that arrived by paste, 0–100. */
  pastedSharePercent: number;
  /** Largest single paste as a share of the submitted text, 0–100. */
  largestPasteSharePercent: number;
  /** True when one paste supplied most of the reply. A fact, not a verdict. */
  singleLargePaste: boolean;
}

/** A single paste supplying at least this share of the reply is worth surfacing. */
export const LARGE_PASTE_SHARE = 60;

export function summariseComposition(input: CompositionInput): CompositionSignals {
  // Guard the denominator: a submitted reply always has length, but a caller
  // replaying historic rows might not.
  const denominator = Math.max(1, input.finalChars);
  const pastedSharePercent = clampPercent((input.pastedChars / denominator) * 100);
  const largestPasteSharePercent = clampPercent(
    (input.largestPasteChars / denominator) * 100,
  );

  return {
    ...input,
    pastedSharePercent,
    largestPasteSharePercent,
    singleLargePaste: largestPasteSharePercent >= LARGE_PASTE_SHARE,
  };
}

// ── A scored response ─────────────────────────────────────────────────────────

export type AiAssistanceOutcome = "estimated" | "insufficient_text" | "unavailable";

export interface AiAssistanceRecord {
  turnId: string;
  sessionId: string;
  internId: string;
  /** The curriculum request this reply belongs to, for per-task rollups. */
  seedId: string | null;
  /** Null unless outcome === "estimated". */
  percent: number | null;
  outcome: AiAssistanceOutcome;
  /** One short sentence from the judge. Never an accusation of tool use. */
  rationale: string | null;
  signals: CompositionSignals | null;
  /** Model + prompt version, so a later shift can be told from a re-tune. */
  modelVersion: string | null;
  createdAt: string;
}

// ── Rollups ───────────────────────────────────────────────────────────────────

export interface AiAssistanceSummary {
  /** Responses that produced a usable estimate. Averages are over these only. */
  analysed: number;
  /** Responses skipped for being too short to judge. */
  skippedTooShort: number;
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
  /** Responses at or above HIGH_ASSISTANCE_THRESHOLD. */
  highAssistanceCount: number;
  /** Those as a share of analysed responses, 0–100. */
  highAssistancePercent: number | null;
  /** Responses that arrived largely via a single paste. Observed, not inferred. */
  largePasteCount: number;
}

const EMPTY_SUMMARY: AiAssistanceSummary = {
  analysed: 0,
  skippedTooShort: 0,
  averagePercent: null,
  highestPercent: null,
  lowestPercent: null,
  highAssistanceCount: 0,
  highAssistancePercent: null,
  largePasteCount: 0,
};

export function summariseAiAssistance(
  records: AiAssistanceRecord[],
): AiAssistanceSummary {
  if (records.length === 0) return { ...EMPTY_SUMMARY };

  const scored = records.filter(
    (r): r is AiAssistanceRecord & { percent: number } =>
      r.outcome === "estimated" && typeof r.percent === "number",
  );

  const skippedTooShort = records.filter(
    (r) => r.outcome === "insufficient_text",
  ).length;
  const largePasteCount = records.filter((r) => r.signals?.singleLargePaste).length;

  if (scored.length === 0) {
    return { ...EMPTY_SUMMARY, skippedTooShort, largePasteCount };
  }

  const values = scored.map((r) => r.percent);
  const high = values.filter((v) => v >= HIGH_ASSISTANCE_THRESHOLD).length;

  return {
    analysed: scored.length,
    skippedTooShort,
    averagePercent: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    highestPercent: Math.max(...values),
    lowestPercent: Math.min(...values),
    highAssistanceCount: high,
    highAssistancePercent: Math.round((high / scored.length) * 100),
    largePasteCount,
  };
}

export interface AiAssistanceByTask {
  seedId: string;
  analysed: number;
  averagePercent: number;
}

/** Mean estimate per curriculum request, for the per-task breakdown. */
export function aiAssistanceByTask(
  records: AiAssistanceRecord[],
): AiAssistanceByTask[] {
  const bySeed = new Map<string, number[]>();

  for (const r of records) {
    if (r.outcome !== "estimated" || typeof r.percent !== "number") continue;
    if (!r.seedId) continue;
    const bucket = bySeed.get(r.seedId) ?? [];
    bucket.push(r.percent);
    bySeed.set(r.seedId, bucket);
  }

  return [...bySeed.entries()]
    .map(([seedId, values]) => ({
      seedId,
      analysed: values.length,
      averagePercent: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    }))
    .sort((a, b) => a.seedId.localeCompare(b.seedId));
}

export interface AiAssistancePoint {
  /** ISO timestamp of the response. */
  at: string;
  percent: number;
}

/**
 * Chronological series for the trainee timeline — one point per estimated
 * response, oldest first, so a reviewer can see the trend rather than one number.
 */
export function aiAssistanceTimeline(
  records: AiAssistanceRecord[],
): AiAssistancePoint[] {
  return records
    .filter(
      (r): r is AiAssistanceRecord & { percent: number } =>
        r.outcome === "estimated" && typeof r.percent === "number",
    )
    .map((r) => ({ at: r.createdAt, percent: r.percent }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Shown wherever a percentage is displayed. Required, not decorative. */
export const AI_ASSISTANCE_DISCLAIMER =
  "This is an AI-generated estimate and may not always be accurate.";

/** Longer form for tooltips and the admin profile. */
export const AI_ASSISTANCE_EXPLAINER =
  "Estimated AI assistance reflects how machine-like the writing reads. It cannot " +
  "detect which tool was used, or whether one was used at all, and it is least " +
  "reliable on short replies. Treat it as a coaching prompt, never as proof.";
