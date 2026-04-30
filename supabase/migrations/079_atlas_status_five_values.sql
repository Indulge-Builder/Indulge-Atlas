-- =============================================================================
-- atlas_status — reduce to five values (todo, in_progress, done, error, cancelled)
-- Remap legacy: in_review + blocked → in_progress before tightening CHECK constraints.
-- =============================================================================

UPDATE public.tasks
SET atlas_status = 'in_progress'
WHERE atlas_status IN ('in_review', 'blocked');

UPDATE public.task_remarks
SET state_at_time = 'in_progress'
WHERE state_at_time IN ('in_review', 'blocked');

-- previous_status exists only after migration 071 — skip if column absent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_remarks'
      AND column_name = 'previous_status'
  ) THEN
    UPDATE public.task_remarks
    SET previous_status = 'in_progress'
    WHERE previous_status IN ('in_review', 'blocked');
  END IF;
END $$;

-- Drop existing CHECK constraints on tasks.atlas_status and task_remarks.state_at_time
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class r ON c.conrelid = r.oid
  JOIN pg_namespace n ON r.relnamespace = n.oid
  WHERE r.relname = 'tasks'
    AND n.nspname = 'public'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%atlas_status%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', con_name);
  END IF;

  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class r ON c.conrelid = r.oid
  JOIN pg_namespace n ON r.relnamespace = n.oid
  WHERE r.relname = 'task_remarks'
    AND n.nspname = 'public'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%state_at_time%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.task_remarks DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_atlas_status_check
  CHECK (atlas_status IN ('todo', 'in_progress', 'done', 'error', 'cancelled'));

ALTER TABLE public.task_remarks
  ADD CONSTRAINT task_remarks_state_at_time_check
  CHECK (state_at_time IN ('todo', 'in_progress', 'done', 'error', 'cancelled'));
