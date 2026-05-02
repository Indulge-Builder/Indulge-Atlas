-- Repair task_remarks for DBs missing 071 columns (PostgREST:
-- "Could not find the 'previous_status' column of 'task_remarks' in the schema cache").
--
-- Normalize remark body: remove old char_length CHECKs on `content`, cap at 1000 chars
-- (matches lib/schemas/tasks.ts UpdateSubTaskStatusSchema + LogUpdateForm).

-- ── previous_status (071) ───────────────────────────────────────────────────

ALTER TABLE public.task_remarks
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- ── source (071) — add column, backfill, NOT NULL, then CHECK if missing ─────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_remarks'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE public.task_remarks
      ADD COLUMN source TEXT NOT NULL DEFAULT 'agent'
      CHECK (source IN ('agent', 'system', 'elia'));
  ELSE
    UPDATE public.task_remarks SET source = 'agent' WHERE source IS NULL;
    ALTER TABLE public.task_remarks ALTER COLUMN source SET DEFAULT 'agent';
    ALTER TABLE public.task_remarks ALTER COLUMN source SET NOT NULL;
    BEGIN
      ALTER TABLE public.task_remarks
        ADD CONSTRAINT task_remarks_source_check
        CHECK (source IN ('agent', 'system', 'elia'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── content length <= 1000 ─────────────────────────────────────────────────

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'task_remarks'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%content%'
      AND pg_get_constraintdef(c.oid) ILIKE '%char_length%'
  LOOP
    EXECUTE format('ALTER TABLE public.task_remarks DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.task_remarks DROP CONSTRAINT IF EXISTS task_remarks_content_check;
ALTER TABLE public.task_remarks DROP CONSTRAINT IF EXISTS task_remarks_content_max_len;

DO $$
BEGIN
  ALTER TABLE public.task_remarks
    ADD CONSTRAINT task_remarks_content_max_len
    CHECK (char_length(content) <= 1000);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
