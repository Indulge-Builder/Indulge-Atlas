-- =============================================================================
-- INDULGE ATLAS — Project Task System: Comments and Progress Log
-- Migration 064: task_comments, task_progress_updates, Realtime publication
-- =============================================================================
-- New tables only. No ALTER on existing tables.
-- task_progress_updates is append-only (no UPDATE/DELETE policies).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLE: task_comments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.task_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    text        NOT NULL,
  edited_at  timestamptz NULL,
  is_system  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_comments IS 'Human and system-generated comments on project tasks.';
COMMENT ON COLUMN public.task_comments.is_system IS 'true = system-generated (e.g. "Task marked complete by X"). false = human comment.';
COMMENT ON COLUMN public.task_comments.edited_at IS 'Set when author edits their comment.';

CREATE INDEX task_comments_task_idx      ON public.task_comments (task_id, created_at ASC);
CREATE INDEX task_comments_author_idx    ON public.task_comments (author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLE: task_progress_updates (append-only structured progress log)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.task_progress_updates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  updated_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_progress integer     NOT NULL CHECK (previous_progress >= 0 AND previous_progress <= 100),
  new_progress      integer     NOT NULL CHECK (new_progress >= 0 AND new_progress <= 100),
  previous_status   text        NOT NULL,
  new_status        text        NOT NULL,
  note              text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_progress_updates IS 'Append-only log of task progress changes. No UPDATE or DELETE allowed.';
COMMENT ON COLUMN public.task_progress_updates.note IS 'Optional note attached to the progress change ("What did you accomplish?").';

CREATE INDEX task_progress_task_idx  ON public.task_progress_updates (task_id, created_at ASC);
CREATE INDEX task_progress_user_idx  ON public.task_progress_updates (updated_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.task_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_progress_updates ENABLE ROW LEVEL SECURITY;

-- Helper: can current user access a task's project?
-- (Avoids repeating the subquery in every policy)
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND (
        public.get_user_role() IN ('admin', 'founder')
        OR auth.uid() = ANY(t.assigned_to_users)
        OR (
          t.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = t.project_id AND pm.user_id = auth.uid()
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;

-- ── task_comments ─────────────────────────────────────────────────────────────

CREATE POLICY "task_comments_service_all" ON public.task_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Any project member can read comments
CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT TO authenticated
  USING (public.can_access_task(task_id));

-- Any project member can write comments (content sanitized in server action)
CREATE POLICY "task_comments_insert" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_access_task(task_id)
  );

-- Only the author can edit their own comments
CREATE POLICY "task_comments_update" ON public.task_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Author or project manager can delete comments
CREATE POLICY "task_comments_delete" ON public.task_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.get_user_role() IN ('admin', 'founder')
    OR (
      EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
          AND t.project_id IS NOT NULL
          AND public.get_project_member_role(t.project_id) IN ('owner', 'manager')
      )
    )
  );

-- ── task_progress_updates (APPEND-ONLY — no UPDATE or DELETE policies) ────────

CREATE POLICY "task_progress_service_all" ON public.task_progress_updates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Project members can read progress history
CREATE POLICY "task_progress_select" ON public.task_progress_updates
  FOR SELECT TO authenticated
  USING (public.can_access_task(task_id));

-- Assignees and project members can INSERT progress updates
CREATE POLICY "task_progress_insert" ON public.task_progress_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    updated_by = auth.uid()
    AND public.can_access_task(task_id)
  );

-- NO UPDATE policy (append-only by design)
-- NO DELETE policy (append-only by design)

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments         TO authenticated;
GRANT SELECT, INSERT               ON public.task_progress_updates TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REPLICA IDENTITY FULL (required for Realtime UPDATE payloads)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.task_comments         REPLICA IDENTITY FULL;
ALTER TABLE public.task_progress_updates REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ENABLE REALTIME
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_progress_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_progress_updates;
  END IF;
END $$;

-- Note: public.tasks already has Realtime enabled (migration 046).
-- The tasks UPDATE subscription in useTaskRealtime.ts uses the existing publication.
