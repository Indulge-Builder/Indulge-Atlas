-- ── Messaging Directory ──────────────────────────────────────────────────────
--
-- Problem: The `profiles` table RLS policy restricts agents to reading only
-- their own row. This means agents cannot discover other team members for
-- messaging, and cannot resolve sender names in message threads.
--
-- Solution: A SECURITY DEFINER function that runs with elevated DB privileges
-- but deliberately exposes ONLY the three non-sensitive fields required for
-- the messaging UI (id, full_name, role). Sensitive columns (email, phone,
-- dob, domain) are never included. Any authenticated user may call it.
--
-- This follows the principle of least privilege — the minimum data surface
-- needed for the feature, exposed through a well-defined contract.

CREATE OR REPLACE FUNCTION public.get_messaging_directory()
RETURNS TABLE (
  id        uuid,
  full_name text,
  role      public.user_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.id != auth.uid()
  ORDER BY p.full_name ASC;
$$;

-- Grant EXECUTE to any signed-in user. Unauthenticated requests are blocked
-- at the PostgREST / Supabase edge before reaching this function.
GRANT EXECUTE ON FUNCTION public.get_messaging_directory() TO authenticated;

-- Also expose the current user's own profile for sender enrichment.
-- (Agents can already read their own row via profiles_select, but this
--  companion function makes the pattern symmetric and avoids a second
--  query in the client hook.)
CREATE OR REPLACE FUNCTION public.get_my_messaging_profile()
RETURNS TABLE (
  id        uuid,
  full_name text,
  role      public.user_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_messaging_profile() TO authenticated;
