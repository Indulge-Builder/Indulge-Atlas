-- =============================================================================
-- INDULGE ATLAS — Lead Profile Engine Upgrade (Phase 1–4)
-- =============================================================================
--
-- Adds the following capabilities:
--   1. Lost Lead Churn Analysis  → lost_reason_tag, lost_reason_notes
--   2. Agent Private Scratchpad  → private_scratchpad
--   3. SLA Assignment Tracking   → assigned_at
--   4. Client Persona & Interests → personal_details
--
-- Safe to run on any database using migrations 011–014.
-- =============================================================================

ALTER TABLE public.leads
  -- Phase 1: Lost lead analysis
  ADD COLUMN IF NOT EXISTS lost_reason_tag   text,
  ADD COLUMN IF NOT EXISTS lost_reason_notes text,

  -- Phase 2: Agent private scratchpad (agent-only, never sent to scouts/admins)
  ADD COLUMN IF NOT EXISTS private_scratchpad text,

  -- Phase 3: SLA assignment tracking
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,

  -- Phase 4: Client persona/lifestyle notes
  ADD COLUMN IF NOT EXISTS personal_details text;

-- Backfill assigned_at for existing rows that already have an assignment
UPDATE public.leads
SET assigned_at = created_at
WHERE assigned_at IS NULL AND assigned_to IS NOT NULL;

-- Auto-set assigned_at when assigned_to changes
-- This fires on UPDATE, setting assigned_at to now() whenever assigned_to changes.
CREATE OR REPLACE FUNCTION public.track_lead_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    NEW.assigned_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_track_assignment ON public.leads;
CREATE TRIGGER leads_track_assignment
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.track_lead_assignment();
