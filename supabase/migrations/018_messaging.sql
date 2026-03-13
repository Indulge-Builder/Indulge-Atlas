-- ── Phase: Internal Messaging System ────────────────────────────────────────
-- Two conversation types:
--   'direct'       → 1-on-1 DM between team members
--   'lead_context' → thread anchored to a specific lead

CREATE TYPE conversation_type AS ENUM ('direct', 'lead_context');

CREATE TABLE conversations (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  type       conversation_type NOT NULL DEFAULT 'direct',
  lead_id    UUID             REFERENCES leads(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  content         TEXT        NOT NULL CHECK (char_length(content) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_messages_conversation_created  ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_conversations_lead_id          ON conversations(lead_id);
CREATE INDEX idx_conv_participants_user         ON conversation_participants(user_id);

-- Auto-bump updated_at on conversations when a new message lands
CREATE OR REPLACE FUNCTION bump_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_updated_at();

-- Enable Supabase Realtime on messages so WebSocket clients receive INSERT events
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                   ENABLE ROW LEVEL SECURITY;

-- Conversations: participants can read their own threads
CREATE POLICY "conv_select" ON conversations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conversations.id AND user_id = auth.uid()
  )
);
CREATE POLICY "conv_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "conv_update_own" ON conversations FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conversations.id AND user_id = auth.uid()
  )
);

-- Participants: readable by fellow participants
CREATE POLICY "cp_select" ON conversation_participants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
  )
);
CREATE POLICY "cp_insert" ON conversation_participants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cp_update_own" ON conversation_participants FOR UPDATE USING (user_id = auth.uid());

-- Messages: participants can read; sender can insert
CREATE POLICY "msg_select" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
  )
);
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
  )
);
