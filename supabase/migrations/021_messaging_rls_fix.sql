-- ── Migration 021: Fix RLS recursion + SECURITY DEFINER helpers ───────────────
--
-- Root cause: the cp_select policy on conversation_participants referenced the
-- SAME table inside its USING clause, causing PostgreSQL to throw:
--   "infinite recursion detected in policy for relation conversation_participants"
--
-- Fix: simplify cp_select to the non-recursive `user_id = auth.uid()`.
-- All cross-user lookups (find/create DMs, list conversations) are moved into
-- SECURITY DEFINER functions that bypass RLS safely.
--
-- RUN THIS in Supabase SQL Editor after migration 020.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix the recursive RLS policy ──────────────────────────────────────────

DROP POLICY IF EXISTS "cp_select" ON public.conversation_participants;

-- Non-recursive: each user can only read their own participant rows.
-- Cross-user lookups go through SECURITY DEFINER RPCs below.
CREATE POLICY "cp_select" ON public.conversation_participants
  FOR SELECT USING (user_id = auth.uid());

-- ── 2. find_direct_conversation ───────────────────────────────────────────────
-- Returns the UUID of an existing 1-on-1 conversation between the caller and
-- other_user_id, or NULL if none exists.

CREATE OR REPLACE FUNCTION public.find_direct_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM   public.conversations            c
  JOIN   public.conversation_participants cp1
    ON   cp1.conversation_id = c.id AND cp1.user_id = auth.uid()
  JOIN   public.conversation_participants cp2
    ON   cp2.conversation_id = c.id AND cp2.user_id = other_user_id
  WHERE  c.type = 'direct'
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.find_direct_conversation(uuid) TO authenticated;

-- ── 3. create_direct_conversation ─────────────────────────────────────────────
-- Creates a new 1-on-1 conversation and adds both participants atomically.
-- Guards against races: returns existing conv if created concurrently.

CREATE OR REPLACE FUNCTION public.create_direct_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id uuid;
BEGIN
  -- Race-condition guard: check again inside the transaction
  SELECT c.id INTO conv_id
  FROM   public.conversations            c
  JOIN   public.conversation_participants cp1
    ON   cp1.conversation_id = c.id AND cp1.user_id = auth.uid()
  JOIN   public.conversation_participants cp2
    ON   cp2.conversation_id = c.id AND cp2.user_id = other_user_id
  WHERE  c.type = 'direct'
  LIMIT  1;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  INSERT INTO public.conversations (type)
  VALUES ('direct')
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (conv_id, auth.uid()), (conv_id, other_user_id);

  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;

-- ── 4. get_my_direct_conversations ────────────────────────────────────────────
-- Returns the full DM list for the calling user: peer info, last message,
-- unread count. Single round-trip, replaces the 5-step client pipeline.

CREATE OR REPLACE FUNCTION public.get_my_direct_conversations()
RETURNS TABLE (
  conversation_id uuid,
  peer_id         uuid,
  peer_name       text,
  peer_role       public.user_role,
  last_message    text,
  last_message_at timestamptz,
  unread_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_convs AS (
    SELECT cp.conversation_id,
           cp.last_read_at
    FROM   public.conversation_participants cp
    JOIN   public.conversations c ON c.id = cp.conversation_id
    WHERE  cp.user_id = auth.uid()
      AND  c.type     = 'direct'
  ),
  peers AS (
    SELECT cp.conversation_id,
           cp.user_id AS peer_id
    FROM   public.conversation_participants cp
    JOIN   my_convs mc ON mc.conversation_id = cp.conversation_id
    WHERE  cp.user_id != auth.uid()
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
           m.conversation_id,
           m.content    AS last_message,
           m.created_at AS last_message_at
    FROM   public.messages m
    JOIN   my_convs mc ON mc.conversation_id = m.conversation_id
    ORDER  BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.conversation_id,
           count(*) AS cnt
    FROM   public.messages m
    JOIN   my_convs mc ON mc.conversation_id = m.conversation_id
    WHERE  m.sender_id != auth.uid()
      AND  (mc.last_read_at IS NULL
            OR m.created_at > mc.last_read_at)
    GROUP  BY m.conversation_id
  )
  SELECT mc.conversation_id,
         p.peer_id,
         pr.full_name                AS peer_name,
         pr.role                     AS peer_role,
         lm.last_message,
         lm.last_message_at,
         COALESCE(u.cnt, 0)          AS unread_count
  FROM   my_convs    mc
  JOIN   peers       p   ON  p.conversation_id  = mc.conversation_id
  JOIN   public.profiles pr ON pr.id            = p.peer_id
  LEFT JOIN last_msgs lm ON lm.conversation_id  = mc.conversation_id
  LEFT JOIN unread    u  ON  u.conversation_id   = mc.conversation_id
  ORDER  BY lm.last_message_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_direct_conversations() TO authenticated;
