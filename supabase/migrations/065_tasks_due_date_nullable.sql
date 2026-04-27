-- =============================================================================
-- INDULGE ATLAS — Make tasks.due_date nullable
-- Migration 065
-- =============================================================================
-- The original tasks table defined due_date as NOT NULL (timestamptz).
-- Project tasks created inline don't always have a due date, so we drop
-- that constraint here. Existing lead/shop tasks are not affected because
-- they always supply a due_date when created.
-- =============================================================================

ALTER TABLE public.tasks ALTER COLUMN due_date DROP NOT NULL;
