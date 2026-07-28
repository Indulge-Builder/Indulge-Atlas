/**
 * The trainer's ONLY doorway to Freshdesk — and it is read-only by construction.
 *
 * It re-exports the existing Freshdesk client's GET helpers (we extend that
 * client, we do not fork it) and exposes one convenience reader. There is
 * deliberately no create/update/reply/delete surface here: the client exposes
 * none, and the trainer must never gain one. Any future write helper added to
 * lib/freshdesk/client.ts must NOT be re-exported through this module.
 *
 * Used only by the ingest CLI (operator context). Never by the trainee UI.
 */
import {
  getContactById,
  getTicketConversations,
  listAllContacts,
  listTicketsForRequester,
} from "@/lib/freshdesk/client";
import type { FreshdeskTicket } from "@/lib/freshdesk/types";
import { isCompletedTicket } from "@/training/ingest/scenarioBuilder";

export { getContactById, getTicketConversations, listAllContacts, listTicketsForRequester };

/** Default SLA targets (calendar minutes) when no policy is supplied. */
export const SLA_DEFAULTS = {
  firstResponseMinutes: 60,
  resolutionMinutes: 24 * 60,
} as const;

/**
 * List a requester's COMPLETED (resolved/closed) tickets — the only tickets that
 * make replayable scenarios. Read-only: a single GET pagination under the hood.
 */
export async function fetchCompletedTicketsForRequester(
  requesterId: number,
): Promise<FreshdeskTicket[]> {
  const tickets = await listTicketsForRequester(requesterId, { includeRequester: true });
  return tickets.filter(isCompletedTicket);
}
