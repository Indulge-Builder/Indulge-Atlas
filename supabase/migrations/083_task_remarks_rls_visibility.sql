-- Align task_remarks SELECT with how users can see parent tasks (assignee, creator,
-- project member, group-task member). Previously only domain / indulge_global / lead
-- collaborator matched — cross-domain project members could INSERT remarks (RLS)
-- but not SELECT them, so timeline looked empty after refresh and peers saw nothing.

DROP POLICY IF EXISTS "task_remarks_select" ON public.task_remarks;

CREATE POLICY "task_remarks_select" ON public.task_remarks
  FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder', 'manager', 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_remarks.task_id
        AND (
          t.domain = (SELECT domain::text FROM public.profiles WHERE id = auth.uid())
          OR (SELECT domain::text FROM public.profiles WHERE id = auth.uid()) = 'indulge_global'
          OR get_user_role() = 'manager'
          OR (
            t.lead_id IS NOT NULL
            AND public.is_lead_collaborator(t.lead_id)
          )
          OR t.assigned_to_users @> ARRAY[auth.uid()]
          OR t.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = t.project_id
              AND pm.user_id = auth.uid()
          )
          OR (
            t.unified_task_type = 'subtask'
            AND t.parent_group_task_id IS NOT NULL
            AND public.is_group_task_member(t.parent_group_task_id)
          )
        )
    )
  );

-- Parity with tasks / group-task policies: super_admin may post/read remarks via privileged path.
DROP POLICY IF EXISTS "task_remarks_insert" ON public.task_remarks;

CREATE POLICY "task_remarks_insert" ON public.task_remarks
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      get_user_role() IN ('admin', 'founder', 'manager', 'super_admin')
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
