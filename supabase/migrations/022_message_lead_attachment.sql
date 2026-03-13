-- ── Migration 022: Lead attachment on messages ────────────────────────────────
--
-- Adds an optional lead_id column to the messages table so team members can
-- attach a lead card to any message. Recipients can click through to the lead
-- profile directly from the chat thread.
--
-- RUN IN: Supabase SQL Editor (safe to re-run — uses IF NOT EXISTS)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS lead_id UUID
    REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_lead_id
  ON public.messages(lead_id)
  WHERE lead_id IS NOT NULL;
