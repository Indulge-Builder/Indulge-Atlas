-- =============================================================================
-- Normalized lead_activities inserts (043) only set actor_id / action_type /
-- details. Legacy columns performed_by and type stayed NOT NULL, so inserts
-- from reassignLead and logLeadActivity failed until those rows were filled.
-- Allow NULL on legacy columns when the new shape is used; backfill is not
-- required for new rows.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_activities'
      AND column_name = 'performed_by'
  ) THEN
    ALTER TABLE public.lead_activities
      ALTER COLUMN performed_by DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_activities'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.lead_activities
      ALTER COLUMN type DROP NOT NULL;
  END IF;
END $$;
