/**
 * Mentor cue behaviour.
 *
 * The point of these: the mentor must stay quiet most of the time, fire each cue
 * once, and always prioritise the turn budget over coaching.
 */

import { describe, it, expect } from "vitest";
import {
  nextMentorCue,
  typingDelayFor,
  type MentorCueId,
  type MentorContext,
} from "@/lib/academy/mentor";

function ctx(over: Partial<MentorContext> = {}): MentorContext {
  return {
    internTurns: 0,
    turnCap: 24,
    lastInternMessage: null,
    constraintCount: 2,
    shown: new Set<MentorCueId>(),
    ...over,
  };
}

describe("nextMentorCue", () => {
  it("opens by warning that details are hidden", () => {
    const cue = nextMentorCue(ctx());
    expect(cue?.id).toBe("opening");
    expect(cue?.text).toContain("2 details");
  });

  it("never repeats a cue it has already shown", () => {
    const shown = new Set<MentorCueId>(["opening"]);
    expect(nextMentorCue(ctx({ shown }))?.id).not.toBe("opening");
  });

  it("stays silent when there is nothing useful to say", () => {
    const shown = new Set<MentorCueId>([
      "opening",
      "first_reply",
      "good_probe",
      "no_questions",
    ]);
    expect(nextMentorCue(ctx({ internTurns: 3, lastInternMessage: "Sure.", shown }))).toBeNull();
  });

  it("calls out a promise made without asking anything", () => {
    const cue = nextMentorCue(
      ctx({ internTurns: 1, lastInternMessage: "I'll have it sorted today." }),
    );
    expect(cue?.id).toBe("no_questions");
  });

  it("recognises a genuine question", () => {
    const cue = nextMentorCue(
      ctx({ internTurns: 1, lastInternMessage: "How many covers am I booking for?" }),
    );
    expect(cue?.id).toBe("good_probe");
  });

  it("detects an ask without a question mark", () => {
    const cue = nextMentorCue(
      ctx({ internTurns: 1, lastInternMessage: "Could you confirm the party size." }),
    );
    expect(cue?.id).toBe("good_probe");
  });

  it("prioritises the turn budget over coaching", () => {
    const cue = nextMentorCue(
      ctx({ internTurns: 23, turnCap: 24, lastInternMessage: "What time?" }),
    );
    expect(cue?.id).toBe("cap_warning");
    expect(cue?.text).toContain("1 turn");
  });

  it("nudges towards closing on a long conversation", () => {
    const cue = nextMentorCue(
      ctx({
        internTurns: 9,
        lastInternMessage: "And what about parking?",
        shown: new Set<MentorCueId>(["opening", "good_probe", "running_long"]),
      }),
    );
    expect(cue?.id).toBe("ready_to_close");
  });

  it("keeps every cue to a single short sentence", () => {
    const ids: MentorCueId[] = [];
    const shown = new Set<MentorCueId>();
    for (let i = 0; i < 12; i++) {
      const cue = nextMentorCue(
        ctx({ internTurns: i, lastInternMessage: i > 0 ? "Any update?" : null, shown }),
      );
      if (!cue) continue;
      shown.add(cue.id);
      ids.push(cue.id);
      expect(cue.text.length).toBeLessThanOrEqual(90);
      expect(cue.text.split(". ").length).toBeLessThanOrEqual(2);
    }
    expect(new Set(ids).size).toBe(ids.length); // never duplicated
  });
});

describe("typingDelayFor", () => {
  it("is longer for longer messages", () => {
    expect(typingDelayFor("Yes.")).toBeLessThan(
      typingDelayFor("That works, but I need it before four and the party is now six."),
    );
  });

  it("stays inside believable bounds", () => {
    const long = "word ".repeat(200);
    expect(typingDelayFor("Ok")).toBeGreaterThanOrEqual(500);
    expect(typingDelayFor(long)).toBeLessThanOrEqual(2400);
  });
});
