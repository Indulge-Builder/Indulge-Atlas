-- =============================================================================
-- INDULGE ATLAS — SLA Alert Tracking for Escalation History
-- =============================================================================
--
-- Adds agent_alert_sent and manager_alert_sent to persist breach history.
-- When a lead breaches SLA: agent_alert_sent = true (level 1+).
-- When manager escalation is triggered: manager_alert_sent = true (level 3).
-- These remain true permanently for audit history.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_alert_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_alert_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_agent_alert_sent_idx
  ON public.leads(assigned_to, agent_alert_sent)
  WHERE agent_alert_sent = true;
