-- Migration 112: rename concierge_group enum values to the two real Queendoms.
--
-- The org-half concept is not "kingdom/queendom" — there are two Queendoms:
-- Anishqa and Ananyshree.  kingdom -> anishqa, queendom -> ananyshree.
--
-- Implementation note: this uses in-place `ALTER TYPE ... RENAME VALUE` (transactional
-- on PG10+) rather than a create-new / swap-columns / drop-old approach. The swap is
-- rejected by Postgres with "cannot alter type of a column used in a policy definition"
-- because concierge_tickets.org_group is referenced by the concierge_tickets RLS
-- policies. RENAME VALUE relabels the enum members in place — no column rewrite, no
-- RLS/index/function churn — and existing rows follow their (renamed) label
-- automatically. There is no real 'kingdom' data; any 'queendom' rows become 'ananyshree'.
--
-- Idempotent: each rename is guarded on the old label still existing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'concierge_group' AND e.enumlabel = 'kingdom'
  ) THEN
    ALTER TYPE public.concierge_group RENAME VALUE 'kingdom' TO 'anishqa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'concierge_group' AND e.enumlabel = 'queendom'
  ) THEN
    ALTER TYPE public.concierge_group RENAME VALUE 'queendom' TO 'ananyshree';
  END IF;
END $$;

-- Refresh column comments (no longer "kingdom/queendom").
COMMENT ON COLUMN public.clients.concierge_group IS
  'Queendom (anishqa/ananyshree) the client belongs to; default source for a new ticket''s group.';
COMMENT ON COLUMN public.profiles.concierge_group IS
  'Queendom (anishqa/ananyshree) a concierge/finance staff member works in; gates concierge_tickets RLS for non-privileged roles.';
