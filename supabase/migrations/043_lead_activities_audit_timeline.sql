-- =============================================================================
-- INDULGE ATLAS — Lead Activities Audit Timeline
-- =============================================================================
-- Introduces normalized lead_activities schema for immutable timeline entries.
-- Compatible with existing deployments by migrating legacy columns when present.

DO $$
BEGIN
  IF to_regclass('public.lead_activities') IS NULL THEN
    CREATE TABLE public.lead_activities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      action_type text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE public.lead_activities
      ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS action_type text,
      ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

    -- Backfill from legacy schema if these columns existed previously.
    UPDATE public.lead_activities
    SET actor_id = COALESCE(actor_id, performed_by)
    WHERE actor_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'lead_activities'
          AND column_name = 'performed_by'
      );

    UPDATE public.lead_activities
    SET action_type = COALESCE(
      action_type,
      CASE
        WHEN type = 'status_change' THEN 'status_changed'
        WHEN type = 'note' THEN 'note_added'
        WHEN type = 'task_created' THEN 'note_added'
        WHEN type = 'call_attempt' THEN 'note_added'
        ELSE 'note_added'
      END
    )
    WHERE action_type IS NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'lead_activities'
          AND column_name = 'type'
      );

    UPDATE public.lead_activities
    SET details = COALESCE(details, payload, '{}'::jsonb)
    WHERE EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'lead_activities'
        AND column_name = 'payload'
    );

    ALTER TABLE public.lead_activities
      ALTER COLUMN action_type SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_activities_lead_id_idx
  ON public.lead_activities(lead_id);

CREATE INDEX IF NOT EXISTS lead_activities_actor_id_idx
  ON public.lead_activities(actor_id);

CREATE INDEX IF NOT EXISTS lead_activities_action_type_idx
  ON public.lead_activities(action_type);

CREATE INDEX IF NOT EXISTS lead_activities_created_at_desc_idx
  ON public.lead_activities(created_at DESC);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_activities_select_by_domain" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert_by_role" ON public.lead_activities;

CREATE POLICY "lead_activities_select_by_domain" ON public.lead_activities
  FOR SELECT USING (
    public.get_role_from_jwt() IN ('agent', 'scout', 'viewer')
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_activities.lead_id
        AND l.domain = public.get_my_domain()
    )
  );

CREATE POLICY "lead_activities_insert_by_role" ON public.lead_activities
  FOR INSERT WITH CHECK (
    public.get_role_from_jwt() IN ('agent', 'scout')
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_activities.lead_id
        AND l.domain = public.get_my_domain()
    )
  );
