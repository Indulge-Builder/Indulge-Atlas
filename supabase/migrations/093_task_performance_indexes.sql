-- Performance indexes for task-intelligence queries.
-- CONCURRENTLY is omitted — Supabase migrations run inside a transaction block
-- which forbids it. IF NOT EXISTS makes these safe to re-run.

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_users_gin
  ON tasks USING GIN (assigned_to_users);

CREATE INDEX IF NOT EXISTS idx_tasks_master_dept
  ON tasks (unified_task_type, department)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_subtask_project
  ON tasks (unified_task_type, project_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_personal_dept
  ON tasks (unified_task_type, department, atlas_status)
  WHERE unified_task_type = 'personal';
