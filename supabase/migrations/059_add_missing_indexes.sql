-- =============================================================================
-- Migration 059: Critical performance indexes (enterprise audit)
--
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction; Supabase
-- migration runs are transactional, so we use CREATE INDEX IF NOT EXISTS.
-- For zero-downtime creates on very large tables in production, run equivalent
-- CONCURRENTLY statements manually outside this migration if needed.
-- =============================================================================

-- Manager dashboards: filter by domain + status, order by recency
CREATE INDEX IF NOT EXISTS leads_domain_status_created_idx
  ON public.leads (domain, status, created_at DESC);

-- WhatsApp inbound: match by phone_number variants
CREATE INDEX IF NOT EXISTS leads_phone_number_idx
  ON public.leads (phone_number);

-- SLA monitor: new leads ordered by created_at
CREATE INDEX IF NOT EXISTS leads_new_status_created_idx
  ON public.leads (created_at DESC)
  WHERE status = 'new';

-- Agent task boards: pending tasks by assignee array membership
CREATE INDEX IF NOT EXISTS tasks_assigned_users_pending_idx
  ON public.tasks USING GIN (assigned_to_users)
  WHERE status = 'pending';

-- Dossier timeline: activities per lead, newest first
CREATE INDEX IF NOT EXISTS lead_activities_lead_created_idx
  ON public.lead_activities (lead_id, created_at DESC);

-- Webhook log hygiene / debugging by time (existing index is source + created_at)
CREATE INDEX IF NOT EXISTS webhook_logs_created_idx
  ON public.webhook_logs (created_at DESC);
