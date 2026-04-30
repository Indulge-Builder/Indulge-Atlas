-- ============================================================
-- Indulge Atlas — Task Notification Layer
-- Scoped to group task events only
-- ============================================================

-- 1. Notification type enum
CREATE TYPE task_notification_type AS ENUM (
  'subtask_assigned',
  'subtask_updated',
  'group_task_added'
);

-- 2. Main table
CREATE TABLE IF NOT EXISTS public.task_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            task_notification_type NOT NULL,
  task_id         uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  parent_task_id  uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes (no volatile predicates — partial index on created_at + interval is invalid in PG)
CREATE INDEX idx_task_notifications_recipient_created
  ON public.task_notifications(recipient_id, created_at DESC);

CREATE INDEX idx_task_notifications_unread
  ON public.task_notifications(recipient_id)
  WHERE read_at IS NULL;

-- 4. RLS
ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON public.task_notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notif_update_read_at" ON public.task_notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- 5. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'task_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notifications;
  END IF;
END $$;
