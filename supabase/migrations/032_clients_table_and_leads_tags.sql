-- =============================================================================
-- INDULGE ATLAS — Clients Table + Leads Tags (Phase 1 & 2 Schema)
-- =============================================================================
--
-- Phase 1: Creates the `clients` table for Won Leads with RLS.
-- Phase 2: Adds `tags` TEXT[] column to `leads` for the tagging system.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Dedicated table for won leads. Links back to original lead via lead_origin_id.
-- closed_by tracks who closed the deal for RLS (agents see clients they closed).

CREATE TABLE public.clients (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       text         NOT NULL,
  last_name        text,
  phone_number     text         NOT NULL,
  email            text,
  lead_origin_id   uuid         NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  closed_by        uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  membership_status text        NOT NULL DEFAULT 'active',
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clients_lead_origin_id_idx ON public.clients(lead_origin_id);
CREATE INDEX clients_closed_by_idx ON public.clients(closed_by);
CREATE INDEX clients_created_at_idx ON public.clients(created_at DESC);

COMMENT ON TABLE public.clients IS 'Won leads promoted to clients. One row per closed deal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CLIENTS RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Agents: view only clients they closed (closed_by = auth.uid())
-- Scouts/Admins: view all clients
-- Insert: Agents, scouts, admins can insert (when closing a deal)

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (
    closed_by = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT WITH CHECK (closed_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LEADS TAGS COLUMN
-- ─────────────────────────────────────────────────────────────────────────────
-- TEXT[] for multi-tag support. Default empty array.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS leads_tags_gin_idx ON public.leads USING GIN (tags);

COMMENT ON COLUMN public.leads.tags IS 'Array of tags for filtering and search (e.g. griffin_event, gurak_party).';
