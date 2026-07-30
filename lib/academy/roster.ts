/**
 * Academy member roster — real Indulge clients, not invented names.
 *
 * Each curriculum task is bound to an actual record from `clients`, so a
 * trainee practises against the membership they will really be serving:
 * genuine names, initials, avatars and membership tier.
 *
 * ── WHAT IS AND IS NOT TAKEN FROM THE REAL RECORD ───────────────────────────
 * Identity only: name, avatar, membership type/status. The *request* stays
 * trainer-authored (`scenario_seeds`), and contact details — phone, email,
 * external IDs — are deliberately never loaded. `lib/academy/pii.ts` refuses to
 * save a seed containing a phone number or email, and pulling those in through
 * the roster instead would route around that guard rather than honour it.
 *
 * ── WHY THE MAPPING IS DETERMINISTIC ────────────────────────────────────────
 * Task N always resolves to the same client. A trainee returning to a
 * conversation must find the same person there, the evaluator grades a
 * transcript naming them, and a shuffled roster would silently rewrite history.
 *
 * Pure module — no I/O, fully deterministic, safe on client and server.
 */

import { memberForTask } from "@/lib/academy/curriculum";

/** The subset of a client record the academy is allowed to surface. */
export interface RosterClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  membership_type: string | null;
  membership_status: string | null;
}

/** A curriculum task's member, resolved for display. */
export interface AcademyMember {
  /** Null when falling back to a synthetic name (no client records loaded). */
  clientId: string | null;
  name: string;
  initials: string;
  avatarUrl: string | null;
  membershipType: string | null;
  membershipStatus: string | null;
  /** True when this came from a real record rather than the fallback roster. */
  isReal: boolean;
}

export function displayName(c: RosterClient): string {
  const name = [c.first_name, c.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "Indulge member";
}

/** "Aria Menon" → "AM"; single-word names take their first two letters. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stable ordering for assignment.
 *
 * Sorted by id rather than by name or creation date: ids never change, so a
 * client renamed or re-dated cannot shuffle every task's member underneath an
 * in-flight cohort.
 */
export function orderRoster(clients: RosterClient[]): RosterClient[] {
  return [...clients].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve the member for a curriculum task.
 *
 * `clients` must already be ordered by `orderRoster`. With more clients than
 * tasks every task gets a distinct member; if the roster is shorter it wraps,
 * which is honest reuse rather than fabricating extra people.
 *
 * Falls back to the synthetic roster when no client records are available —
 * a fresh environment, a permissions failure, or the offline test suite must
 * still render an academy rather than an error.
 */
export function memberFor(
  clients: RosterClient[],
  taskNumber: number,
): AcademyMember {
  const n = Math.max(1, taskNumber);

  if (clients.length === 0) {
    const name = memberForTask(n);
    return {
      clientId: null,
      name,
      initials: initialsFor(name),
      avatarUrl: null,
      membershipType: null,
      membershipStatus: null,
      isReal: false,
    };
  }

  const c = clients[(n - 1) % clients.length];
  const name = displayName(c);
  return {
    clientId: c.id,
    name,
    initials: initialsFor(name),
    avatarUrl: c.avatar_url,
    membershipType: c.membership_type,
    membershipStatus: c.membership_status,
    isReal: true,
  };
}

/** Pre-resolve every task's member in one pass, keyed by task number. */
export function buildRoster(
  clients: RosterClient[],
  taskNumbers: number[],
): Map<number, AcademyMember> {
  const ordered = orderRoster(clients);
  const out = new Map<number, AcademyMember>();
  for (const n of taskNumbers) out.set(n, memberFor(ordered, n));
  return out;
}

/** Tidy a membership tier for display: "annual_gold" → "Annual Gold". */
export function formatMembership(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
