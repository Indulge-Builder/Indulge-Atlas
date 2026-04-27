-- Migration 074: Publish task_groups for Supabase Realtime (column / board structure)
ALTER TABLE public.task_groups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_groups;
  END IF;
END $$;
