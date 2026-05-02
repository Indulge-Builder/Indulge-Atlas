-- Exclude agent-owned “personal SOP” templates (tagged personal_sop_self) from
-- department-wide pg_cron cloning. Those instances are created idempotently from
-- the app (see ensurePersonalSelfSOPInstancesForToday in lib/actions/tasks.ts).

CREATE OR REPLACE FUNCTION public.spawn_daily_sop_instances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_date date := (timezone('Asia/Kolkata', now()))::date;
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
    AND NOT ('personal_sop_self' = ANY (COALESCE(tmpl.tags, ARRAY[]::text[])))
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
  'Clones manager-owned daily SOP templates (excludes personal_sop_self) into one personal task per active non-executive profile in the same department for the current IST calendar day.';
