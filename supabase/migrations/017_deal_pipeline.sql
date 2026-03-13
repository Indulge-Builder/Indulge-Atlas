-- =============================================================================
-- INDULGE ATLAS — Deal Pipeline Fields (Phase 6)
-- =============================================================================
-- Adds deal_duration to the leads table for the Won Deal modal workflow.
-- deal_value already exists; this extends the deal capture surface.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deal_duration text;
