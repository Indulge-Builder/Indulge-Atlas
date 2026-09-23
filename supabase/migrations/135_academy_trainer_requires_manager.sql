-- Migration 135: a trainee must not be a trainer.
--
-- `is_academy_trainer()` was `privileged role OR department = 'academy'`. But
-- assigning someone to Indulge Training IS setting department = 'academy', so
-- every trainee an admin created passed this test and became a trainer.
--
-- What that granted, at the RLS layer and therefore over the plain REST API —
-- not merely in the UI:
--   * scenario_seeds — hidden_constraints, ideal_outcome, escalation_trigger
--     and rubric_weights. That is the answer key for every drill the trainee is
--     about to be scored on.
--   * every other trainee's training_sessions, turns and reviews, via
--     can_access_academy_session().
--
-- Role is what separates the two, using the existing role column rather than a
-- second permission system:
--     trainee = role 'agent'   + department 'academy'
--     trainer = role 'manager' + department 'academy'  (or a privileged role)
--
-- Safe to apply: at time of writing NO profile has department = 'academy', so
-- this demotes nobody. The five accounts that pass today (3 admin, 2 founder)
-- all pass on the privileged-role branch and are unaffected.
--
-- MUST stay in lockstep with isAcademyTrainer() in lib/types/database.ts. If
-- the two disagree, hiding the UI achieves nothing — the rows stay readable.
--
-- CREATE OR REPLACE keeps the existing GRANTs and every policy that already
-- references this function, so no policy needs rewriting.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_academy_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR (
      public.get_user_department() = 'academy'
      AND public.get_user_role() = 'manager'
    );
$$;

COMMENT ON FUNCTION public.is_academy_trainer() IS
  'Indulge Training trainer test. Privileged roles, or manager within the '
  'academy department. Deliberately NOT department alone: trainees share that '
  'department and would otherwise read scenario_seeds (the answer key) and '
  'every other trainee''s transcripts. Mirrors isAcademyTrainer() in '
  'lib/types/database.ts — keep both in step.';

COMMIT;
