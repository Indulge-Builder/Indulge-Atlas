/**
 * Split a long client message into the two-to-four bubbles a real person would
 * actually send.
 *
 * DISPLAY ONLY. The turn stays one row in `training_turns` — append-only, and
 * the record the evaluator, the ticket reviewer and the persona prompt all read.
 * Splitting for the eye and leaving the transcript alone means this change
 * cannot move a score or alter what the persona believes it said.
 *
 * Hidden constraints are untouched by this. The chunks are the request the seed
 * already opens with; anything the seed holds back stays held back until the
 * trainee probes for it, which is the skill being graded.
 */

/** Below this, a message is already message-length and is left alone. */
export const SPLIT_MIN_CHARS = 180;

/** A person sends a few lines, not a wall and not a stream. */
export const SPLIT_MAX_CHUNKS = 4;

/** Never emit a fragment shorter than this — it reads as a stutter. */
export const SPLIT_MIN_CHUNK_CHARS = 40;

/**
 * Sentence boundaries, keeping the terminator. Deliberately conservative: it
 * breaks on . ! ? followed by whitespace, so decimals, "e.g." and initials in
 * "AP Code 11.59" survive intact — those appear verbatim in the register and
 * must not be sliced mid-reference.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(₹"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Group sentences into at most `maxChunks` bubbles of roughly even length.
 *
 * Even-ish rather than greedy: a greedy fill produces one fat opening bubble and
 * a trailing scrap, which reads like a paste rather than someone typing.
 */
export function splitClientMessage(
  text: string,
  { maxChunks = SPLIT_MAX_CHUNKS }: { maxChunks?: number } = {},
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length < SPLIT_MIN_CHARS) return [trimmed];

  const parts = sentences(trimmed);
  if (parts.length <= 1) return [trimmed];

  const target = Math.min(maxChunks, parts.length);
  const perChunk = Math.ceil(trimmed.length / target);

  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    // Start a new bubble once this one is full — unless we are on the last
    // allowed bubble, which must absorb the remainder rather than drop it.
    if (
      current &&
      candidate.length > perChunk &&
      chunks.length < target - 1
    ) {
      chunks.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  // Fold away any runt produced by an awkward sentence distribution.
  return chunks.reduce<string[]>((acc, chunk) => {
    if (acc.length > 0 && chunk.length < SPLIT_MIN_CHUNK_CHARS) {
      acc[acc.length - 1] = `${acc[acc.length - 1]} ${chunk}`;
      return acc;
    }
    acc.push(chunk);
    return acc;
  }, []);
}

/** Gap before the next bubble, in ms. Randomised so it never feels metronomic. */
export const CHUNK_MIN_DELAY_MS = 20_000;
export const CHUNK_MAX_DELAY_MS = 45_000;

export function chunkDelay(rng: () => number = Math.random): number {
  const span = CHUNK_MAX_DELAY_MS - CHUNK_MIN_DELAY_MS;
  return CHUNK_MIN_DELAY_MS + Math.floor(rng() * span);
}
