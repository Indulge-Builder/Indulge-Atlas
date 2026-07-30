-- Migration 131: Academy — Freshdesk ticket updates.
--
-- Depends on 125 (training_sessions + can_access_academy_session) and reuses
-- public.set_updated_at().
--
-- WHY THIS TABLE EXISTS
-- Closing the conversation used to be the finish line. It no longer is: the
-- intern must then write the Freshdesk ticket — resolution summary, internal
-- notes, public reply, status, priority, tags, time spent — and an AI reviewer
-- must pass that write-up before the request counts as handled. This mirrors the
-- real concierge loop, where the work is not done until the desk record is.
--
-- MUTABILITY — READ THIS BEFORE ADDING POLICIES
-- training_turns is APPEND-ONLY on purpose (see migration 125): it is the graded
-- transcript. This table is deliberately the opposite for as long as it is being
-- worked: the reviewer hands back concrete fixes and the intern revises in place,
-- which is the entire point of the feedback loop. The audit guarantee is instead
-- "frozen once accepted":
--   * UPDATE is permitted only while passed = false
--   * a non-service_role writer can never flip passed to true (trigger below)
-- So a ticket that has been accepted is as immutable as a turn, and one that has
-- not is freely revisable. Relaxing either half breaks the guarantee.
--
-- One row per session (UNIQUE on session_id) — a session has exactly one ticket.
--
-- IDEMPOTENT: every policy/trigger is dropped before creation.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_ticket_updates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL UNIQUE
                       REFERENCES public.training_sessions(id) ON DELETE CASCADE,

  resolution_summary text NOT NULL DEFAULT '',
  internal_notes     text NOT NULL DEFAULT '',
  public_reply       text NOT NULL DEFAULT '',

  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','pending','waiting_on_customer','resolved','closed')),
  priority           text NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high','urgent')),
  tags               text[] NOT NULL DEFAULT '{}',
  time_spent_minutes integer NOT NULL DEFAULT 0 CHECK (time_spent_minutes >= 0),

  -- Reviewer output: { passed, feedback[], scores{}, quality, model_version }.
  -- Null until the first submission has been reviewed.
  verdict            jsonb,
  passed             boolean NOT NULL DEFAULT false,
  attempts           integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),

  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_ticket_updates IS
  'Academy Freshdesk ticket write-up, one per training session. Revisable until passed = true, then frozen.';

CREATE INDEX IF NOT EXISTS training_ticket_updates_session_idx
  ON public.training_ticket_updates (session_id);

-- Lets the progress query find accepted tickets without a full scan.
CREATE INDEX IF NOT EXISTS training_ticket_updates_passed_idx
  ON public.training_ticket_updates (passed) WHERE passed;

-- ── Freeze guard ─────────────────────────────────────────────────────────────
--
-- Two guarantees, both enforced here rather than trusted to the app layer:
--   1. Only service_role may set passed = true (the verdict is server-computed).
--   2. Once passed, the row is immutable to everyone except service_role.

CREATE OR REPLACE FUNCTION public.guard_training_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.passed THEN
    RAISE EXCEPTION 'training_ticket_updates: ticket % is accepted and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.passed IS DISTINCT FROM OLD.passed THEN
    RAISE EXCEPTION 'training_ticket_updates: passed is set by the reviewer, not the client'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The verdict is the reviewer's record; interns must not author it.
  IF NEW.verdict IS DISTINCT FROM OLD.verdict THEN
    RAISE EXCEPTION 'training_ticket_updates: verdict is written by the reviewer only'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_ticket_updates_guard ON public.training_ticket_updates;
CREATE TRIGGER training_ticket_updates_guard
  BEFORE UPDATE ON public.training_ticket_updates
  FOR EACH ROW EXECUTE FUNCTION public.guard_training_ticket_update();

DROP TRIGGER IF EXISTS training_ticket_updates_set_updated_at ON public.training_ticket_updates;
CREATE TRIGGER training_ticket_updates_set_updated_at
  BEFORE UPDATE ON public.training_ticket_updates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_ticket_updates ENABLE ROW LEVEL SECURITY;

-- Interns see their own ticket; trainers see everyone's.
DROP POLICY IF EXISTS "training_ticket_updates_select" ON public.training_ticket_updates;
CREATE POLICY "training_ticket_updates_select"
  ON public.training_ticket_updates FOR SELECT TO authenticated
  USING (public.can_access_academy_session(session_id));

-- Only the owning intern opens the ticket, and only on their own session.
DROP POLICY IF EXISTS "training_ticket_updates_insert" ON public.training_ticket_updates;
CREATE POLICY "training_ticket_updates_insert"
  ON public.training_ticket_updates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_sessions s
      WHERE s.id = session_id AND s.intern_id = auth.uid()
    )
  );

-- Revision is allowed only while the ticket has not been accepted. The trigger
-- above additionally blocks any attempt to self-award passed/verdict.
DROP POLICY IF EXISTS "training_ticket_updates_update" ON public.training_ticket_updates;
CREATE POLICY "training_ticket_updates_update"
  ON public.training_ticket_updates FOR UPDATE TO authenticated
  USING (
    passed = false
    AND EXISTS (
      SELECT 1 FROM public.training_sessions s
      WHERE s.id = session_id AND s.intern_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_sessions s
      WHERE s.id = session_id AND s.intern_id = auth.uid()
    )
  );

-- No DELETE policy — a ticket is part of the training record.

DROP POLICY IF EXISTS "training_ticket_updates_service_role" ON public.training_ticket_updates;
CREATE POLICY "training_ticket_updates_service_role"
  ON public.training_ticket_updates
  USING (auth.role() = 'service_role');
