-- =============================================================================
-- Indulge Atlas — Ad-hoc peer tasks + Daily SOP templates (081)
-- =============================================================================
-- 1) Adds is_daily_sop_template on public.tasks (no new tables).
-- 2) Provides spawn_daily_sop_instances() for pg_cron (Postgres-native).
-- 3) Optional pg_cron schedule: daily 00:01 Asia/Kolkata == 18:31 UTC.
--
-- Supabase: enable "pg_cron" under Database → Extensions if CREATE EXTENSION
-- fails from SQL editor. Founders can run sections below manually.
-- =============================================================================

-- ── 1. Column ───────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_daily_sop_template boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.is_daily_sop_template IS
  'True = manager-owned daily SOP template (personal). pg_cron clones into assignee-owned personal tasks per active profile in the same department.';

CREATE INDEX IF NOT EXISTS idx_tasks_sop_templates
  ON public.tasks (unified_task_type, department, is_daily_sop_template)
  WHERE is_daily_sop_template = true AND archived_at IS NULL;

-- ── 2. Spawn function (SECURITY DEFINER — runs as owner, bypasses RLS) ───────

CREATE OR REPLACE FUNCTION public.spawn_daily_sop_instances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_date date := (timezone('Asia/Kolkata', now()))::date;
  -- Midday IST on that calendar day (stable “due” anchor for the SOP day)
  due_ts timestamptz :=
    (date_trunc('day', timezone('Asia/Kolkata', now())) AT TIME ZONE 'Asia/Kolkata')
    + interval '12 hours';
  inserted int;
BEGIN
  INSERT INTO public.tasks (
    title,
    notes,
    unified_task_type,
    atlas_status,
    status,
    priority,
    due_date,
    assigned_to_users,
    created_by,
    domain,
    department,
    task_type,
    progress,
    progress_updates,
    tags,
    attachments,
    visibility,
    is_daily,
    daily_date,
    is_daily_sop_template
  )
  SELECT
    tmpl.title,
    tmpl.notes,
    'personal',
    'todo',
    'pending',
    tmpl.priority,
    due_ts,
    ARRAY[p.id]::uuid[],
    p.id,
    COALESCE(p.domain::text, tmpl.domain::text),
    p.department::text,
    COALESCE(tmpl.task_type, 'general_follow_up'::public.task_type),
    0,
    '[]'::jsonb,
    COALESCE(tmpl.tags, ARRAY[]::text[]) || ARRAY[('sop_tpl:' || tmpl.id::text)::text],
    COALESCE(tmpl.attachments, '[]'::jsonb),
    'personal',
    true,
    ist_date,
    false
  FROM public.tasks tmpl
  INNER JOIN public.profiles p
    ON p.is_active = true
   AND p.department IS NOT NULL
   AND p.department::text = tmpl.department::text
   AND COALESCE(p.role::text, '') NOT IN ('admin', 'founder')
  WHERE tmpl.is_daily_sop_template = true
    AND tmpl.unified_task_type = 'personal'
    AND tmpl.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tasks x
      WHERE x.unified_task_type = 'personal'
        AND COALESCE(x.is_daily_sop_template, false) = false
        AND x.assigned_to_users @> ARRAY[p.id]::uuid[]
        AND x.daily_date = ist_date
        AND ('sop_tpl:' || tmpl.id::text) = ANY (x.tags)
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.spawn_daily_sop_instances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spawn_daily_sop_instances() TO postgres;
GRANT EXECUTE ON FUNCTION public.spawn_daily_sop_instances() TO service_role;

COMMENT ON FUNCTION public.spawn_daily_sop_instances() IS
  'Clones each active SOP template (is_daily_sop_template, personal) into one personal task per active non-executive profile in the same department for the current IST calendar day. Idempotent via sop_tpl:<template_id> tag + daily_date.';

-- ── 3. pg_cron (founders: enable extension, then run once in SQL editor) ─────
-- Daily at 00:01 Asia/Kolkata → minute 31, hour 18 UTC.
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
--   SELECT cron.schedule(
--     'indulge_spawn_daily_sops',
--     '31 18 * * *',
--     $$SELECT public.spawn_daily_sop_instances();$$
--   );
--
-- To remove: SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'indulge_spawn_daily_sops';
