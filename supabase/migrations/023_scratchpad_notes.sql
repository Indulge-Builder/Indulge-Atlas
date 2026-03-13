-- ── Migration 023: User Scratchpad Notes ───────────────────────────────────────
--
-- Creates the user_scratchpad_notes table for the "Clear Mind" workspace module.
-- Notes are append-only by design — immutable once "torn off" and filed.
-- Strict RLS ensures each user can only ever access their own notes.
--
-- RUN IN: Supabase SQL Editor (safe to re-run — uses IF NOT EXISTS)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_scratchpad_notes (
  id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT         NOT NULL CHECK (char_length(body) > 0),
  created_at TIMESTAMPTZ  DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scratchpad_notes_user_created
  ON public.user_scratchpad_notes (user_id, created_at DESC);

ALTER TABLE public.user_scratchpad_notes ENABLE ROW LEVEL SECURITY;

-- Users may only read their own notes
CREATE POLICY "scratchpad_select_own"
  ON public.user_scratchpad_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users may only insert notes tied to themselves
CREATE POLICY "scratchpad_insert_own"
  ON public.user_scratchpad_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies — notes are immutable once filed
