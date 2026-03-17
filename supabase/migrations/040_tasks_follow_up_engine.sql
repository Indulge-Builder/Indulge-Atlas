-- 3-Strike Follow-Up Engine: Add follow_up_step and follow_up_history to tasks
-- follow_up_step: 1–3, tracks which attempt we're on
-- follow_up_history: JSONB array of { step, note, date } for previous attempts

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS follow_up_step integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS follow_up_history jsonb NOT NULL DEFAULT '[]';

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_follow_up_step_range CHECK (follow_up_step >= 1 AND follow_up_step <= 3);

COMMENT ON COLUMN public.tasks.follow_up_step IS 'Current follow-up attempt (1–3). Max 3 strikes before disposition.';
COMMENT ON COLUMN public.tasks.follow_up_history IS 'Array of { step, note, date } for previous follow-up notes.';
