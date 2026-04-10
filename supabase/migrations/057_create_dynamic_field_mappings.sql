-- =============================================================================
-- INDULGE ATLAS — Dynamic Field Mapping Engine (ETL)
-- =============================================================================
-- Enables managers to visually map incoming JSON keys from Pabbly/Meta/Google
-- webhooks to Supabase `leads` table columns — no code changes required.
-- =============================================================================

-- ─── 1. Webhook Endpoints Registry ──────────────────────────────────────────
-- Stores each Pabbly channel as a configurable entry.

CREATE TABLE public.webhook_endpoints (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name    text        NOT NULL,   -- e.g. 'Meta Lead Ads', 'Google Ads'
  channel        text        NOT NULL UNIQUE CHECK (channel IN ('meta', 'google', 'website')),
  endpoint_url   text        NOT NULL,   -- The /api/webhooks/leads/<channel> URL
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_endpoints IS
  'Registry of active Pabbly/webhook inbound channels for the mapping engine.';

-- Seed the three built-in channels
INSERT INTO public.webhook_endpoints (source_name, channel, endpoint_url) VALUES
  ('Meta Lead Ads',        'meta',    '/api/webhooks/leads/meta'),
  ('Google Ads',           'google',  '/api/webhooks/leads/google'),
  ('Website / Typeform',   'website', '/api/webhooks/leads/website');

-- ─── 2. Field Mappings ───────────────────────────────────────────────────────
-- Stores one mapping row per (endpoint, incoming_json_key) pair.

CREATE TABLE public.field_mappings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id          uuid        NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  incoming_json_key    text        NOT NULL,  -- e.g. 'phone', 'payload.phone_number'
  target_db_column     text        NOT NULL,  -- e.g. 'phone_number'
  transformation_rule  text,                  -- e.g. 'lowercase', 'extract_numbers', 'trim'
  fallback_value       text,                  -- used if incoming value is blank/null
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (endpoint_id, incoming_json_key)
);

CREATE INDEX field_mappings_endpoint_id_idx ON public.field_mappings (endpoint_id);

COMMENT ON TABLE public.field_mappings IS
  'Manager-defined JSON key → DB column mappings consumed by the dynamic ingestion engine.';

COMMENT ON COLUMN public.field_mappings.incoming_json_key IS
  'Top-level JSON key from the incoming webhook payload (e.g. "phone", "fullName").';
COMMENT ON COLUMN public.field_mappings.target_db_column IS
  'Column in public.leads to write this value to (e.g. "phone_number").';
COMMENT ON COLUMN public.field_mappings.transformation_rule IS
  'Optional transform: lowercase | uppercase | trim | extract_numbers | capitalize | (null = passthrough).';
COMMENT ON COLUMN public.field_mappings.fallback_value IS
  'Static string used when the incoming value is null or empty. Null = skip field.';

-- ─── 3. Updated_at triggers ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER field_mappings_updated_at
  BEFORE UPDATE ON public.field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings    ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "webhook_endpoints_admin_all"
  ON public.webhook_endpoints FOR ALL TO authenticated
  USING  (public.get_role_from_jwt() = 'admin')
  WITH CHECK (public.get_role_from_jwt() = 'admin');

CREATE POLICY "field_mappings_admin_all"
  ON public.field_mappings FOR ALL TO authenticated
  USING  (public.get_role_from_jwt() = 'admin')
  WITH CHECK (public.get_role_from_jwt() = 'admin');

-- Service role needs unrestricted read for the ingestion engine
CREATE POLICY "field_mappings_service_select"
  ON public.field_mappings FOR SELECT TO service_role
  USING (true);

CREATE POLICY "webhook_endpoints_service_select"
  ON public.webhook_endpoints FOR SELECT TO service_role
  USING (true);

-- ─── 5. RPC — get_field_mappings_for_channel ─────────────────────────────────
-- Used by the dynamic ingestion engine at webhook time.

CREATE OR REPLACE FUNCTION public.get_field_mappings_for_channel(p_channel text)
RETURNS TABLE (
  incoming_json_key   text,
  target_db_column    text,
  transformation_rule text,
  fallback_value      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fm.incoming_json_key,
    fm.target_db_column,
    fm.transformation_rule,
    fm.fallback_value
  FROM public.field_mappings fm
  JOIN public.webhook_endpoints we ON we.id = fm.endpoint_id
  WHERE we.channel = p_channel
    AND we.is_active = true
    AND fm.is_active  = true
  ORDER BY fm.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_field_mappings_for_channel IS
  'Returns active field mappings for a given webhook channel (meta|google|website).';

GRANT EXECUTE ON FUNCTION public.get_field_mappings_for_channel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_field_mappings_for_channel(text) TO service_role;
