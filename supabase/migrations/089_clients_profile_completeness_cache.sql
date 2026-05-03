-- Migration 089: Denormalized profile_completeness_cache on clients for directory sorting.
-- PostgREST cannot order parent rows by an embedded relation column; this keeps sort aligned with pagination.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS profile_completeness_cache integer;

COMMENT ON COLUMN public.clients.profile_completeness_cache IS
  'Mirrors client_profiles.profile_completeness for ORDER BY on the clients query; maintained by trigger.';

UPDATE public.clients c
SET profile_completeness_cache = cp.profile_completeness
FROM public.client_profiles cp
WHERE cp.client_id = c.id;

CREATE OR REPLACE FUNCTION public.sync_clients_profile_completeness_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.clients
    SET profile_completeness_cache = NULL
    WHERE id = OLD.client_id;
    RETURN OLD;
  END IF;
  UPDATE public.clients
  SET profile_completeness_cache = NEW.profile_completeness
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_profiles_sync_completeness_cache ON public.client_profiles;

CREATE TRIGGER client_profiles_sync_completeness_cache
  AFTER INSERT OR DELETE OR UPDATE OF profile_completeness ON public.client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_clients_profile_completeness_cache();
