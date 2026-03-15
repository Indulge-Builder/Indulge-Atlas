-- Multi-assignee support for tasks: replace assigned_to (single UUID) with assigned_to_users (UUID[])
-- Enables cross-departmental task assignments and Avatar Stack UI.

-- 1. Add new column
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_to_users uuid[] NOT NULL DEFAULT '{}';

-- 2. Migrate existing data (only if assigned_to column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'assigned_to'
  ) THEN
    UPDATE public.tasks
    SET assigned_to_users = ARRAY[assigned_to]
    WHERE assigned_to IS NOT NULL AND (assigned_to_users IS NULL OR assigned_to_users = '{}' OR array_length(assigned_to_users, 1) IS NULL);
  END IF;
END $$;

-- 3. Drop RLS policies that depend on assigned_to (must happen before dropping column)
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;

-- 4. Drop old column (if exists)
ALTER TABLE public.tasks DROP COLUMN IF EXISTS assigned_to;

-- 5. Enforce at least one assignee
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assigned_to_users_not_empty
  CHECK (array_length(assigned_to_users, 1) >= 1);

-- 6. GIN index for efficient "user in array" queries (auth.uid() = ANY(assigned_to_users))
CREATE INDEX IF NOT EXISTS tasks_assigned_to_users_gin_idx
  ON public.tasks USING GIN (assigned_to_users);

-- 7. Drop old index (was on assigned_to)
DROP INDEX IF EXISTS public.tasks_assigned_to_idx;

-- 8. Recreate RLS policies using assigned_to_users
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    auth.uid() = ANY(assigned_to_users)
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    (public.get_role_from_jwt() = 'agent' AND auth.uid() = ANY(assigned_to_users))
    OR public.get_role_from_jwt() IN ('scout', 'admin')
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    auth.uid() = ANY(assigned_to_users)
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

COMMENT ON COLUMN public.tasks.assigned_to_users IS 'Array of user IDs assigned to this task. At least one required.';
