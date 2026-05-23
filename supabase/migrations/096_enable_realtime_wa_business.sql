-- Enable realtime for wa-business inbox
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_sessions;
