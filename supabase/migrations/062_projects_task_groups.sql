-- =============================================================================
-- INDULGE ATLAS — Project Task System: Core Tables
-- Migration 062: projects, project_members, task_groups
-- =============================================================================
-- Rule: New tables only. No ALTER on existing tables in this file.
-- RLS pattern: get_user_role() reads from profiles (post-058 hardened).
-- NOTE: Helper functions are defined AFTER the tables they reference so
--       PostgreSQL can validate the SQL function bodies at definition time.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SHARED TRIGGER FUNCTION (idempotent — safe if already created by 057)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLE: projects
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text        NULL,
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  owner_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  department  text        NULL,
  domain      text        NULL,
  color       text        NULL,
  icon        text        NULL,
  due_date    date        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.projects IS 'Top-level project containers for group task workflows.';
COMMENT ON COLUMN public.projects.owner_id IS 'Profile who created and owns this project.';
COMMENT ON COLUMN public.projects.color    IS 'Hex color string for UI visual identity.';
COMMENT ON COLUMN public.projects.icon     IS 'Lucide icon name for project identity.';

CREATE INDEX projects_owner_idx    ON public.projects (owner_id);
CREATE INDEX projects_status_idx   ON public.projects (status);
CREATE INDEX projects_updated_idx  ON public.projects (updated_at DESC);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLE: project_members
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.project_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
  added_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

COMMENT ON TABLE public.project_members IS 'Members and their roles within a project.';

CREATE INDEX project_members_project_idx  ON public.project_members (project_id);
CREATE INDEX project_members_user_idx     ON public.project_members (user_id);
CREATE INDEX project_members_role_idx     ON public.project_members (project_id, role);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLE: task_groups
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.task_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text        NULL,
  status      text        NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  position    integer     NOT NULL DEFAULT 0,
  due_date    date        NULL,
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_groups IS 'Task group / epic within a project, rendered as a board column.';
COMMENT ON COLUMN public.task_groups.position IS 'Display order within the project board (0 = first).';

CREATE INDEX task_groups_project_idx   ON public.task_groups (project_id, position);
CREATE INDEX task_groups_status_idx    ON public.task_groups (status);

CREATE TRIGGER task_groups_updated_at
  BEFORE UPDATE ON public.task_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HELPER FUNCTIONS (defined after project_members table exists)
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the current user's project role, or NULL if not a member.
CREATE OR REPLACE FUNCTION public.get_project_member_role(p_project_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.role
  FROM public.project_members pm
  WHERE pm.project_id = p_project_id
    AND pm.user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns true if the current user is a member of the project.
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_project_member_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups    ENABLE ROW LEVEL SECURITY;

-- ── projects ─────────────────────────────────────────────────────────────────

-- Service role bypass (used by webhook and internal services)
CREATE POLICY "projects_service_all" ON public.projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admins and founders can see all projects
CREATE POLICY "projects_select_admin" ON public.projects
  FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder'));

-- Project members can select their projects
CREATE POLICY "projects_select_member" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_project_member(id));

-- Any authenticated user can create a project (they become owner via server action)
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Owner or manager project members can update projects
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(id) IN ('owner', 'manager')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(id) IN ('owner', 'manager')
  );

-- Only project owner or admin/founder can delete
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(id) = 'owner'
  );

-- ── project_members ───────────────────────────────────────────────────────────

CREATE POLICY "project_members_service_all" ON public.project_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members can see all members of projects they belong to (or admin/founder)
CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.is_project_member(project_id)
  );

-- Owner/manager members or admin/founder can add members
-- Bootstrap: creator can insert themselves as owner when project.owner_id = auth.uid()
CREATE POLICY "project_members_insert" ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
    OR (
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
      )
    )
  );

-- Owner/manager members or admin/founder can update roles
CREATE POLICY "project_members_update" ON public.project_members
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
  );

-- Owner/manager members or admin/founder can remove members
CREATE POLICY "project_members_delete" ON public.project_members
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
  );

-- ── task_groups ───────────────────────────────────────────────────────────────

CREATE POLICY "task_groups_service_all" ON public.task_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "task_groups_select" ON public.task_groups
  FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.is_project_member(project_id)
  );

CREATE POLICY "task_groups_insert" ON public.task_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
  );

CREATE POLICY "task_groups_update" ON public.task_groups
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
  );

CREATE POLICY "task_groups_delete" ON public.task_groups
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR public.get_project_member_role(project_id) IN ('owner', 'manager')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_groups     TO authenticated;
