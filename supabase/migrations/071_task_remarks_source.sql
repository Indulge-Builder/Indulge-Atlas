-- migration 071: add source column to task_remarks for timeline event type differentiation
-- source values: 'agent' (human update), 'system' (auto-logged structural change), 'elia' (AI)

ALTER TABLE public.task_remarks
  ADD COLUMN IF NOT EXISTS source TEXT
    NOT NULL DEFAULT 'agent'
    CHECK (source IN ('agent', 'system', 'elia'));

-- Index for filtering by source type (e.g. system vs agent in the feed)
CREATE INDEX IF NOT EXISTS idx_task_remarks_source
  ON public.task_remarks (source);

-- Add previous_status column to record status transitions
ALTER TABLE public.task_remarks
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- Enable replica identity full so Realtime broadcasts all columns on INSERT
ALTER TABLE public.task_remarks REPLICA IDENTITY FULL;

-- ── Atlas System Author ────────────────────────────────────────────────────────
-- Insert a synthetic system profile row used for automated log entries.
-- UUID is fixed and also defined as ATLAS_SYSTEM_AUTHOR_ID in lib/types/database.ts.
-- This row bypasses domain/department constraints by using a sentinel domain value.
-- RLS on task_remarks allows inserts from service_role (which server actions use).

INSERT INTO public.profiles (
  id,
  full_name,
  role,
  domain,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Atlas System',
  'agent',
  'indulge_global',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
