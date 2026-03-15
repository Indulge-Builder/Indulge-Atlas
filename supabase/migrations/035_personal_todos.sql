-- Personal todos for Workspace "Primary Focus" — lightweight per-user to-do list.

CREATE TABLE IF NOT EXISTS public.personal_todos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user-scoped fetches
CREATE INDEX IF NOT EXISTS personal_todos_user_id_idx
  ON public.personal_todos(user_id);

-- RLS
ALTER TABLE public.personal_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_todos_select" ON public.personal_todos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "personal_todos_insert" ON public.personal_todos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "personal_todos_update" ON public.personal_todos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "personal_todos_delete" ON public.personal_todos
  FOR DELETE USING (auth.uid() = user_id);
