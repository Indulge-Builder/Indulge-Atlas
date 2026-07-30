-- Migration 105: Explicit Chetto mapping backlog (61-client export snapshot).
-- Surfaced at /clients/chetto-unmapped for manual group assignment.

CREATE TABLE IF NOT EXISTS public.client_chetto_unmapped_queue (
  client_id     uuid        PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  queendom      text        NULL,
  source        text        NOT NULL DEFAULT 'export',
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'resolved')),
  queued_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_client_chetto_unmapped_queue_pending
  ON public.client_chetto_unmapped_queue (queued_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.client_chetto_unmapped_queue IS
  'Tracked backlog of clients still missing clients.chetto_group_id (manual mapping queue).';

ALTER TABLE public.client_chetto_unmapped_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_chetto_unmapped_queue_select"
  ON public.client_chetto_unmapped_queue FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_unmapped_queue_insert"
  ON public.client_chetto_unmapped_queue FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_unmapped_queue_update"
  ON public.client_chetto_unmapped_queue FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
  );

CREATE POLICY "client_chetto_unmapped_queue_service_role"
  ON public.client_chetto_unmapped_queue
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.resolve_chetto_unmapped_queue_on_map()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.chetto_group_id IS NOT NULL
     AND (OLD.chetto_group_id IS NULL OR OLD.chetto_group_id IS DISTINCT FROM NEW.chetto_group_id)
  THEN
    UPDATE public.client_chetto_unmapped_queue
    SET status = 'resolved', resolved_at = now()
    WHERE client_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_chetto_unmapped_queue ON public.clients;

CREATE TRIGGER trg_resolve_chetto_unmapped_queue
  AFTER UPDATE OF chetto_group_id ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_chetto_unmapped_queue_on_map();
