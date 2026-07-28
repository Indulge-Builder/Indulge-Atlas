/**
 * The mentor's in-conversation cues.
 *
 * The mentor speaks inside the thread rather than in a panel above it, so
 * guidance arrives when it is useful instead of all at once before the intern
 * has read anything.
 *
 * ── MENTOR LINES ARE NEVER PERSISTED ─────────────────────────────────────────
 * They are UI only. `training_turns` is the append-only transcript the evaluator
 * grades, and coaching in that transcript would both pollute the score and teach
 * the persona to expect a coach in the room. Cues live in component state and
 * die with the mount — deliberately.
 *
 * Pure module: given the state of a conversation, return the line to show. No
 * model call, so a cue is instant and can never pad or ramble.
 */

export type MentorCueId =
  | "opening"
  | "first_reply"
  | "no_questions"
  | "good_probe"
  | "running_long"
  | "cap_warning"
  | "ready_to_close";

export interface MentorCue {
  id: MentorCueId;
  /** One short sentence. Never a paragraph. */
  text: string;
}

/** Rough "did they ask something" test — a question mark or an ask verb. */
function looksLikeAQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  return /\b(could you|can you|may i|would you|do you|what|when|where|which|how many|how much)\b/i.test(
    text,
  );
}

export interface MentorContext {
  /** Intern messages sent so far. */
  internTurns: number;
  turnCap: number;
  /** The intern's most recent message, if any. */
  lastInternMessage: string | null;
  /** How many of the seed's hidden constraints exist. */
  constraintCount: number;
  /** Cue ids already shown this session — each fires at most once. */
  shown: Set<MentorCueId>;
}

/**
 * The single most useful thing to say right now, or null to stay quiet.
 *
 * Order matters: the checks run most-urgent first, and only one cue is ever
 * returned. A mentor who comments on every message stops being read.
 */
export function nextMentorCue(ctx: MentorContext): MentorCue | null {
  const remaining = ctx.turnCap - ctx.internTurns;
  const seen = (id: MentorCueId) => ctx.shown.has(id);

  // Opening framing — fires once, before the intern has said anything.
  if (ctx.internTurns === 0 && !seen("opening")) {
    return {
      id: "opening",
      text:
        ctx.constraintCount > 0
          ? `They haven't told you everything. ${ctx.constraintCount === 1 ? "One detail" : `${ctx.constraintCount} details`} only come out if you ask.`
          : "Read what they actually need before you promise anything.",
    };
  }

  // Turn budget is nearly gone — this outranks any coaching.
  if (remaining <= 2 && remaining > 0 && !seen("cap_warning")) {
    return {
      id: "cap_warning",
      text: `${remaining} ${remaining === 1 ? "turn" : "turns"} left. Land the outcome and close.`,
    };
  }

  // A long conversation with no close in sight.
  if (ctx.internTurns >= 8 && !seen("ready_to_close")) {
    return {
      id: "ready_to_close",
      text: "You have enough to act on. Confirm the next step and close it.",
    };
  }

  if (ctx.lastInternMessage) {
    const asked = looksLikeAQuestion(ctx.lastInternMessage);

    // Straight to a promise without probing — the most common failure.
    if (!asked && ctx.internTurns === 1 && ctx.constraintCount > 0 && !seen("no_questions")) {
      return {
        id: "no_questions",
        text: "You committed without asking. What don't you know yet?",
      };
    }

    if (asked && !seen("good_probe")) {
      return {
        id: "good_probe",
        text: "Good question — that is how the detail comes out.",
      };
    }

    if (ctx.internTurns === 1 && !seen("first_reply")) {
      return {
        id: "first_reply",
        text: "Keep it short and specific, the way you would on WhatsApp.",
      };
    }
  }

  if (ctx.internTurns >= 5 && ctx.internTurns < 8 && !seen("running_long")) {
    return {
      id: "running_long",
      text: "Start moving towards an outcome rather than more questions.",
    };
  }

  return null;
}

/**
 * How long a message should appear to be typed, in ms.
 *
 * Scaled by length so a one-liner lands quickly and a longer reply takes a
 * beat, bounded at both ends: under ~400ms reads as instant and breaks the
 * illusion, over ~2.4s feels like the app has hung.
 */
export function typingDelayFor(text: string, opts?: { min?: number; max?: number }): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const raw = 420 + words * 55;
  return Math.min(opts?.max ?? 2400, Math.max(opts?.min ?? 500, raw));
}
