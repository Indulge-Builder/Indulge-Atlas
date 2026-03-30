-- =============================================================================
-- INDULGE ATLAS — Webhook capture log (raw payloads for mapping console)
-- =============================================================================
-- Inserts from API routes use service role (bypass RLS). Admins read via UI.
-- =============================================================================

CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('meta', 'google', 'website')),
  raw_payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_logs_source_created_at_idx
  ON public.webhook_logs (source, created_at DESC);

COMMENT ON TABLE public.webhook_logs IS
  'Raw JSON bodies from Pabbly/webhook adapters for debugging and dynamic mapping UI.';

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_admin_select"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (public.get_role_from_jwt() = 'admin');

-- Introspect public.leads for dynamic mapping dropdowns (admin UI).
CREATE OR REPLACE FUNCTION public.get_leads_columns()
RETURNS TABLE (column_name text, data_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'leads'
  ORDER BY c.ordinal_position;
END;
$$;

COMMENT ON FUNCTION public.get_leads_columns() IS
  'Returns column names and data types for public.leads (mapping UI).';

GRANT EXECUTE ON FUNCTION public.get_leads_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leads_columns() TO service_role;
