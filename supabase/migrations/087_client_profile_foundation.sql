-- Migration 087: Client Profile Foundation
-- Extends public.clients; adds public.client_profiles and public.profile_sources with RLS.

-- Part 1: clients columns + updated_at trigger
ALTER TABLE public.clients ALTER COLUMN lead_origin_id DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN closed_by DROP NOT NULL;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS queendom text,
  ADD COLUMN IF NOT EXISTS former_queendom text,
  ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS membership_type text,
  ADD COLUMN IF NOT EXISTS membership_start date,
  ADD COLUMN IF NOT EXISTS membership_end date,
  ADD COLUMN IF NOT EXISTS membership_amount_paid numeric,
  ADD COLUMN IF NOT EXISTS membership_interval text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Part 2: client_profiles

CREATE TABLE IF NOT EXISTS public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date_of_birth date,
  blood_group text,
  marital_status text,
  wedding_anniversary date,
  personality_type text,
  primary_city text,
  company_designation text,
  social_handles text,
  travel jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifestyle jsonb NOT NULL DEFAULT '{}'::jsonb,
  passions jsonb NOT NULL DEFAULT '{}'::jsonb,
  elia_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_completeness integer NOT NULL DEFAULT 0
    CHECK (profile_completeness BETWEEN 0 AND 100),
  last_enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_profiles_select" ON public.client_profiles;
DROP POLICY IF EXISTS "client_profiles_insert" ON public.client_profiles;
DROP POLICY IF EXISTS "client_profiles_update" ON public.client_profiles;
DROP POLICY IF EXISTS "client_profiles_service_role" ON public.client_profiles;

CREATE POLICY "client_profiles_select" ON public.client_profiles FOR SELECT TO authenticated USING (
  public.get_user_role() IN ('admin', 'founder')
  OR public.get_user_domain() = 'indulge_global'
  OR (
    public.get_user_role() IN ('manager', 'guest', 'agent')
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_profiles.client_id
        AND (
          c.closed_by = auth.uid()
          OR c.assigned_agent_id = auth.uid()
        )
    )
  )
);

CREATE POLICY "client_profiles_insert" ON public.client_profiles FOR INSERT TO authenticated
WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'manager', 'agent'));

CREATE POLICY "client_profiles_update" ON public.client_profiles FOR UPDATE TO authenticated USING (
  public.get_user_role() IN ('admin', 'founder', 'manager')
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_profiles.client_id
      AND (
        c.closed_by = auth.uid()
        OR c.assigned_agent_id = auth.uid()
      )
  )
)
WITH CHECK (
  public.get_user_role() IN ('admin', 'founder', 'manager')
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_profiles.client_id
      AND (
        c.closed_by = auth.uid()
        OR c.assigned_agent_id = auth.uid()
      )
  )
);

CREATE POLICY "client_profiles_service_role" ON public.client_profiles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE TRIGGER client_profiles_updated_at
  BEFORE UPDATE ON public.client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_profiles TO authenticated;
GRANT ALL ON public.client_profiles TO service_role;

-- Part 3: profile_sources (append-only)

CREATE TABLE IF NOT EXISTS public.profile_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_ref text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(3, 2) DEFAULT 1.00
    CHECK (confidence BETWEEN 0 AND 1),
  ingested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_sources_select" ON public.profile_sources;
DROP POLICY IF EXISTS "profile_sources_insert" ON public.profile_sources;
DROP POLICY IF EXISTS "profile_sources_service_role" ON public.profile_sources;

CREATE POLICY "profile_sources_select" ON public.profile_sources FOR SELECT TO authenticated USING (
  public.get_user_role() IN ('admin', 'founder', 'manager')
  OR public.get_user_domain() = 'indulge_global'
  OR (
    public.get_user_role() = 'agent'
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = profile_sources.client_id
        AND (
          c.closed_by = auth.uid()
          OR c.assigned_agent_id = auth.uid()
        )
    )
  )
);

CREATE POLICY "profile_sources_insert" ON public.profile_sources FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "profile_sources_service_role" ON public.profile_sources FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.profile_sources TO authenticated;
GRANT ALL ON public.profile_sources TO service_role;

-- Part 4: indexes

CREATE INDEX IF NOT EXISTS idx_client_profiles_client_id ON public.client_profiles(client_id);

CREATE INDEX IF NOT EXISTS idx_profile_sources_client_id ON public.profile_sources(client_id);

CREATE INDEX IF NOT EXISTS idx_profile_sources_source_type ON public.profile_sources(source_type);

CREATE INDEX IF NOT EXISTS idx_clients_queendom ON public.clients(queendom);

CREATE INDEX IF NOT EXISTS idx_clients_client_status ON public.clients(client_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_external_id ON public.clients(external_id);
