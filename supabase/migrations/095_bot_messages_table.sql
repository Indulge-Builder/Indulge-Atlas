-- Migration 095: bot_messages table for WA Business conversation log
-- Each inbound and outbound bot message is stored here for the WA Business dashboard.

CREATE TABLE public.bot_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated staff can read all bot messages
CREATE POLICY "bot_messages_select_authenticated"
  ON public.bot_messages
  FOR SELECT
  TO authenticated
  USING (get_user_role() IN ('admin', 'founder', 'manager', 'agent'));

-- Service role bypass for chatbot writes
CREATE POLICY "bot_messages_service_role_all"
  ON public.bot_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_bot_messages_session_id ON public.bot_messages(session_id);
CREATE INDEX idx_bot_messages_created_at ON public.bot_messages(created_at DESC);
