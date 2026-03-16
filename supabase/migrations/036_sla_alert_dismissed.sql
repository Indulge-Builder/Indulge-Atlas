-- =============================================================================
-- INDULGE ATLAS — SLA Alert Stateful Dismissal
-- =============================================================================
--
-- Adds sla_alert_dismissed to leads so that when an agent acknowledges an SLA
-- alert, it is permanently dismissed and never shown again (no localStorage,
-- no spam on every login).
--
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sla_alert_dismissed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_sla_alert_dismissed_idx
  ON public.leads(assigned_to, sla_alert_dismissed)
  WHERE sla_alert_dismissed = false;

-- Enable Realtime for leads (SLA alert subscription)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;
