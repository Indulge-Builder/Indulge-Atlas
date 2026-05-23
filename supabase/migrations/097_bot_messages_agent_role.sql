-- Allow 'agent' role in bot_messages (manual agent replies from Atlas)
ALTER TABLE public.bot_messages
  DROP CONSTRAINT IF EXISTS bot_messages_role_check;

ALTER TABLE public.bot_messages
  ADD CONSTRAINT bot_messages_role_check
  CHECK (role IN ('user', 'assistant', 'agent'));
