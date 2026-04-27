-- Migration 075: Remove legacy tasks RLS policies superseded by migration 069 (*_v2).
-- Leaving both sets causes PERMISSIVE OR semantics — unintended union of rules.

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
