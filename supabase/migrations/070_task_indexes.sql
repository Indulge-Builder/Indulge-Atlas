-- =============================================================================
-- INDULGE ATLAS — Task System Indexes
-- Migration 070: Performance indexes for all new task query patterns
-- =============================================================================

-- tasks — unified task type queries
CREATE INDEX IF NOT EXISTS idx_tasks_unified_type_domain
  ON public.tasks(unified_task_type, domain, archived_at);

-- tasks — parent/master lookup (may already exist from migration 063)
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON public.tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- tasks — master task lookup via project_id for subtask queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_id_type
  ON public.tasks(project_id, unified_task_type);

-- tasks — import batch grouping
CREATE INDEX IF NOT EXISTS idx_tasks_import_batch_id
  ON public.tasks(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- tasks — personal task queries (by creator/assignee)
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_personal
  ON public.tasks(created_by, unified_task_type);

-- tasks — atlas_status for kanban queries
CREATE INDEX IF NOT EXISTS idx_tasks_atlas_status
  ON public.tasks(atlas_status, project_id);

-- tasks — archived master tasks
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at
  ON public.tasks(archived_at)
  WHERE archived_at IS NOT NULL;

-- task_remarks — primary query: all remarks for a task, newest first
CREATE INDEX IF NOT EXISTS idx_task_remarks_task_created
  ON public.task_remarks(task_id, created_at DESC);

-- task_remarks — author lookup
CREATE INDEX IF NOT EXISTS idx_task_remarks_author
  ON public.task_remarks(author_id, created_at DESC);

-- import_batches — list by creator
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by
  ON public.import_batches(created_by, created_at DESC);

-- import_batches — list by master task
CREATE INDEX IF NOT EXISTS idx_import_batches_master_task
  ON public.import_batches(master_task_id, created_at DESC)
  WHERE master_task_id IS NOT NULL;
