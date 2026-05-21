-- Chetto Joule group id linked to a client (explicit mapping; avoids scanning all groups per load).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chetto_group_id text NULL;

COMMENT ON COLUMN public.clients.chetto_group_id IS
  'Chetto / Joule messaging group id for this client. When set, Atlas loads timeline via this id instead of phone-scanning.';

CREATE INDEX IF NOT EXISTS idx_clients_chetto_group_id
  ON public.clients (chetto_group_id)
  WHERE chetto_group_id IS NOT NULL;
