-- Migration 101: lead_notification_logs
-- Tracks every inbound lead event and every WhatsApp notification attempt
-- so we can audit delivery failures without relying on server logs.

CREATE TABLE public.lead_notification_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  agent_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- which stage this row represents
  event_type     text NOT NULL,
  -- 'lead_received'  : lead arrived at the webhook
  -- 'notification_sent' : Gupshup template request was made
  -- 'notification_failed' : Gupshup returned non-2xx or threw

  -- Gupshup HTTP response (null for lead_received rows)
  gupshup_status  integer,            -- HTTP status code, e.g. 200, 400
  gupshup_body    text,               -- raw response body (truncated to 2 KB)
  delivered       boolean,            -- true = 2xx, false = non-2xx, null = lead_received

  -- context snapshot
  lead_name       text,
  lead_phone      text,
  agent_phone     text,               -- last 4 chars only for privacy

  source          text,               -- 'meta' | 'google' | 'website'
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notification_logs ENABLE ROW LEVEL SECURITY;

-- Agents can only see their own notification rows
CREATE POLICY "agent_read_own" ON public.lead_notification_logs
  FOR SELECT
  USING (agent_id = auth.uid());

-- Managers, admins, founders can read all
CREATE POLICY "privileged_read_all" ON public.lead_notification_logs
  FOR SELECT
  USING (
    get_user_role() IN ('manager', 'admin', 'super_admin', 'founder')
  );

-- Service role bypass for internal writes
CREATE POLICY "service_role_all" ON public.lead_notification_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Index for the most common lookup: recent logs per lead
CREATE INDEX idx_lead_notification_logs_lead_id
  ON public.lead_notification_logs (lead_id, created_at DESC);

-- Index for per-agent delivery audits
CREATE INDEX idx_lead_notification_logs_agent_id
  ON public.lead_notification_logs (agent_id, created_at DESC);
