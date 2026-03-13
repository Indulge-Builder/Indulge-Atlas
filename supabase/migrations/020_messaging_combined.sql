-- ── Indulge Atlas — Messaging System (Combined Idempotent Migration) ───────────
--
-- This file combines migrations 018 + 019 into a single, safe, re-runnable
-- script. Run it once in the Supabase SQL Editor to enable all messaging
-- features. Using IF NOT EXISTS / CREATE OR REPLACE everywhere so it is
-- safe to run multiple times without errors.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. Refresh your app — messaging will be fully functional
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Enum ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'conversation_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.conversation_type AS ENUM ('direct', 'lead_context');
  END IF;
END $$;

-- ── 2. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id         UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  type       public.conversation_type NOT NULL    DEFAULT 'direct',
  lead_id    UUID                     REFERENCES public.leads(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ              NOT NULL    DEFAULT now(),
  updated_at TIMESTAMPTZ              NOT NULL    DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id)  ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id)  ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  content         TEXT        NOT NULL CHECK (char_length(content) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_id
  ON public.conversations(lead_id);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON public.conversation_participants(user_id);

-- ── 4. Trigger: bump conversations.updated_at on new message ─────────────────

CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_conversation_on_message ON public.messages;

CREATE TRIGGER trg_bump_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();

-- ── 5. Supabase Realtime ──────────────────────────────────────────────────────
-- Wrap in a block so it doesn't error if the table is already in the publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 6. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;

-- Conversations
DROP POLICY IF EXISTS "conv_select"      ON public.conversations;
DROP POLICY IF EXISTS "conv_insert"      ON public.conversations;
DROP POLICY IF EXISTS "conv_update_own"  ON public.conversations;

CREATE POLICY "conv_select" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = conversations.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "conv_update_own" ON public.conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = conversations.id AND user_id = auth.uid()
    )
  );

-- Conversation participants
DROP POLICY IF EXISTS "cp_select"      ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert"      ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_own"  ON public.conversation_participants;

CREATE POLICY "cp_select" ON public.conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "cp_insert" ON public.conversation_participants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cp_update_own" ON public.conversation_participants
  FOR UPDATE USING (user_id = auth.uid());

-- Messages
DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;

CREATE POLICY "msg_select" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- ── 7. Messaging Directory Functions (SECURITY DEFINER) ───────────────────────
--
-- Agents cannot read other profiles due to the profiles_select RLS policy.
-- These SECURITY DEFINER functions run as the DB owner and deliberately expose
-- ONLY the three non-sensitive fields (id, full_name, role) needed for the
-- messaging UI. This follows the principle of least privilege.

CREATE OR REPLACE FUNCTION public.get_messaging_directory()
RETURNS TABLE (
  id        uuid,
  full_name text,
  role      public.user_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.id != auth.uid()
  ORDER BY p.full_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_messaging_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_messaging_profile()
RETURNS TABLE (
  id        uuid,
  full_name text,
  role      public.user_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_messaging_profile() TO authenticated;
