-- Migration 118: Keep only the two Queendoms as active agent groups.
--
-- Freshdesk had 11 groups; Atlas only uses Anishqa + Ananyshree for ticket
-- scoping. Deactivate the other 9 organisational groups, drop their memberships,
-- and strip non-queendom rows from concierge_agent_groups.
--
-- PG enum public.concierge_group still contains the legacy labels (Postgres
-- cannot easily DROP ENUM values). Application code only offers anishqa /
-- ananyshree. Tickets already filed under a legacy org_group are remapped to
-- ananyshree so RLS + filters stay coherent.

-- ── Deactivate non-Queendom agent_groups ─────────────────────────────────────

UPDATE public.agent_groups
SET is_active = false
WHERE slug IS DISTINCT FROM 'anishqa-queendom'
  AND slug IS DISTINCT FROM 'ananyshree-queendom';

-- Drop memberships on inactive groups (directory only; Queendom members kept).
DELETE FROM public.agent_group_members
WHERE group_id IN (
  SELECT id FROM public.agent_groups
  WHERE is_active = false
);

-- ── Concierge multi-group membership: Queendoms only ─────────────────────────

DELETE FROM public.concierge_agent_groups
WHERE org_group::text NOT IN ('anishqa', 'ananyshree');

-- Primary profile scope: clear legacy non-queendom values.
UPDATE public.profiles
SET concierge_group = NULL
WHERE concierge_group IS NOT NULL
  AND concierge_group::text NOT IN ('anishqa', 'ananyshree');

-- Tickets: remap any legacy org_group onto Ananyshree (NOT NULL column).
UPDATE public.concierge_tickets
SET org_group = 'ananyshree'
WHERE org_group::text NOT IN ('anishqa', 'ananyshree');

COMMENT ON TABLE public.agent_groups IS
  'Organisational agent groups. Only Anishqa + Ananyshree Queendoms are active (migration 118); other FD imports are deactivated.';
