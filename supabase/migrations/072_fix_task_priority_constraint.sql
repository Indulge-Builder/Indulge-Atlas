-- =============================================================================
-- INDULGE ATLAS — Fix task priority constraint
-- Migration 072: Add 'critical' to the tasks.priority CHECK constraint
-- =============================================================================
--
-- Migration 063 added the priority column with:
--   CHECK (priority IN ('urgent', 'high', 'medium', 'low') OR priority IS NULL)
--
-- The application Zod schema (taskPrioritySchema) uses:
--   ["critical", "high", "medium", "low"]
--
-- This mismatch caused inserts with priority = 'critical' to fail with a
-- DB constraint violation. This migration:
--   1. Drops the old constraint
--   2. Recreates it with 'critical' included and 'urgent' kept for backwards compat
--   3. Backfills any existing 'urgent' rows to 'critical' (canonical app value)
-- =============================================================================

-- Drop the old constraint
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;

-- Recreate with all valid values
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('critical', 'urgent', 'high', 'medium', 'low') OR priority IS NULL);

-- Normalise legacy 'urgent' rows to 'critical' (they map to the same UI level)
UPDATE public.tasks
SET priority = 'critical'
WHERE priority = 'urgent';
