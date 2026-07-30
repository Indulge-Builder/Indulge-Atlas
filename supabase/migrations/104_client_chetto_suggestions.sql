-- Migration 104: Tier-2 Chetto mapping suggestions (timeline / insights / search).
-- Human review on /clients/chetto-mapping before writing clients.chetto_group_id.

CREATE TABLE IF NOT EXISTS public.client_chetto_suggestions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  chetto_group_id text        NOT NULL,
  confidence      smallint    NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  method          text        NOT NULL CHECK (method IN ('phone', 'name', 'name_fuzzy', 'timeline', 'insights', 'search')),
  evidence        text        NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_by     uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (client_id, chetto_group_id)
);

CREATE INDEX IF NOT EXISTS idx_client_chetto_suggestions_client_pending
  ON public.client_chetto_suggestions (client_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_client_chetto_suggestions_status
  ON public.client_chetto_suggestions (status);

COMMENT ON TABLE public.client_chetto_suggestions IS
  'Suggested Chetto group mappings from Tier-2 resolution (timeline scan, org insights, message search). Review before accept.';

ALTER TABLE public.client_chetto_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_chetto_suggestions_select"
  ON public.client_chetto_suggestions FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_suggestions_insert"
  ON public.client_chetto_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_suggestions_update"
  ON public.client_chetto_suggestions FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_suggestions_service_role"
  ON public.client_chetto_suggestions
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.set_client_chetto_suggestions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_chetto_suggestions_updated_at ON public.client_chetto_suggestions;

CREATE TRIGGER trg_client_chetto_suggestions_updated_at
  BEFORE UPDATE ON public.client_chetto_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_client_chetto_suggestions_updated_at();
