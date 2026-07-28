-- ===========================================================================
-- ACADEMY PART 2 of 3 - tables, helpers, RLS, realtime
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query.
--   Select ALL of this file (Ctrl+A in the editor after pasting) and Run.
--   IMPORTANT: the Supabase SQL editor runs only the HIGHLIGHTED text when a
--   selection exists. If part of the file is selected you will get errors
--   like `relation "our" does not exist` - that is a half-pasted string
--   literal, not a real missing table. Clear the selection / select all.
--
--   Run this SECOND, after Part 1 succeeds.
--   Safe to re-run: every policy/trigger is DROP ... IF EXISTS'd first,
--   tables/indexes/functions use IF NOT EXISTS / OR REPLACE.
--
-- Source: supabase/migrations/125_academy_core.sql
-- Generated 2026-07-27
-- ===========================================================================

-- Migration 125: Academy — core tables, SECURITY DEFINER helpers, RLS, realtime.
--
-- Depends on 124 (the `academy` department enum value) being committed first.
--
-- Academy is the intern training simulator. An LLM plays a luxury-concierge
-- client; the intern chats in a WhatsApp-style surface; on close a separate
-- evaluator scores the transcript and writes a review.
--
-- Tables (FK-dependency order):
--   scenario_seeds     — trainer-authored drills (secrets: hidden_constraints,
--                        escalation_trigger, rubric_weights, ideal_outcome)
--   training_sessions  — one intern run of one seed
--   training_turns     — APPEND-ONLY transcript (SELECT + INSERT only)
--   training_reviews   — evaluator output (INSERT via service_role only)
--
-- Access model:
--   * trainer = admin/founder/super_admin | department='academy'
--   * intern  = any authenticated user; owns only their own sessions/turns
-- Interns NEVER read scenario_seeds directly — the persona prompt (which needs
-- the hidden constraints) is built server-side, and the intern UI reads only
-- training_sessions.session_vars (a safe, per-session snapshot) + training_turns.
--
-- ORDERING NOTE (this bit is load-bearing):
--   `can_access_academy_session()` is LANGUAGE sql, so PostgreSQL parses and
--   VALIDATES its body at CREATE time. It therefore MUST be defined *after*
--   public.training_sessions exists, or creation fails with
--   `42P01: relation "public.training_sessions" does not exist`.
--   Same ordering as 108_concierge_ticket_tables.sql (table first, helper after).
--
-- IDEMPOTENT: every policy/trigger is dropped before creation, so this migration
-- can be re-run safely after a partial failure.
--
-- Every SECURITY DEFINER helper is `SET search_path = public`. Every table
-- carries a service_role bypass policy for internal service writes.

-- ── Helper 1: trainer test (no table dependencies beyond profiles) ───────────

CREATE OR REPLACE FUNCTION public.is_academy_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR public.get_user_department() = 'academy';
$$;

GRANT EXECUTE ON FUNCTION public.is_academy_trainer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_academy_trainer() TO service_role;

-- ── scenario_seeds ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scenario_seeds (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text        NOT NULL,
  archetype          text        NOT NULL,
  vertical           text        NOT NULL
                       CHECK (vertical IN ('Global', 'House', 'Shop', 'Legacy', 'Dubai', 'GMR')),
  opening_message    text        NOT NULL,
  -- array of {id, label, reveal_when, value} — client reveals `value` only when
  -- the intern probes in a way that matches `reveal_when`.
  hidden_constraints jsonb       NOT NULL DEFAULT '[]'::jsonb,
  difficulty         text        NOT NULL DEFAULT 'medium'
                       CHECK (difficulty IN ('easy', 'medium', 'hard')),
  escalation_trigger text        NOT NULL,
  ideal_outcome      text        NOT NULL,
  rubric_weights     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_seeds_active ON public.scenario_seeds (is_active);
CREATE INDEX IF NOT EXISTS idx_scenario_seeds_vertical ON public.scenario_seeds (vertical);

DROP TRIGGER IF EXISTS scenario_seeds_updated_at ON public.scenario_seeds;
CREATE TRIGGER scenario_seeds_updated_at
  BEFORE UPDATE ON public.scenario_seeds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scenario_seeds ENABLE ROW LEVEL SECURITY;

-- Trainer-only. Interns reach seeds through server actions (service role,
-- explicit safe columns), never through this table directly.
DROP POLICY IF EXISTS "scenario_seeds_select" ON public.scenario_seeds;
CREATE POLICY "scenario_seeds_select"
  ON public.scenario_seeds FOR SELECT TO authenticated
  USING (public.is_academy_trainer());

DROP POLICY IF EXISTS "scenario_seeds_insert" ON public.scenario_seeds;
CREATE POLICY "scenario_seeds_insert"
  ON public.scenario_seeds FOR INSERT TO authenticated
  WITH CHECK (public.is_academy_trainer());

DROP POLICY IF EXISTS "scenario_seeds_update" ON public.scenario_seeds;
CREATE POLICY "scenario_seeds_update"
  ON public.scenario_seeds FOR UPDATE TO authenticated
  USING (public.is_academy_trainer())
  WITH CHECK (public.is_academy_trainer());

DROP POLICY IF EXISTS "scenario_seeds_service_role" ON public.scenario_seeds;
CREATE POLICY "scenario_seeds_service_role"
  ON public.scenario_seeds
  USING (auth.role() = 'service_role');

-- ── training_sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seed_id       uuid        NOT NULL REFERENCES public.scenario_seeds(id) ON DELETE RESTRICT,
  status        text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- per-session randomization + a safe display snapshot (title/archetype/
  -- vertical/difficulty). Lets the intern UI avoid reading scenario_seeds.
  session_vars  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  model_version text        NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_intern ON public.training_sessions (intern_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_sessions_seed ON public.training_sessions (seed_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON public.training_sessions (status, started_at DESC);

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

-- Intern reads/writes only their own; trainers read all.
DROP POLICY IF EXISTS "training_sessions_select" ON public.training_sessions;
CREATE POLICY "training_sessions_select"
  ON public.training_sessions FOR SELECT TO authenticated
  USING (intern_id = auth.uid() OR public.is_academy_trainer());

DROP POLICY IF EXISTS "training_sessions_insert" ON public.training_sessions;
CREATE POLICY "training_sessions_insert"
  ON public.training_sessions FOR INSERT TO authenticated
  WITH CHECK (intern_id = auth.uid());

DROP POLICY IF EXISTS "training_sessions_update" ON public.training_sessions;
CREATE POLICY "training_sessions_update"
  ON public.training_sessions FOR UPDATE TO authenticated
  USING (intern_id = auth.uid())
  WITH CHECK (intern_id = auth.uid());

DROP POLICY IF EXISTS "training_sessions_service_role" ON public.training_sessions;
CREATE POLICY "training_sessions_service_role"
  ON public.training_sessions
  USING (auth.role() = 'service_role');

-- ── Helper 2: session access ─────────────────────────────────────────────────
-- MUST come after training_sessions — see the ORDERING NOTE at the top.
-- SECURITY DEFINER so it reads training_sessions without recursing through that
-- table's own RLS.

CREATE OR REPLACE FUNCTION public.can_access_academy_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.training_sessions s
    WHERE s.id = p_session_id
      AND (s.intern_id = auth.uid() OR public.is_academy_trainer())
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_academy_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_academy_session(uuid) TO service_role;

-- ── training_turns (APPEND-ONLY) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_turns (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('client', 'intern')),
  body       text        NOT NULL,
  seq        integer     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ordering axis is (created_at, seq). Unique (session_id, seq) keeps the
-- append log gap-free and race-safe for a single serial session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_turns_session_seq
  ON public.training_turns (session_id, seq);
CREATE INDEX IF NOT EXISTS idx_training_turns_session_created
  ON public.training_turns (session_id, created_at);

ALTER TABLE public.training_turns ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY: SELECT + INSERT only. NO update / delete policy, ever.
DROP POLICY IF EXISTS "training_turns_select" ON public.training_turns;
CREATE POLICY "training_turns_select"
  ON public.training_turns FOR SELECT TO authenticated
  USING (public.can_access_academy_session(session_id));

DROP POLICY IF EXISTS "training_turns_insert" ON public.training_turns;
CREATE POLICY "training_turns_insert"
  ON public.training_turns FOR INSERT TO authenticated
  WITH CHECK (public.can_access_academy_session(session_id));

DROP POLICY IF EXISTS "training_turns_service_role" ON public.training_turns;
CREATE POLICY "training_turns_service_role"
  ON public.training_turns
  USING (auth.role() = 'service_role');

-- ── training_reviews (evaluator output — service_role writes) ─────────────────

CREATE TABLE IF NOT EXISTS public.training_reviews (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL UNIQUE REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  -- {comprehension:{score,justification}, brand_tone:{...}, ...} per dimension
  scores         jsonb       NOT NULL,
  strengths      text[]      NOT NULL DEFAULT '{}',
  misses         text[]      NOT NULL DEFAULT '{}',
  rewritten_reply text       NULL,
  overall        numeric     NOT NULL,
  model_version  text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_reviews_session ON public.training_reviews (session_id);

ALTER TABLE public.training_reviews ENABLE ROW LEVEL SECURITY;

-- Read: the owning intern or any trainer. Write: service_role only (the
-- evaluator service persists reviews; no client-side insert path).
DROP POLICY IF EXISTS "training_reviews_select" ON public.training_reviews;
CREATE POLICY "training_reviews_select"
  ON public.training_reviews FOR SELECT TO authenticated
  USING (public.can_access_academy_session(session_id));

DROP POLICY IF EXISTS "training_reviews_service_role" ON public.training_reviews;
CREATE POLICY "training_reviews_service_role"
  ON public.training_reviews
  USING (auth.role() = 'service_role');

-- ── Realtime (live transcript) ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'training_turns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_turns;
  END IF;
END $$;
