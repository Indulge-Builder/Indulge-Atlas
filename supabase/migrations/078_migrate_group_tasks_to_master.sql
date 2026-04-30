-- ============================================================
-- Indulge Atlas — Omni-Task: retire unified_task_type = 'group'
-- Migration 078: Backfill master workspace model for legacy rows
-- ============================================================

BEGIN;

-- 1) Promote collaborative "group" workspaces to master tasks
UPDATE public.tasks
SET unified_task_type = 'master'
WHERE unified_task_type = 'group';

-- 2) Ensure every promoted workspace has a projects row (required for project_members / task_groups FKs)
INSERT INTO public.projects (
  id,
  title,
  description,
  owner_id,
  department,
  domain,
  color,
  icon,
  due_date,
  status
)
SELECT
  t.id,
  t.title,
  COALESCE(t.notes, ''),
  COALESCE(
    t.created_by,
    (SELECT g.user_id FROM public.group_task_members g
     WHERE g.task_id = t.id AND g.role = 'owner' LIMIT 1),
    (SELECT g.user_id FROM public.group_task_members g
     WHERE g.task_id = t.id ORDER BY g.added_at ASC LIMIT 1)
  ),
  t.department,
  t.domain,
  t.cover_color,
  t.icon_key,
  CASE WHEN t.due_date IS NOT NULL THEN (t.due_date::date) ELSE NULL END,
  'active'
FROM public.tasks t
WHERE t.unified_task_type = 'master'
  AND EXISTS (SELECT 1 FROM public.group_task_members g WHERE g.task_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = t.id);

-- 3) Default Kanban columns when missing (mirrors createMasterTask seed)
INSERT INTO public.task_groups (project_id, title, position, created_by)
SELECT
  p.id,
  x.title,
  x.pos,
  COALESCE(t.created_by, p.owner_id)
FROM public.projects p
JOIN public.tasks t ON t.id = p.id
CROSS JOIN (
  VALUES ('To do', 0), ('In progress', 1), ('Done', 2)
) AS x(title, pos)
WHERE EXISTS (SELECT 1 FROM public.group_task_members g WHERE g.task_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.project_id = p.id);

-- 4) Mirror membership into project_members (Atlas workspace ACL)
INSERT INTO public.project_members (project_id, user_id, role, added_by, added_at)
SELECT
  g.task_id,
  g.user_id,
  CASE g.role
    WHEN 'owner' THEN 'owner'
    WHEN 'contributor' THEN 'member'
    WHEN 'reviewer' THEN 'viewer'
    ELSE 'member'
  END::text,
  g.added_by,
  g.added_at
FROM public.group_task_members g
INNER JOIN public.tasks t ON t.id = g.task_id AND t.unified_task_type = 'master'
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 5) Attach legacy group subtasks to the Atlas board model (project_id + first column)
UPDATE public.tasks st
SET
  project_id = st.parent_group_task_id,
  master_task_id = st.parent_group_task_id,
  parent_group_task_id = NULL,
  visibility = 'org',
  group_id = (
    SELECT tg.id
    FROM public.task_groups tg
    WHERE tg.project_id = st.parent_group_task_id
    ORDER BY tg.position ASC NULLS LAST, tg.created_at ASC
    LIMIT 1
  )
WHERE st.unified_task_type = 'subtask'
  AND st.parent_group_task_id IS NOT NULL;

-- 6) Self-link master rows as their own project anchor (matches createMasterTask)
UPDATE public.tasks t
SET
  project_id = t.id,
  master_task_id = t.id
WHERE t.unified_task_type = 'master'
  AND t.project_id IS NULL
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = t.id);

UPDATE public.tasks
SET visibility = 'org'
WHERE unified_task_type = 'master'
  AND visibility = 'group';

-- 7) Drop legacy unified_task_type value from CHECK constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_unified_task_type_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_unified_task_type_check
  CHECK (unified_task_type IN ('master', 'subtask', 'personal'));

COMMIT;
