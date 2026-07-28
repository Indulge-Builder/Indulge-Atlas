/**
 * Derive a *legal reference* stage path for a completed ticket.
 *
 * Freshdesk history does not record the intermediate concierge stages, so this is
 * not a transcript — it is the shortest legal route (validated against the
 * concierge state machine) from `open` to the ticket's real final status. The
 * report shows it as "a clean route the Genie could have taken", and stage
 * scoring rewards legality + reaching the final status, never matching this path
 * literally. See training/types.ts › GroundTruth.
 *
 * Pure. NOT a "use server" module.
 */
import { isTransitionAllowed } from "@/lib/concierge/ticketStateMachine";
import type { ConciergeTicketStatus } from "@/lib/types/database";

/** A conservative, always-legal route to each terminal status. */
export function deriveExpectedPath(finalStatus: ConciergeTicketStatus): ConciergeTicketStatus[] {
  const candidate: ConciergeTicketStatus[] =
    finalStatus === "closed"
      ? ["open", "pending", "resolved", "closed"]
      : ["open", "pending", "resolved"];

  // Validate every hop; if the matrix ever changes and a hop becomes illegal,
  // fall back to the minimal [open, finalStatus] rather than emit a bad path.
  for (let i = 1; i < candidate.length; i++) {
    if (!isTransitionAllowed(candidate[i - 1]!, candidate[i]!)) {
      return dedupeConsecutive(["open", finalStatus]);
    }
  }
  return candidate;
}

function dedupeConsecutive(path: ConciergeTicketStatus[]): ConciergeTicketStatus[] {
  return path.filter((s, i) => i === 0 || s !== path[i - 1]);
}
