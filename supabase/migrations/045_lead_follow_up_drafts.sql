-- Persist debounced follow-up draft notes per lead (Follow Up 1–3 sidebar).
-- Same access pattern as private_scratchpad: assigned agent or scout/admin.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_drafts jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.leads.follow_up_drafts IS
  'Draft strings for Follow Up 1–3 accordions; keys "1","2","3". Auto-saved from dossier sidebar.';
