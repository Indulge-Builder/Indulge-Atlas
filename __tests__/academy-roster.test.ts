/**
 * Real-client roster assignment.
 *
 * The properties that matter: a task always resolves to the same member, the
 * academy still works with no client records at all, and contact details never
 * leak into the shape the UI receives.
 */

import { describe, it, expect } from "vitest";
import {
  buildRoster,
  displayName,
  formatMembership,
  initialsFor,
  memberFor,
  orderRoster,
  type RosterClient,
} from "@/lib/academy/roster";

function client(over: Partial<RosterClient> & { id: string }): RosterClient {
  return {
    first_name: "Ada",
    last_name: "Rao",
    avatar_url: null,
    membership_type: null,
    membership_status: null,
    ...over,
  };
}

const ROSTER: RosterClient[] = orderRoster([
  client({ id: "c3", first_name: "Meera", last_name: "Iyer" }),
  client({ id: "c1", first_name: "Arjun", last_name: "Bhatia" }),
  client({ id: "c2", first_name: "Sana", last_name: "Kapoor" }),
]);

describe("assignment", () => {
  it("is deterministic — the same task always yields the same member", () => {
    const a = memberFor(ROSTER, 2);
    const b = memberFor(ROSTER, 2);
    expect(a.clientId).toBe(b.clientId);
    expect(a.name).toBe(b.name);
  });

  it("orders by id, so renaming a client cannot reshuffle the roster", () => {
    const renamed = orderRoster(
      ROSTER.map((c) => (c.id === "c1" ? { ...c, first_name: "Zzz" } : c)),
    );
    expect(memberFor(renamed, 1).clientId).toBe(memberFor(ROSTER, 1).clientId);
  });

  it("gives distinct tasks distinct members while the roster lasts", () => {
    const ids = [1, 2, 3].map((n) => memberFor(ROSTER, n).clientId);
    expect(new Set(ids).size).toBe(3);
  });

  it("wraps rather than inventing people when tasks outnumber clients", () => {
    expect(memberFor(ROSTER, 4).clientId).toBe(memberFor(ROSTER, 1).clientId);
  });

  it("treats task 0 and negatives as the first task rather than crashing", () => {
    expect(memberFor(ROSTER, 0).clientId).toBe(memberFor(ROSTER, 1).clientId);
    expect(memberFor(ROSTER, -5).clientId).toBe(memberFor(ROSTER, 1).clientId);
  });
});

describe("fallback", () => {
  it("still produces a usable member when no client records exist", () => {
    const m = memberFor([], 7);
    expect(m.isReal).toBe(false);
    expect(m.clientId).toBeNull();
    expect(m.name.length).toBeGreaterThan(0);
    expect(m.initials.length).toBeGreaterThan(0);
  });

  it("marks real records as real", () => {
    expect(memberFor(ROSTER, 1).isReal).toBe(true);
  });

  it("never returns an empty name even from a blank record", () => {
    const blank = [client({ id: "x", first_name: null, last_name: null })];
    expect(memberFor(blank, 1).name).toBe("Indulge member");
  });
});

describe("presentation", () => {
  it("composes a display name from the parts present", () => {
    expect(displayName(client({ id: "a" }))).toBe("Ada Rao");
    expect(displayName(client({ id: "a", last_name: null }))).toBe("Ada");
    expect(displayName(client({ id: "a", first_name: "  ", last_name: "Rao" }))).toBe("Rao");
  });

  it("derives initials from first and last name", () => {
    expect(initialsFor("Meera Iyer")).toBe("MI");
    expect(initialsFor("Meera Devi Iyer")).toBe("MI");
    expect(initialsFor("Meera")).toBe("ME");
    expect(initialsFor("   ")).toBe("?");
  });

  it("tidies a membership tier for display", () => {
    expect(formatMembership("annual_gold")).toBe("Annual Gold");
    expect(formatMembership(null)).toBeNull();
  });

  it("surfaces avatar and membership from the real record", () => {
    const m = memberFor(
      [client({ id: "a", avatar_url: "https://x/y.jpg", membership_type: "elite" })],
      1,
    );
    expect(m.avatarUrl).toBe("https://x/y.jpg");
    expect(m.membershipType).toBe("elite");
  });

  it("exposes no contact fields on the member shape", () => {
    const keys = Object.keys(memberFor(ROSTER, 1));
    for (const leaky of ["email", "phone", "phone_number", "external_id"]) {
      expect(keys).not.toContain(leaky);
    }
  });
});

describe("buildRoster", () => {
  it("resolves every requested task in one pass", () => {
    const map = buildRoster(ROSTER, [1, 2, 3]);
    expect(map.size).toBe(3);
    expect(map.get(1)!.clientId).toBe(memberFor(ROSTER, 1).clientId);
  });

  it("orders internally, so callers need not pre-sort", () => {
    const shuffled = [...ROSTER].reverse();
    expect(buildRoster(shuffled, [1]).get(1)!.clientId).toBe(
      buildRoster(ROSTER, [1]).get(1)!.clientId,
    );
  });
});
