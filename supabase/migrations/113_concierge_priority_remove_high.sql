-- Migration 113: remove 'high' from concierge_ticket_priority.
--
-- low | medium | high | urgent  ->  low | medium | urgent
-- Existing 'high' tickets remap to 'urgent'; the seeded 'Default — High' SLA policy is
-- dropped (urgent keeps its own default: 1h response / 8h resolution).
--
-- Postgres can't drop an enum value in place. Unlike concierge_group, this enum's
-- columns (concierge_tickets.priority, sla_policies.priority) are NOT referenced by any
-- RLS policy, so the create-new / swap-columns / drop-old approach works. Indexes on
-- sla_policies.priority (idx_sla_policies_match, sla_policies_default_priority_uidx) are
-- rebuilt automatically by ALTER COLUMN TYPE.
--
-- Idempotent: guarded on the old 'high' label still existing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'concierge_ticket_priority' AND e.enumlabel = 'high'
  ) THEN
    CREATE TYPE public.concierge_ticket_priority_new AS ENUM ('low', 'medium', 'urgent');

    -- Drop the now-invalid default 'high' SLA policy BEFORE the swap. (Remapping it to
    -- 'urgent' would collide with the existing 'Default — Urgent' under
    -- sla_policies_default_priority_uidx.) Any non-default 'high' policy would likewise
    -- be removed; the seeded category policies are priority = NULL and unaffected.
    DELETE FROM public.sla_policies WHERE priority = 'high';

    -- concierge_tickets.priority (NOT NULL, DEFAULT 'medium')
    ALTER TABLE public.concierge_tickets ALTER COLUMN priority DROP DEFAULT;
    ALTER TABLE public.concierge_tickets
      ALTER COLUMN priority TYPE public.concierge_ticket_priority_new
      USING (CASE WHEN priority::text = 'high' THEN 'urgent' ELSE priority::text END::public.concierge_ticket_priority_new);
    ALTER TABLE public.concierge_tickets ALTER COLUMN priority SET DEFAULT 'medium';

    -- sla_policies.priority (nullable) — preserve NULLs
    ALTER TABLE public.sla_policies
      ALTER COLUMN priority TYPE public.concierge_ticket_priority_new
      USING (CASE WHEN priority IS NULL THEN NULL
                  WHEN priority::text = 'high' THEN 'urgent'
                  ELSE priority::text END::public.concierge_ticket_priority_new);

    DROP TYPE public.concierge_ticket_priority;
    ALTER TYPE public.concierge_ticket_priority_new RENAME TO concierge_ticket_priority;
  END IF;
END $$;
