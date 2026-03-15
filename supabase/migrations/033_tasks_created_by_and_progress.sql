-- Add created_by and progress_updates to tasks for Admin "God Mode" Delegation Engine
-- created_by: who created the task (for Founder's Task badge)
-- progress_updates: JSONB array of { timestamp, message, user_id, user_name }

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress_updates jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill created_by: for existing tasks, set created_by = assigned_to (best guess)
UPDATE public.tasks
SET created_by = assigned_to
WHERE created_by IS NULL;

COMMENT ON COLUMN public.tasks.created_by IS 'User who created the task. When admin, enables Founder''s Task badge.';
COMMENT ON COLUMN public.tasks.progress_updates IS 'Array of { timestamp, message, user_id, user_name } for timeline updates.';
