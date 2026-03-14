-- =============================================================================
-- INDULGE ATLAS — Lead Status Pipeline Overhaul
-- =============================================================================
--
-- Phase 1: Strict 8-stage status enum + context columns
-- - Add 'connected' to lead_status enum (between attempted and in_discussion)
-- - Add lost_reason, trash_reason, nurture_reason (TEXT)
-- - Add attempt_count (INTEGER, default 0)
--
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add 'connected' to lead_status enum
-- PostgreSQL: ALTER TYPE ... ADD VALUE cannot run inside a transaction block
-- with IF NOT EXISTS in older versions. We use a DO block to add safely.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'connected'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'lead_status')
  )
  THEN
    ALTER TYPE public.lead_status ADD VALUE 'connected' AFTER 'attempted';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already exists
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add context columns (lost_reason, trash_reason, nurture_reason)
-- Note: lost_reason_tag and lost_reason_notes may exist; we add lost_reason
-- as the new unified TEXT column for modal dropdown values.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trash_reason  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nurture_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS attempt_count  integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.leads.lost_reason   IS 'Reason from LostDealModal: Not Interested, Price Objection, Bought Competitor, Other';
COMMENT ON COLUMN public.leads.trash_reason  IS 'Reason from TrashLeadModal: Incorrect Data, Not our TG, Spam';
COMMENT ON COLUMN public.leads.nurture_reason IS 'Reason from NurtureModal: Future Prospect, Cold';
COMMENT ON COLUMN public.leads.attempt_count IS 'Incremented when status changes to attempted; used for 3-strike nurture suggestion';
