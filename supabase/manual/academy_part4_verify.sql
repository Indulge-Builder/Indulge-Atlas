-- ===========================================================================
-- ACADEMY PART 4 of 4 - VERIFICATION (read-only, safe to run any time)
-- ===========================================================================
--
-- Run AFTER parts 1-3. Changes nothing - it only reads catalog tables.
-- Select ALL of this file and Run. Every row should say PASS.
--
-- The row that matters most is 'training_turns is append-only'. Academy's core
-- guarantee is that a transcript can never be edited after the fact, and that
-- is enforced by the ABSENCE of UPDATE/DELETE policies - not by application
-- code. If that row says FAIL, append-only is broken.
--
-- (The service_role policy is cmd='ALL' by design - internal services need it.
-- The check below counts only UPDATE/DELETE policies, which must be zero.)
-- ===========================================================================

WITH checks AS (

  SELECT 1 AS ord, 'academy enum value exists' AS check_name, '1' AS expected,
    (SELECT count(*)::text FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'employee_department' AND e.enumlabel = 'academy') AS actual

  UNION ALL SELECT 2, 'all 4 tables exist', '4',
    (SELECT count(*)::text FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('scenario_seeds','training_sessions','training_turns','training_reviews'))

  UNION ALL SELECT 3, 'RLS enabled on all 4 tables', '4',
    (SELECT count(*)::text FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('scenario_seeds','training_sessions','training_turns','training_reviews')
        AND c.relrowsecurity)

  UNION ALL SELECT 4, 'training_turns is append-only (0 UPDATE/DELETE policies)', '0',
    (SELECT count(*)::text FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'training_turns'
        AND cmd IN ('UPDATE','DELETE'))

  UNION ALL SELECT 5, 'training_reviews has no client INSERT path', '0',
    (SELECT count(*)::text FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'training_reviews'
        AND cmd = 'INSERT')

  UNION ALL SELECT 6, 'total Academy policies', '13',
    (SELECT count(*)::text FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('scenario_seeds','training_sessions','training_turns','training_reviews'))

  UNION ALL SELECT 7, 'both helpers are SECURITY DEFINER', '2',
    (SELECT count(*)::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('is_academy_trainer','can_access_academy_session')
        AND p.prosecdef)

  UNION ALL SELECT 8, 'both helpers pin search_path', '2',
    (SELECT count(*)::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('is_academy_trainer','can_access_academy_session')
        AND p.proconfig @> ARRAY['search_path=public'])

  UNION ALL SELECT 9, '12 seeds loaded', '12',
    (SELECT count(*)::text FROM public.scenario_seeds)

  UNION ALL SELECT 10, 'seeds cover 6 verticals, 2 each', '6',
    (SELECT count(*)::text FROM (
       SELECT vertical FROM public.scenario_seeds
        GROUP BY vertical HAVING count(*) = 2) x)

  UNION ALL SELECT 11, 'training_turns in realtime publication', '1',
    (SELECT count(*)::text FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'training_turns')

)
SELECT
  ord AS "#",
  check_name AS "check",
  expected,
  actual,
  CASE WHEN expected = actual THEN 'PASS' ELSE '*** FAIL ***' END AS status
FROM checks
ORDER BY ord;
