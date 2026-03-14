-- =============================================================================
-- INDULGE ATLAS — Lead SLA: is_off_duty for Speed-to-Lead
-- =============================================================================
--
-- Adds is_off_duty boolean to leads. Set by webhook based on insertion time
-- in Asia/Kolkata (IST):
--   - true: 6 PM – 8:59 AM (night backlog)
--   - false: 9 AM – 5:59 PM (on-duty / live)
--
-- Off-duty leads use different SLA rules (60m/90m/120m from 9 AM IST).
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_off_duty boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_is_off_duty_idx ON public.leads(is_off_duty) WHERE status = 'new';
