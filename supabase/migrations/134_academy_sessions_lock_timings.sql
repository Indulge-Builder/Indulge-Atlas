-- Migration 134: stop interns writing their own session rows.
--
-- THE HOLE
--   Migration 125 granted `authenticated` both INSERT and UPDATE on
--   training_sessions, scoped only by ownership:
--
--     CREATE POLICY "training_sessions_update"
--       ON public.training_sessions FOR UPDATE TO authenticated
--       USING (intern_id = auth.uid()) WITH CHECK (intern_id = auth.uid());
--
--   Column-unrestricted, with no guard trigger. Any signed-in trainee could
--   PATCH their own row straight through PostgREST and set `started_at` /
--   `ended_at` to whatever they liked. Those two feed `durationMinutes`, which
--   drives the `time_efficiency` metric — 10% of the score for every request.
--   A trainee could make a two-hour request read as a four-minute one without
--   touching the transcript, and nothing in the app would notice.
--
--   INSERT was the same shape: `started_at` defaults to now() but an explicit
--   value is accepted, so a backdated session could be manufactured outright.
--
-- WHY DROPPING THE POLICIES IS THE FIX, RATHER THAN A TRIGGER
--   Nothing in the application uses them. Every write to this table — session
--   creation in startAcademySession, the close in endAcademySession, the
--   evaluator, the ticket reviewer, the chat route — goes through
--   getServiceSupabaseClient(), which is covered by the separate
--   `training_sessions_service_role` policy and is unaffected here.
--
--   Migration 131 solved the equivalent problem on training_ticket_updates with
--   a trigger, because that table genuinely is written by the intern. This one
--   is not, so the smaller change is to remove the grant rather than police it.
--   Less surface beats more rules.
--
--   SELECT is untouched: interns still read their own sessions, trainers still
--   read all of them, and `can_access_academy_session()` is unchanged. Only the
--   ability to author or alter a row as a non-service-role client is withdrawn.
--
-- MIGRATION NUMBER
--   134 is the next free number in the repo listing, but this repo has had
--   collisions — VERIFY against the live database before applying. Note 132
--   (training_response_signals) is still unapplied.

BEGIN;

DROP POLICY IF EXISTS "training_sessions_update" ON public.training_sessions;
DROP POLICY IF EXISTS "training_sessions_insert" ON public.training_sessions;

COMMENT ON TABLE public.training_sessions IS
  'Academy training sessions. Written by service_role ONLY — the intern-facing '
  'INSERT/UPDATE policies were removed in migration 134 because started_at and '
  'ended_at feed the time-efficiency score and were client-writable. Re-adding '
  'either without a column guard re-opens that hole.';

-- Prove the surface is actually gone rather than assuming the DROP matched.
DO $$
DECLARE
  writable integer;
BEGIN
  SELECT COUNT(*) INTO writable
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'training_sessions'
    AND cmd IN ('INSERT', 'UPDATE')
    AND 'authenticated' = ANY (roles);

  IF writable <> 0 THEN
    RAISE EXCEPTION
      'training_sessions still has % authenticated INSERT/UPDATE policies. Nothing was committed.',
      writable;
  END IF;
END $$;

COMMIT;
