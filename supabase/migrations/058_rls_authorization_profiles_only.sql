-- ============================================================
-- Migration 058: RLS helpers must NOT trust JWT user_metadata
--
-- Clients can call supabase.auth.updateUser({ data: { ... } }) and
-- alter user_metadata, which is embedded in the JWT. Using that
-- for RLS was a full authorization bypass.
--
-- Resolution:
--   • get_user_role / get_user_domain / get_role_from_jwt read
--     ONLY from public.profiles (auth.uid()), with safe defaults.
--   • handle_new_user copies role/domain ONLY from raw_app_meta_data
--     (writable only by service role / admin API), never from
--     raw_user_meta_data.
--
-- After deploy: revoke elevated sessions if you suspect tampering;
-- RLS no longer depends on JWT claims for role/domain.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   public.user_role;
  v_domain public.indulge_domain;
BEGIN
  -- Role: trust app_metadata only (not user_metadata).
  v_role := 'agent'::public.user_role;
  IF NEW.raw_app_meta_data->>'role' IN (
    'admin', 'founder', 'manager', 'agent', 'guest'
  ) THEN
    v_role := (NEW.raw_app_meta_data->>'role')::public.user_role;
  END IF;

  v_domain := 'indulge_concierge'::public.indulge_domain;
  IF NEW.raw_app_meta_data->>'domain' IN (
    'indulge_concierge', 'indulge_shop', 'indulge_house', 'indulge_legacy'
  ) THEN
    v_domain := (NEW.raw_app_meta_data->>'domain')::public.indulge_domain;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, domain)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role,
    v_domain
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()),
    'agent'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_domain()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT domain::TEXT FROM public.profiles WHERE id = auth.uid()),
    'indulge_concierge'
  );
$$;

-- Aliases (056): already delegate to get_user_* — replaced above.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role();
$$;

CREATE OR REPLACE FUNCTION public.get_my_domain()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_domain();
$$;

CREATE OR REPLACE FUNCTION public.get_role_from_jwt()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role();
$$;
