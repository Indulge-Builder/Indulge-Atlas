-- 120_concierge_ticket_scheduled_on.sql
-- Adds concierge_tickets.scheduled_on — the date a ticket's work is scheduled for.
-- Build spec (Ticket list): "Scheduled on (date) — purpose: to filter tickets
-- scheduled for that day." Purely a scheduling/filter attribute; it has NO effect on
-- the SLA clock or the status state machine.
--
-- One schema change (add column + its supporting index). No RLS change: this is a
-- new nullable column on an existing table already covered by concierge_tickets RLS.

ALTER TABLE public.concierge_tickets
  ADD COLUMN IF NOT EXISTS scheduled_on date;

COMMENT ON COLUMN public.concierge_tickets.scheduled_on IS
  'Date the ticket is scheduled for (client-facing booking/appointment day). Nullable. Drives the "Scheduled" filter in the ticket list.';

-- Partial index for the "scheduled today / this week / this month" filters.
CREATE INDEX IF NOT EXISTS idx_concierge_tickets_scheduled_on
  ON public.concierge_tickets (scheduled_on)
  WHERE scheduled_on IS NOT NULL;
