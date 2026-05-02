-- Mirror SELECT (083): group-task members may append task_remarks on subtasks tied to
-- their group row, even when not assignee / creator / project_members.

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
            OR (
              t.unified_task_type = 'subtask'
              AND t.parent_group_task_id IS NOT NULL
              AND public.is_group_task_member(t.parent_group_task_id)
            )
          )
      )
    )
  );
