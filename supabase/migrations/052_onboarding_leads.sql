-- =============================================================================
-- INDULGE ATLAS — Onboarding conversion rows (internal webhook ingestion)
-- =============================================================================
-- Inserts from /api/webhooks/onboarding-conversion use service role (bypass RLS).
-- =============================================================================

CREATE TABLE public.onboarding_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  amount numeric NOT NULL,
  agent_name text NOT NULL,
  assigned_to text NOT NULL CHECK (assigned_to IN ('Ananyshree', 'Anishqa')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_leads_created_at_idx
  ON public.onboarding_leads (created_at DESC);

COMMENT ON TABLE public.onboarding_leads IS
  'Conversion events from internal onboarding systems (webhook ingestion).';

ALTER TABLE public.onboarding_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_leads_admin_select"
  ON public.onboarding_leads
  FOR SELECT
  TO authenticated
  USING (public.get_role_from_jwt() = 'admin');
