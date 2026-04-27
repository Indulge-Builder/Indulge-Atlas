-- =============================================================================
-- INDULGE ATLAS — Unified Task Schema
-- Migration 067: Extend tasks table, add task_remarks, add import_batches
-- =============================================================================
--
-- HIERARCHY:
--   Master Task  (task_type = 'master') — was: Project
--     └── Task Group  (task_groups table — unchanged)
--          └── Sub-Task  (task_type = 'subtask')
--               └── task_remarks  (append-only state-change log)
--
-- Personal Task  (task_type = 'personal') — no project_id
--
-- This migration ONLY ADDS columns to tasks — no existing columns altered.
-- All existing data, foreign keys, and RLS policies remain intact.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND tasks TABLE — new columns only
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: tasks.task_type already exists as a task_flow_type enum (migration 063).
--       We add a new column unified_task_type to avoid conflicts.
--       After migration 068 backfills, this becomes the canonical type field.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS unified_task_type     TEXT NOT NULL DEFAULT 'subtask'
    CHECK (unified_task_type IN ('master', 'subtask', 'personal')),
  ADD COLUMN IF NOT EXISTS atlas_status          TEXT NOT NULL DEFAULT 'todo'
    CHECK (atlas_status IN ('todo','in_progress','in_review','done','blocked','error','cancelled')),
  ADD COLUMN IF NOT EXISTS domain                TEXT,
  ADD COLUMN IF NOT EXISTS department            TEXT,
  ADD COLUMN IF NOT EXISTS archived_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by           UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS imported_from         TEXT
    CHECK (imported_from IS NULL OR imported_from = 'google_sheets'),
  ADD COLUMN IF NOT EXISTS import_batch_id       UUID,
  ADD COLUMN IF NOT EXISTS cover_color           TEXT,
  ADD COLUMN IF NOT EXISTS icon_key              TEXT,
  ADD COLUMN IF NOT EXISTS master_task_id        UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Index on master_task_id for fast subtask lookup
CREATE INDEX IF NOT EXISTS idx_tasks_master_task_id
  ON public.tasks(master_task_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. task_remarks — Append-only structured state-change log
-- ─────────────────────────────────────────────────────────────────────────────
-- Distinct from task_comments (threaded discussion).
-- task_remarks = "what changed and why" — an agent's work log entry.

CREATE TABLE IF NOT EXISTS public.task_remarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id        UUID NOT NULL REFERENCES public.profiles(id),
  content          TEXT NOT NULL CHECK (char_length(content) <= 1000),
  state_at_time    TEXT NOT NULL
    CHECK (state_at_time IN ('todo','in_progress','in_review','done','blocked','error','cancelled')),
  progress_at_time INTEGER CHECK (progress_at_time >= 0 AND progress_at_time <= 100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Realtime requires REPLICA IDENTITY FULL on any realtime-subscribed table
ALTER TABLE public.task_remarks REPLICA IDENTITY FULL;

-- ── RLS on task_remarks ─────────────────────────────────────

ALTER TABLE public.task_remarks ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users in the same domain as the task's project,
-- or privileged roles.
CREATE POLICY "task_remarks_select" ON public.task_remarks
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          t.domain = (SELECT domain::text FROM public.profiles WHERE id = auth.uid())
          OR (SELECT domain::text FROM public.profiles WHERE id = auth.uid()) = 'indulge_global'
        )
    )
  );

-- INSERT: assignee, project member, or privileged role.
CREATE POLICY "task_remarks_insert" ON public.task_remarks
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      get_user_role() IN ('admin', 'founder', 'manager')
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_remarks.task_id
          AND (
            t.assigned_to_users @> ARRAY[auth.uid()]
            OR t.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.project_members pm
              WHERE pm.project_id = t.project_id
                AND pm.user_id = auth.uid()
            )
          )
      )
    )
  );

-- No UPDATE policy — append-only.
-- No DELETE policy — append-only.

-- Service role bypass (for internal bulk operations)
CREATE POLICY "task_remarks_service_role_insert" ON public.task_remarks
  FOR INSERT TO service_role
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. import_batches — Google Sheets import audit trail
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  master_task_id   UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source           TEXT NOT NULL DEFAULT 'google_sheets'
    CHECK (source = 'google_sheets'),
  row_count        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed')),
  error_log        JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_select" ON public.import_batches
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder', 'manager')
  );

CREATE POLICY "import_batches_insert" ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE only for the creator (to set status/completed_at) or privileged
CREATE POLICY "import_batches_update" ON public.import_batches
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR get_user_role() IN ('admin', 'founder')
  );

CREATE POLICY "import_batches_service_role" ON public.import_batches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Add FK from tasks to import_batches now that the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_import_batch_id_fk'
      AND table_name = 'tasks'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_import_batch_id_fk
      FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;
  END IF;
END $$;
