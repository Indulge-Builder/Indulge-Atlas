-- Add freeform context notes to tasks, populated by the Smart Calendar
-- when a user chooses "No, Just a Task" in the Lead Resolution Flow.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context_notes text;
