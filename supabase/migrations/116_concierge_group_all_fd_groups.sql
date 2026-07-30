-- Migration 116: Extend the concierge_group enum to all 11 Freshdesk groups.
--
-- The concierge ticket "Group" (concierge_tickets.org_group) is the enum
-- public.concierge_group, which held only the two Queendoms (anishqa, ananyshree).
-- Freshdesk exposes 11 groups; this adds the other 9 so a ticket can be filed
-- under any of them (Bishop, Concierge, Finance and Billing, etc.).
--
-- Append-only ALTER TYPE ... ADD VALUE is the ONLY safe way to change this enum:
-- migration 112 documents that the column type cannot be swapped while the
-- concierge_tickets RLS policies reference org_group. Adding values keeps all
-- existing RLS / agent-assignment semantics intact — org_group still equals the
-- viewer's profiles.concierge_group for concierge-dept visibility; the tagging
-- screen (/admin/concierge-agents) is widened so staff can be placed in the new
-- groups. Enum values cannot be removed, so this is one-way (acceptable).
--
-- Identifiers mirror the agent_groups slugs (migration 115), minus punctuation.

ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'bishop';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'concierge';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'finance_and_billing';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'global_events';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'indulge_shop';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'jokers';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'queendom';
ALTER TYPE public.concierge_group ADD VALUE IF NOT EXISTS 'retail';
