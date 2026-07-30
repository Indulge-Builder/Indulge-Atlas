-- Migration 119: Atlas Chat System (Phase 1) — WhatsApp conversation archive.
--
-- One durable, append-only record of every client's private Genie conversation,
-- written by TWO independent pipelines and read as ONE thread:
--   * importer  — batch backfill of historical exports   (source = 'import')
--   * listener  — live capture of new messages           (source = 'live')
-- The chat screen never learns which pipeline produced a row.
--
-- Creates, in FK-dependency order:
--   wa_client_groups        conversation ⇄ client mapping (the AUTHORIZATION ANCHOR)
--   wa_group_messages       the archive itself (append-only)
--   wa_unmapped_messages    listener safety net — a message is never dropped
--   wa_auth_state           listener session credentials (never API-reachable)
--   wa_listener_heartbeat   liveness, single row
--   wa_import_runs          importer audit trail / idempotency proof
--
-- ── ACCESS MODEL ────────────────────────────────────────────────────────────
-- Atlas has NO client-facing login: `clients` are CRM records with no auth.users
-- link, and user_role is (admin|founder|super_admin|manager|agent|guest). So the
-- real question is "which STAFF member may read this conversation?", and the
-- answer is deliberately identical to "who may read the client record" —
-- can_access_wa_client() mirrors the live "clients_select" policy (migration 103)
-- verbatim. Exactly one authorization path; nothing to drift from.
--
-- Unmapped conversations (client_id IS NULL) are visible in the GROUP LIST to
-- privileged roles only, for triage. Their MESSAGES are visible to no one via the
-- API until a human maps them — invariant: no message is shown to the wrong client.
--
-- Append-only is enforced BY OMISSION: these tables have SELECT policies and no
-- INSERT/UPDATE/DELETE policies. Both pipelines write as roles that bypass RLS.

-- ── 1. wa_client_groups — the authorization anchor ──────────────────────────
--
-- Two deliberate nullabilities, for opposite reasons:
--   group_jid IS NULL  → history-only conversation; the listener has not attached yet.
--   client_id IS NULL  → conversation discovered but not yet mapped to a client.
-- Both defend one rule: a message is never dropped for lack of a mapping, and an
-- unmapped message is never shown to the wrong client either. The data lands;
-- visibility waits for a human.
--
-- NO fuzzy matching column and no fuzzy matching process, by design. Group names
-- are inconsistent by nature and a wrong guess attaches one client's private
-- conversation to another client — the worst failure this system can have.
-- Mapping is always an explicit human act (or inherited from one: migration 120
-- seeds from clients.chetto_group_id, which the /clients/chetto-mapping admin tool
-- populated by hand).

CREATE TABLE IF NOT EXISTS public.wa_client_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Full WhatsApp JID incl. suffix, e.g. '120363201188045462@g.us' — what the
  -- listener sees on key.remoteJid. UNIQUE so two rows never claim one conversation.
  group_jid   text        NULL UNIQUE,
  group_name  text        NOT NULL,

  -- THE authorization anchor. Every access decision joins through this column.
  client_id   uuid        NULL REFERENCES public.clients(id) ON DELETE RESTRICT,

  is_active   boolean     NOT NULL DEFAULT true,   -- soft-archive, never delete history
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_client_groups_client_id_idx
  ON public.wa_client_groups (client_id);

COMMENT ON TABLE public.wa_client_groups IS
  'One row per client conversation. Authorization anchor for the Atlas Chat System.';
COMMENT ON COLUMN public.wa_client_groups.group_jid IS
  'Full WhatsApp JID (…@g.us). NULL until the live listener attaches to a history-only conversation.';
COMMENT ON COLUMN public.wa_client_groups.client_id IS
  'NULL = unmapped: admin-triage visible, never shown in any client-scoped view.';

-- ── 2. wa_group_messages — the archive ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_group_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES public.wa_client_groups(id) ON DELETE RESTRICT,

  -- Dedup key. live: the source message id. import: sha256(group_id + sent_at_iso
  -- + sender_name + content + occurrence). `occurrence` — the index within messages
  -- sharing that exact tuple — is what stops a client who sent "ok" twice in one
  -- minute from losing the second one to the unique constraint below.
  message_key text        NOT NULL,

  -- Which pipeline wrote this row. Also locates the seam where history meets live.
  source      text        NOT NULL CHECK (source IN ('import', 'live')),

  -- Live rows carry a real sender id; history exports carry only a display name.
  -- The asymmetry is recorded rather than papered over.
  sender_jid  text        NULL,
  sender_name text        NULL,
  from_me     boolean     NOT NULL DEFAULT false,

  -- 'unsupported' is a first-class type, not an error: polls, stickers, view-once
  -- and future shapes land here WITH their full payload in `raw`. One weird message
  -- must never break ingestion, and must never be silently discarded.
  -- 'system' messages ("X added Y") are kept — they carry relationship context.
  type        text        NOT NULL CHECK (type IN
                ('text', 'image', 'video', 'audio', 'document', 'system', 'unsupported')),
  content     text        NULL,       -- body, or caption for media
  -- Path in the private 'wa-media' bucket: wa/{group_id}/{message_key}.{ext}
  -- NULL for text AND when history omitted the file. A missing image is a gap in a
  -- thread; a missing message is a gap in a conversation. Only the first is allowed.
  media_path  text        NULL,

  -- The SOURCE send time, never insert time. The importer writes years of history in
  -- one minute and the listener rewrites old rows on reconnect; ordering by insert
  -- time would scramble the thread.
  sent_at     timestamptz NOT NULL,
  -- Tiebreaker. History timestamps have MINUTE precision, so five messages in one
  -- minute share a sent_at and the thread would visibly shuffle on every load.
  seq         integer     NULL,

  -- Full live payload / original history line. Duplicates the typed columns above
  -- and is kept anyway: a later extraction phase will want replies, quotes, forwards,
  -- mentions and reactions. Storage is cheap; a discarded payload is gone forever.
  raw         jsonb       NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),   -- audit only, NEVER used for ordering

  -- PER-CONVERSATION, never global. Source message ids are unique within a
  -- conversation, not across them: a global UNIQUE(message_key) reads tidier and is
  -- a latent data-loss bug — two different messages in two conversations will
  -- eventually collide and the second would be silently rejected.
  CONSTRAINT wa_group_messages_group_key_uniq UNIQUE (group_id, message_key)
);

-- The one index that carries the whole chat screen. Serves BOTH read patterns with
-- no sort step: the thread (filter group_id, order sent_at/seq, keyset paginate) and
-- the group list (distinct on (group_id) walks this same index for each latest row).
CREATE INDEX IF NOT EXISTS wa_group_messages_thread_idx
  ON public.wa_group_messages (group_id, sent_at DESC, seq DESC);

COMMENT ON TABLE public.wa_group_messages IS
  'Append-only conversation archive. Written by importer + listener, read as one thread.';
COMMENT ON COLUMN public.wa_group_messages.sent_at IS
  'Source send time. NOT created_at. The thread orders by (sent_at desc, seq desc).';
COMMENT ON COLUMN public.wa_group_messages.raw IS
  'Full payload, retained forever for the later extraction phase. Never trimmed.';

-- ── 3. wa_unmapped_messages — the listener's safety net ─────────────────────
--
-- A message arrives from a conversation whose JID is not in wa_client_groups.
-- Rather than drop it, the listener parks the raw payload here. A human resolves it
-- by creating the mapping, after which it can be replayed. This table is what
-- "never drop a message" means at the schema level.

CREATE TABLE IF NOT EXISTS public.wa_unmapped_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid   text        NOT NULL,
  group_name  text        NULL,        -- best-effort, helps a human map it later
  message_key text        NOT NULL,
  raw         jsonb       NOT NULL,
  sent_at     timestamptz NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,        -- set when replayed into wa_group_messages

  CONSTRAINT wa_unmapped_messages_uniq UNIQUE (group_jid, message_key)
);

CREATE INDEX IF NOT EXISTS wa_unmapped_messages_open_idx
  ON public.wa_unmapped_messages (group_jid) WHERE resolved_at IS NULL;

-- ── 4. wa_auth_state — listener session credentials ─────────────────────────
--
-- What makes the live pipeline operationally DISPOSABLE. If the Baileys session
-- lived on the box's disk, replacing the box would force a human to re-scan a QR.
-- Persisted here (via a custom auth adapter), the box is cattle: kill it, redeploy,
-- move it — the session survives. Written on nearly every message.
--
-- Holds live session credentials. RLS enabled, ZERO policies: unreachable via
-- PostgREST for anon and authenticated. Must never leave the server.

CREATE TABLE IF NOT EXISTS public.wa_auth_state (
  id         text        PRIMARY KEY,   -- 'creds' | 'key-<type>-<id>'
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_auth_state IS
  'Baileys auth state. SECRET — RLS enabled with no policies; never API-reachable.';

-- ── 5. wa_listener_heartbeat — liveness ─────────────────────────────────────
--
-- The live pipeline CANNOT backfill: every minute the process is down is
-- conversation lost forever, and a dead listener is invisible until someone asks
-- why a chat stopped updating weeks ago. A stale row here is what a monitor alarms
-- on. This table is the difference between silent permanent data loss and a page.
--
-- Single row enforced by the boolean PK + CHECK.

CREATE TABLE IF NOT EXISTS public.wa_listener_heartbeat (
  id            boolean     PRIMARY KEY DEFAULT true CHECK (id),
  last_beat_at  timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL DEFAULT 'starting'
                            CHECK (status IN ('starting', 'connected', 'reconnecting', 'logged_out', 'error')),
  connected_jid text        NULL,
  detail        jsonb       NULL
);

-- ── 6. wa_import_runs — importer audit trail ────────────────────────────────
--
-- One row per run with reconciliation counts. On a RE-RUN, rows_inserted should be
-- 0 and rows_skipped should equal messages_parsed — that is the proof, in data,
-- that the import is idempotent.

CREATE TABLE IF NOT EXISTS public.wa_import_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid        NULL REFERENCES public.wa_client_groups(id) ON DELETE SET NULL,
  source_dir      text        NOT NULL,
  source_file     text        NULL,
  dry_run         boolean     NOT NULL DEFAULT false,

  lines_read      integer     NOT NULL DEFAULT 0,
  messages_parsed integer     NOT NULL DEFAULT 0,
  lines_unparsed  integer     NOT NULL DEFAULT 0,   -- must be 0 to pass the gate
  rows_inserted   integer     NOT NULL DEFAULT 0,
  rows_skipped    integer     NOT NULL DEFAULT 0,   -- dedup hits
  media_matched   integer     NOT NULL DEFAULT 0,
  media_missing   integer     NOT NULL DEFAULT 0,

  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz NULL,
  error           text        NULL
);

-- ── 7. RLS on all six ───────────────────────────────────────────────────────

ALTER TABLE public.wa_client_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_group_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_unmapped_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_auth_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_listener_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_import_runs        ENABLE ROW LEVEL SECURITY;

-- ── 8. The auth seam ────────────────────────────────────────────────────────
--
-- THE security-critical function in this migration. Mirrors the live "clients_select"
-- policy (migration 103) EXACTLY — same four branches, same order. If client
-- visibility ever changes, both must change together; they are intentionally the
-- same rule so there is nothing to drift.
--
-- SECURITY DEFINER so the policies that call it can read `clients` without
-- recursing into clients' own RLS (same pattern as can_view_concierge_ticket, 108).

CREATE OR REPLACE FUNCTION public.can_access_wa_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND (
        c.closed_by = auth.uid()
        OR c.assigned_agent_id = auth.uid()
        OR public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
        OR EXISTS (
          SELECT 1 FROM public.lead_collaborators lc
          WHERE lc.lead_id = c.lead_origin_id
            AND lc.user_id = auth.uid()
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_access_wa_client(uuid) IS
  'Auth seam for the Chat System. Mirrors the clients_select policy verbatim — one path, no drift.';

-- The single join-through path from a conversation to the auth chain. Requires a
-- NON-NULL client_id: an unmapped conversation's messages are reachable by nobody.
CREATE OR REPLACE FUNCTION public.can_access_wa_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wa_client_groups g
    WHERE g.id = p_group_id
      AND g.client_id IS NOT NULL
      AND public.can_access_wa_client(g.client_id)
  );
$$;

-- ── 9. Policies — SELECT only. The absence of write policies IS the append-only guarantee.
--
-- wa_auth_state / wa_listener_heartbeat / wa_unmapped_messages / wa_import_runs get
-- RLS enabled and NO policies on purpose: operational tables, unreadable by anon and
-- authenticated, service-role only.

DROP POLICY IF EXISTS "wa_client_groups_select" ON public.wa_client_groups;
CREATE POLICY "wa_client_groups_select" ON public.wa_client_groups
  FOR SELECT TO authenticated
  USING (
    (client_id IS NOT NULL AND public.can_access_wa_client(client_id))
    -- Unmapped: privileged triage only, so an admin can find and map it.
    OR (client_id IS NULL AND public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager'))
  );

DROP POLICY IF EXISTS "wa_group_messages_select" ON public.wa_group_messages;
CREATE POLICY "wa_group_messages_select" ON public.wa_group_messages
  FOR SELECT TO authenticated
  USING (public.can_access_wa_group(group_id));

-- ── 10. Group-list RPC ──────────────────────────────────────────────────────
--
-- SECURITY INVOKER — the caller's RLS applies to both tables, so this RPC can never
-- become a back door around the policies above. distinct on (g.id) walks
-- wa_group_messages_thread_idx to find each conversation's latest message; the outer
-- select re-orders the list by recency (DISTINCT ON dictates the inner ORDER BY).

CREATE OR REPLACE FUNCTION public.get_wa_groups_with_last_message()
RETURNS TABLE (
  group_id             uuid,
  group_jid            text,
  group_name           text,
  client_id            uuid,
  is_active            boolean,
  last_message_at      timestamptz,
  last_message_content text,
  last_message_type    text,
  last_message_sender  text,
  last_message_from_me boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT DISTINCT ON (g.id)
      g.id, g.group_jid, g.group_name, g.client_id, g.is_active,
      m.sent_at, m.content, m.type, m.sender_name, m.from_me
    FROM public.wa_client_groups g
    LEFT JOIN public.wa_group_messages m ON m.group_id = g.id
    WHERE g.is_active
    ORDER BY g.id, m.sent_at DESC NULLS LAST, m.seq DESC NULLS LAST
  ) s
  ORDER BY s.sent_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_wa_groups_with_last_message() TO authenticated;

-- ── 11. Realtime ────────────────────────────────────────────────────────────
-- Supabase realtime re-applies the RLS above, so a subscription must be tested with
-- a real session — one that works under service role and fails under a real user is
-- the classic realtime bug.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wa_group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_group_messages;
  END IF;
END $$;

-- ── 12. Media bucket ────────────────────────────────────────────────────────
--
-- Bytes never live in Postgres — the row holds only media_path. PRIVATE bucket;
-- access is a short-TTL signed URL generated server-side at render time. Never
-- store a signed URL (it expires) and never store a source URL (it expires faster).
-- Path: wa/{group_id}/{message_key}.{ext} → foldername(name) = {'wa','<group_id>'}

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wa-media', 'wa-media', false, 104857600)  -- 100 MB
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

-- Defense in depth: server-side signing uses the service role and bypasses this, but
-- a direct authenticated request can still only touch media for a conversation the
-- caller may read. UUID-shape guard BEFORE the cast so a malformed path can never
-- raise inside the policy predicate (same pattern as 109).
DROP POLICY IF EXISTS "wa_media_read" ON storage.objects;
CREATE POLICY "wa_media_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'wa-media'
    AND (storage.foldername(name))[1] = 'wa'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.can_access_wa_group(((storage.foldername(name))[2])::uuid)
  );

-- No INSERT/UPDATE/DELETE policy on wa-media objects: both pipelines upload as
-- service role. Append-only, enforced by omission — same as the tables.

-- ── 13. wa_listener role ────────────────────────────────────────────────────
--
-- The listener box must NEVER hold the service key. It connects as this restricted
-- role: exactly the grants it needs and nothing else. Commented out until the live
-- pipeline ships (Milestone 4) — the password must be generated at that point, not
-- committed here.
--
-- CREATE ROLE wa_listener WITH LOGIN PASSWORD '<generated-at-deploy>';
-- GRANT USAGE ON SCHEMA public TO wa_listener;
-- GRANT SELECT                     ON public.wa_client_groups      TO wa_listener;
-- GRANT SELECT, INSERT, UPDATE     ON public.wa_group_messages     TO wa_listener;
-- GRANT SELECT, INSERT, UPDATE     ON public.wa_unmapped_messages  TO wa_listener;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_auth_state     TO wa_listener;
-- GRANT SELECT, INSERT, UPDATE     ON public.wa_listener_heartbeat TO wa_listener;
-- -- RLS still applies to a non-superuser role; the listener needs to bypass it:
-- ALTER TABLE public.wa_group_messages    FORCE ROW LEVEL SECURITY;
-- CREATE POLICY "wa_listener_write" ON public.wa_group_messages
--   FOR ALL TO wa_listener USING (true) WITH CHECK (true);
