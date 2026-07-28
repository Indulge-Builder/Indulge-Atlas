-- Migration 129: Academy — curriculum structure (groups, days, task ordering).
--
-- Turns the flat scenario library into a progressive 50-group academy built from
-- the real Indulge Retail Training task register (176 tasks, 17 training days,
-- 4–27 July 2026). Migration 130 loads the tasks themselves.
--
-- WHY COLUMNS AND NOT A NEW TABLE
--   A group is an ordered slice of the curriculum, not an entity with its own
--   lifecycle. Storing group/day/task numbers on the seed keeps one source of
--   truth, needs no joins on the hot path, and leaves every existing RLS policy,
--   server action and API route untouched — the UI redesign stays a UI redesign.
--
-- PROGRESS AND LOCKING ARE DERIVED, NOT STORED
--   "Completed" = a closed training_session for that seed carrying a
--   training_review. Group progress = completed seeds / seeds in group. A group
--   unlocks when the previous one is complete. Nothing to keep in sync, and an
--   intern's history stays the single source of truth.
--
-- IDEMPOTENT: safe to re-run.

-- ── 1. difficulty tiers ──────────────────────────────────────────────────────
-- The ladder needs four tiers (Easy → Medium → Advanced → Expert). The original
-- CHECK allowed easy/medium/hard only. `hard` is retained so the existing 24
-- hand-written scenarios stay valid.

ALTER TABLE public.scenario_seeds
  DROP CONSTRAINT IF EXISTS scenario_seeds_difficulty_check;

ALTER TABLE public.scenario_seeds
  ADD CONSTRAINT scenario_seeds_difficulty_check
  CHECK (difficulty IN ('easy', 'medium', 'hard', 'advanced', 'expert'));

-- ── 2. curriculum position ───────────────────────────────────────────────────

ALTER TABLE public.scenario_seeds
  ADD COLUMN IF NOT EXISTS group_number  integer NULL,
  ADD COLUMN IF NOT EXISTS day_number    integer NULL,
  ADD COLUMN IF NOT EXISTS task_number   integer NULL,
  ADD COLUMN IF NOT EXISTS task_date     date    NULL,
  ADD COLUMN IF NOT EXISTS raised_by     text    NULL,
  ADD COLUMN IF NOT EXISTS brief         text    NULL;

COMMENT ON COLUMN public.scenario_seeds.group_number IS
  'Academy group 1-50. NULL = not part of the curriculum ladder (e.g. the original standalone scenarios).';
COMMENT ON COLUMN public.scenario_seeds.day_number IS
  'Day section within the group (1-based), derived from the real training date.';
COMMENT ON COLUMN public.scenario_seeds.task_number IS
  'Global task number from the source register (1-176) — also the ordering axis.';
COMMENT ON COLUMN public.scenario_seeds.task_date IS
  'The real date this request was raised in the training group.';
COMMENT ON COLUMN public.scenario_seeds.raised_by IS
  'Who role-played the member when the request was raised (Advita, Anishqa, Savio, ...).';
COMMENT ON COLUMN public.scenario_seeds.brief IS
  'The register''s short description — shown on the task card under the title.';

-- A group''s tasks are read together constantly; task_number is the sort key.
CREATE INDEX IF NOT EXISTS idx_scenario_seeds_group
  ON public.scenario_seeds (group_number, day_number, task_number)
  WHERE group_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scenario_seeds_task_number
  ON public.scenario_seeds (task_number)
  WHERE task_number IS NOT NULL;

-- ── 3. curriculum read model ─────────────────────────────────────────────────
-- One round trip for the whole left-hand group list. SECURITY DEFINER so an
-- intern can see the ladder (titles, counts, their own progress) without being
-- granted SELECT on scenario_seeds, which holds the answers.

CREATE OR REPLACE FUNCTION public.academy_group_progress()
RETURNS TABLE (
  group_number    integer,
  difficulty      text,
  task_count      bigint,
  completed_count bigint,
  day_count       bigint,
  last_activity   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.group_number,
    -- one tier per group; MIN is stable because a group is authored at one tier
    MIN(s.difficulty)                                        AS difficulty,
    COUNT(*)                                                 AS task_count,
    COUNT(*) FILTER (WHERE done.seed_id IS NOT NULL)         AS completed_count,
    COUNT(DISTINCT s.day_number)                             AS day_count,
    MAX(done.ended_at)                                       AS last_activity
  FROM public.scenario_seeds s
  LEFT JOIN LATERAL (
    SELECT ts.seed_id, MAX(ts.ended_at) AS ended_at
      FROM public.training_sessions ts
      JOIN public.training_reviews tr ON tr.session_id = ts.id
     WHERE ts.seed_id = s.id
       AND ts.intern_id = auth.uid()
       AND ts.status = 'closed'
     GROUP BY ts.seed_id
  ) done ON true
  WHERE s.group_number IS NOT NULL
    AND s.is_active
  GROUP BY s.group_number
  ORDER BY s.group_number;
$$;

GRANT EXECUTE ON FUNCTION public.academy_group_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.academy_group_progress() TO service_role;
