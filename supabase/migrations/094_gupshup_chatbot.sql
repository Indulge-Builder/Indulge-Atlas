-- Migration 094: Gupshup WhatsApp chatbot tables
-- Creates bot_catalog_items and bot_sessions.
-- Also extends webhook_logs.source CHECK constraint to include 'gupshup'.

-- Extend webhook_logs source constraint to allow gupshup payloads
ALTER TABLE public.webhook_logs
  DROP CONSTRAINT IF EXISTS webhook_logs_source_check;

ALTER TABLE public.webhook_logs
  ADD CONSTRAINT webhook_logs_source_check
  CHECK (source IN ('meta', 'google', 'website', 'gupshup'));

-- ── bot_catalog_items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_catalog_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL CHECK (category IN ('watches', 'travel', 'events', 'sports', 'art', 'fashion')),
  name         text NOT NULL,
  description  text NOT NULL,
  image_url    text,
  price_range  text,
  tags         text[] NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_catalog_items ENABLE ROW LEVEL SECURITY;

-- Authenticated privileged users can read, insert, update catalog items
DROP POLICY IF EXISTS "catalog_items_privileged_access" ON public.bot_catalog_items;
CREATE POLICY "catalog_items_privileged_access" ON public.bot_catalog_items
  FOR ALL
  USING (
    get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  )
  WITH CHECK (
    get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

-- Service role bypass (bot reads without auth context)
DROP POLICY IF EXISTS "catalog_items_service_role_bypass" ON public.bot_catalog_items;
CREATE POLICY "catalog_items_service_role_bypass" ON public.bot_catalog_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS set_bot_catalog_items_updated_at ON public.bot_catalog_items;
CREATE TRIGGER set_bot_catalog_items_updated_at
  BEFORE UPDATE ON public.bot_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── bot_sessions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             text NOT NULL UNIQUE,
  state             text NOT NULL DEFAULT 'greeting' CHECK (state IN ('greeting', 'browsing', 'viewing_products', 'handoff_pending', 'handed_off')),
  last_category     text,
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  bot_turn_count    integer NOT NULL DEFAULT 0,
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  context_jsonb     jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only — never accessed from the browser
DROP POLICY IF EXISTS "bot_sessions_service_role_bypass" ON public.bot_sessions;
CREATE POLICY "bot_sessions_service_role_bypass" ON public.bot_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS set_bot_sessions_updated_at ON public.bot_sessions;
CREATE TRIGGER set_bot_sessions_updated_at
  BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
