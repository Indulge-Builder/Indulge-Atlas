-- Migration 114: FD-style ticket Tags + Escalation Status.
--
-- escalation_status is a SEPARATE tracker from the workflow `status` state machine
-- (open/pending/nudge_*/ongoing_delivery/invoice_due/resolved/closed). It mirrors the
-- Freshdesk "Escalation Status" field and never feeds the ticket state machine.
--
-- Additive only: a new enum + two columns (constant defaults → fast metadata-only add,
-- no table rewrite) + two indexes. Idempotent / guarded. Not referenced by any RLS policy.

DO $$ BEGIN
  CREATE TYPE public.concierge_escalation_status AS ENUM (
    'not_escalated',
    'under_review',
    'unable_to_solve',
    'delay_in_response',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.concierge_tickets
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS escalation_status public.concierge_escalation_status NOT NULL DEFAULT 'not_escalated';

CREATE INDEX IF NOT EXISTS idx_concierge_tickets_tags
  ON public.concierge_tickets USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_concierge_tickets_escalation
  ON public.concierge_tickets (escalation_status);

COMMENT ON COLUMN public.concierge_tickets.escalation_status IS
  'FD-style escalation tracker — SEPARATE from the workflow `status` state machine. '
  'Values: not_escalated/under_review/unable_to_solve/delay_in_response/resolved/closed.';
COMMENT ON COLUMN public.concierge_tickets.tags IS
  'Free-text tags (text[]) applied at create/edit; FD-style. Sanitized + deduped in the app layer.';
