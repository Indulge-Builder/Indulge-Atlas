-- Migration 073: Publish task_remarks for Supabase Realtime (timeline subscriptions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_remarks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_remarks;
  END IF;
END $$;
