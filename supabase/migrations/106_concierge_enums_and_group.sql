-- Migration 106: Concierge ticketing foundation — enums + org-group ownership.
--
-- First migration of the native concierge ticket subsystem (replaces Freshdesk).
-- Creates every enum used across the subsystem and adds the `concierge_group`
-- ownership column to public.clients and public.profiles so RLS can scope tickets
-- to the Kingdom / Queendom half a staff member works in.
--
-- Split rationale (per build spec): enums -> tables -> RLS -> storage -> seed.
-- This migration is enums + the two existing-table ALTERs only (no new tables),
-- so FK targets in later migrations (107, 108) can rely on these types existing.

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Idempotent creation (CREATE TYPE has no IF NOT EXISTS in Postgres).

DO $$ BEGIN
  -- 8 statuses, verbatim from the Backend spec.
  CREATE TYPE public.concierge_ticket_status AS ENUM (
    'open', 'pending', 'nudge_client', 'nudge_vendor',
    'ongoing_delivery', 'invoice_due', 'resolved', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.concierge_ticket_priority AS ENUM (
    'low', 'medium', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Org halves. Coarse, to match the Backend "Group: Kingdom / Queendom".
  CREATE TYPE public.concierge_group AS ENUM ('kingdom', 'queendom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Append-only timeline entry kinds.
  CREATE TYPE public.concierge_update_kind AS ENUM (
    'note', 'status_change', 'assignment', 'attachment',
    'canned_response', 'checklist', 'vendor_feedback', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Vendor feedback scales (Backend "Vendor Feedback" popup).
  CREATE TYPE public.vendor_promptness AS ENUM ('within_1h', 'within_24h', '2_3_days');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_cost_band AS ENUM ('lowest', 'moderate', 'high_premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_delivery AS ENUM ('on_time', 'delay', 'poor_communication');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Ticket in-app notification kinds (parallel to task_notification_type).
  CREATE TYPE public.concierge_ticket_notification_type AS ENUM (
    'ticket_assigned', 'ticket_transferred', 'ticket_status_changed',
    'ticket_note_added', 'invoice_due'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Group ownership on existing tables ───────────────────────────────────────
-- Nullable: which org half a client belongs to (drives a ticket's default group)
-- and which org half a staff member works in (drives RLS scoping).
-- Admins / founders are cross-group and leave this NULL.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS concierge_group public.concierge_group NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS concierge_group public.concierge_group NULL;

COMMENT ON COLUMN public.clients.concierge_group IS
  'Org half (kingdom/queendom) the client belongs to; default source for a new ticket''s group.';
COMMENT ON COLUMN public.profiles.concierge_group IS
  'Org half a concierge/finance staff member works in; gates concierge_tickets RLS for non-privileged roles.';

-- Partial index to make the RLS group-scope subquery on profiles cheap.
CREATE INDEX IF NOT EXISTS idx_profiles_concierge_group
  ON public.profiles (concierge_group)
  WHERE concierge_group IS NOT NULL;
