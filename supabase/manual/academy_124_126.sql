-- ===========================================================================
-- ACADEMY - standalone apply bundle (migrations 124, 125, 126)
-- ===========================================================================
--
-- WHY THIS FILE EXISTS
--   `supabase db push` would also apply ~22 other untracked, unreviewed
--   migrations (102-123: concierge ticketing, retail visibility, watcher
--   role, wa-archive). This bundle applies ONLY Academy.
--
-- HOW TO APPLY
--   Paste this whole file into the Supabase SQL editor and run it ONCE.
--
-- SAFE AS A SINGLE SCRIPT?  Yes.
--   `ALTER TYPE ... ADD VALUE` normally cannot be USED in the same
--   transaction that adds it. That restriction does not bite here:
--   `get_user_department()` returns TEXT, so the only 'academy' reference in
--   the core migration is a TEXT comparison, not an enum literal. Nothing
--   below reads the enum type. (The migrations stay split on disk to match
--   the convention set by 122_employee_department_watcher.sql.)
--
-- RE-RUN SAFE
--   This bundle is idempotent and can be run repeatedly, including after a
--   partial failure. Tables/indexes/functions use IF NOT EXISTS or OR
--   REPLACE; every policy and trigger is DROP ... IF EXISTS'd first; and the
--   12-row seed INSERT is guarded by WHERE NOT EXISTS on the seed title, so
--   it will not duplicate.
--
-- ORDERING (why an earlier draft of this file failed)
--   can_access_academy_session() is LANGUAGE sql, so PostgreSQL validates its
--   body at CREATE time. It must therefore be defined AFTER
--   public.training_sessions exists. Defining it first produced:
--     ERROR: 42P01: relation "public.training_sessions" does not exist
--   Fixed 2026-07-27; the helper now sits between training_sessions and
--   training_turns, matching 108_concierge_ticket_tables.sql.
--
-- AFTER APPLYING, verify RLS actually landed (do not trust the file):
--   see the verification block at the very bottom of this script.
--
-- Generated 2026-07-27 from supabase/migrations/.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- BEGIN 124_academy_department_enum.sql
-- ---------------------------------------------------------------------------

-- Migration 124: Academy — add the `academy` department enum value.
--
-- Academy is the intern training simulator. "Trainers" (who read every session
-- and author the scenario seed library) are identified by department='academy'
-- OR a privileged role (admin/founder/super_admin) — see migration 121's
-- `is_academy_trainer()` helper.
--
-- This MUST be its own migration: PostgreSQL forbids using a newly added enum
-- value in the same transaction that adds it, and migration 125 defines
-- functions/policies that reference 'academy'. Adding the value here (a separate,
-- committed migration) guarantees it exists before 125 runs.
-- (Same pattern as 122_employee_department_watcher.sql.)

ALTER TYPE public.employee_department ADD VALUE IF NOT EXISTS 'academy';

-- END 124_academy_department_enum.sql


-- ---------------------------------------------------------------------------
-- BEGIN 125_academy_core.sql
-- ---------------------------------------------------------------------------

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

-- END 125_academy_core.sql


-- ---------------------------------------------------------------------------
-- BEGIN 126_academy_seed_library.sql
-- ---------------------------------------------------------------------------

-- Migration 126: Academy — 12 starter scenario seeds (2 per vertical).
--
-- Depends on 125 (scenario_seeds table).
--
-- ALL data here is SYNTHETIC. No real client names, numbers, or details.
-- Each seed carries hidden_constraints the client reveals ONLY when the intern
-- probes correctly. rubric_weights weight factual_accuracy higher so invented
-- details are penalised hard. {{name}} / {{date}} tokens are randomised
-- per-session at runtime (lib/academy/randomize.ts).
--
-- Data-only migration (no schema change) — applied via `supabase db push`.
--
-- RE-RUN SAFE: the whole INSERT is guarded by a NOT EXISTS on the seed titles,
-- so re-running after a partial failure will not duplicate the 12 seeds.

INSERT INTO public.scenario_seeds
  (title, archetype, vertical, opening_message, hidden_constraints, difficulty, escalation_trigger, ideal_outcome, rubric_weights)
SELECT * FROM (VALUES
-- ── Global ───────────────────────────────────────────────────────────────────
(
  'Cancelled dinner reservation, guests arriving tonight',
  'Frustrated host, high expectations',
  'Global',
  'Hi, {{name}} here. I booked a table for four at the harbour restaurant for tonight through your team last week, and the restaurant has just told me there is no reservation under my name. My guests land in two hours. I need this sorted.',
  '[
    {"id":"party_size","label":"Actual party size","reveal_when":"intern confirms the number of covers","value":"The party is actually six, not four - two colleagues joined last minute"},
    {"id":"allergy","label":"Shellfish allergy","reveal_when":"intern asks about dietary needs or preferences","value":"One guest has a severe shellfish allergy"}
  ]'::jsonb,
  'medium',
  'Intern is slow to acknowledge, offers no alternative within the first two replies, or blames the restaurant instead of owning the fix.',
  'Own the error, secure a comparable or better table for the correct party size tonight, capture the allergy, and confirm details back before guests arrive.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Private jet delayed, tight onward connection',
  'Time-pressured executive',
  'Global',
  'This is {{name}}. My charter out of Nice tomorrow is now showing a two hour delay for weather, and it will make me miss everything after. Can you look at options.',
  '[
    {"id":"deadline","label":"Real hard deadline","reveal_when":"intern asks why the timing matters or what is at stake","value":"There is a board meeting at 4pm that cannot move - everything else can flex"},
    {"id":"budget","label":"Budget is flexible","reveal_when":"intern asks about budget or proposes a costlier charter","value":"Cost is not the concern for this trip - a repositioned aircraft is acceptable"}
  ]'::jsonb,
  'hard',
  'Intern presents only the delay as fact, fails to ask what is time-critical, or proposes nothing actionable within two replies.',
  'Establish the true fixed constraint (the 4pm board meeting), propose a viable reposition or alternative that protects it, and confirm.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── House ────────────────────────────────────────────────────────────────────
(
  'Villa air-conditioning failed mid-stay',
  'Uncomfortable guest, family in tow',
  'House',
  '{{name}} here. We are two days into our stay at the villa and the air conditioning in the main bedrooms has stopped working. It is stifling. This is not what we paid for.',
  '[
    {"id":"infant","label":"Infant in the party","reveal_when":"intern asks who is affected or about the household","value":"There is a six month old baby - the heat is genuinely urgent, not just uncomfortable"},
    {"id":"move","label":"Open to a villa move","reveal_when":"intern asks what outcome would make it right","value":"They would happily move to another villa if the fix is not fast"}
  ]'::jsonb,
  'medium',
  'Intern offers only to log a maintenance request with no timeline, or fails to grasp urgency once the infant is mentioned.',
  'Acknowledge, treat as urgent given the infant, offer an immediate fix with a timeline AND a villa move as a fallback, and follow up.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Airport chauffeur did not show',
  'Stranded arrival, elderly parent',
  'House',
  'Hi, this is {{name}}. I have just landed and the car that was booked to collect us is nowhere to be seen. Nobody is answering the driver number. We are standing at arrivals.',
  '[
    {"id":"elderly","label":"Elderly parent waiting","reveal_when":"intern asks who is travelling or about any special needs","value":"An elderly parent is with them and cannot stand for long"},
    {"id":"wheelchair","label":"Accessibility need","reveal_when":"intern asks about accessibility or vehicle requirements","value":"They need a wheelchair accessible vehicle"}
  ]'::jsonb,
  'medium',
  'Intern spends replies apologising without dispatching a replacement, or sends a standard car after the accessibility need is known.',
  'Apologise briefly, dispatch a suitable accessible replacement immediately with an ETA, keep the guest informed, and confirm pickup.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Shop ─────────────────────────────────────────────────────────────────────
(
  'Limited-edition handbag needed by Friday',
  'Determined shopper, firm deadline',
  'Shop',
  'Hello, {{name}} here. I am after the limited edition tote in the seasonal colour and I need it in hand by Friday. Every boutique I have called says it is sold out. Can your team find one.',
  '[
    {"id":"real_deadline","label":"Real deadline","reveal_when":"intern confirms exactly when and why Friday matters","value":"The real deadline is a gift on Thursday evening, not Friday - so it must arrive Thursday"},
    {"id":"colourway","label":"Colour flexibility","reveal_when":"intern asks whether an alternative colour or style is acceptable","value":"A different colourway in the same model would be perfectly acceptable"}
  ]'::jsonb,
  'medium',
  'Intern promises the exact item without checking availability, or gives up citing sold-out stock without exploring alternatives.',
  'Surface the true Thursday deadline and the colour flexibility, set realistic expectations, and pursue a sourced alternative rather than over-promising.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Anniversary gift, something nice',
  'Vague brief, wants to be guided',
  'Shop',
  'Hi {{name}}. It is my wife and my anniversary next week and I want to get her something really special this year. I am not sure what. Can you suggest something.',
  '[
    {"id":"dislikes","label":"Dislikes jewellery","reveal_when":"intern asks about her tastes or what she already owns","value":"She is not a jewellery person and would find another watch impersonal"},
    {"id":"vegan","label":"Recipient is vegan","reveal_when":"intern asks about lifestyle, values or materials","value":"She is vegan and cares about it - no leather or animal products"},
    {"id":"budget","label":"Budget flexible up","reveal_when":"intern asks about budget","value":"Budget is genuinely open for the right thing"}
  ]'::jsonb,
  'hard',
  'Intern proposes generic gifts (jewellery, a watch) without asking a single discovery question, or presents leather goods after vegan is known.',
  'Ask discovery questions, uncover the vegan and no-jewellery constraints, and propose a thoughtful, personal, values-aligned gift.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Legacy ───────────────────────────────────────────────────────────────────
(
  'Long-standing member feels overlooked',
  'Loyal member, quietly hurt',
  'Legacy',
  'Good afternoon. This is {{name}}. I have been a member for many years. My anniversary with Indulge is coming up and, frankly, I have felt rather forgotten of late. I wanted to raise it.',
  '[
    {"id":"widowed","label":"Recently widowed","reveal_when":"intern asks a gentle, personal question or listens for the emotional context","value":"Recently widowed - this milestone is emotionally heavy and needs sensitivity"},
    {"id":"privacy","label":"Wants privacy","reveal_when":"intern proposes any celebration or gesture","value":"Wants something private and understated - absolutely no social posts or public recognition"}
  ]'::jsonb,
  'hard',
  'Intern responds transactionally, proposes a public celebration, or misses the emotional register entirely.',
  'Lead with warmth and listening, honour the sensitivity, and propose a private, personal gesture - never public.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Rare wine for the family cellar',
  'Collector, detail-oriented',
  'Legacy',
  'Hello, {{name}} speaking. I am looking to acquire a case of a particular older vintage for the cellar. I have seen a few listings but I want to go through you. Can you help source it.',
  '[
    {"id":"provenance","label":"Provenance is the real concern","reveal_when":"intern asks what matters most or about authentication","value":"Price is secondary - provenance and authentication are the real worry after being sold a fake once before"},
    {"id":"gathering","label":"Deadline is a family gathering","reveal_when":"intern asks about timing","value":"It is for a family gathering in three weeks"}
  ]'::jsonb,
  'medium',
  'Intern focuses on price and speed while ignoring provenance, or promises authenticity it cannot verify.',
  'Recognise provenance and authentication as the priority, commit to verified sourcing with documentation, and align to the three-week timeline.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Dubai ────────────────────────────────────────────────────────────────────
(
  'Last-minute yacht charter for guests',
  'Host arranging for VIPs',
  'Dubai',
  'Hi, {{name}} here. I need a yacht for a group of my guests this weekend, roughly a dozen people, a full day out from the marina. Can you arrange it.',
  '[
    {"id":"vvip","label":"A VVIP guest","reveal_when":"intern asks about the guests or any discretion needs","value":"One guest is a VVIP who requires complete discretion and no crew photographs"},
    {"id":"no_alcohol","label":"No alcohol to be served","reveal_when":"intern asks about catering or preferences","value":"No alcohol is to be served on board for this group"}
  ]'::jsonb,
  'medium',
  'Intern books a standard party charter, arranges alcohol, or ignores discretion after the VVIP is flagged.',
  'Capture the discretion and no-alcohol constraints, arrange a suitable charter and catering, and confirm the privacy handling.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Desert experience and fine dining for guests',
  'Host planning an evening',
  'Dubai',
  'Good evening, {{name}}. I would love to arrange a special desert evening for a couple of guests tomorrow - something memorable, dinner included. What can you put together.',
  '[
    {"id":"pregnant","label":"A guest is pregnant","reveal_when":"intern asks about the guests or any activity limits","value":"One guest is pregnant - no dune bashing or adventurous activity"},
    {"id":"halal","label":"Halal required","reveal_when":"intern asks about dietary needs","value":"The dining must be fully halal"},
    {"id":"budget","label":"Budget flexible","reveal_when":"intern asks about budget","value":"Budget is flexible for the right experience"}
  ]'::jsonb,
  'medium',
  'Intern proposes dune bashing or a non-halal menu, or plans the evening without any discovery.',
  'Discover the pregnancy and halal constraints, design a gentle, memorable halal desert evening, and confirm.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── GMR (Global Member Relations) ────────────────────────────────────────────
(
  'Membership billing looks wrong',
  'Confused, mildly annoyed member',
  'GMR',
  'Hi {{name}}. I have just seen my membership renewal come through and the amount is higher than I expected. I am thinking I may just cancel. Can someone explain this.',
  '[
    {"id":"mischarge","label":"Actually mischarged","reveal_when":"intern investigates the charge rather than defending it","value":"They were genuinely charged for a tier they did not upgrade to - it is a billing error"},
    {"id":"downgrade","label":"Wants to downgrade not cancel","reveal_when":"intern asks what they actually want or explores options","value":"They do not really want to leave - a lower tier would keep them happy"}
  ]'::jsonb,
  'medium',
  'Intern defends the charge without checking, or lets the member walk toward cancellation without exploring the real want.',
  'Investigate and own the billing error, correct it, and retain the member by surfacing the downgrade option rather than cancellation.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Repeated service failures, threatening to leave',
  'Fed-up member at the edge',
  'GMR',
  'This is {{name}}. Honestly I have had enough. Three requests in a row have gone wrong and I am seriously considering cancelling my membership. I wanted to give you one last chance to change my mind.',
  '[
    {"id":"single_poc","label":"Wants one point of contact","reveal_when":"intern asks what would rebuild trust or make it right","value":"The real fix is a single dedicated concierge - they hate being passed around"},
    {"id":"comms","label":"Real issue is communication","reveal_when":"intern digs into what actually went wrong each time","value":"The failures were mostly poor communication, not the services themselves"}
  ]'::jsonb,
  'hard',
  'Intern gets defensive, offers a generic apology or a discount without addressing the trust issue, or fails to ask what would rebuild the relationship.',
  'De-escalate with genuine ownership, uncover that the real issue is communication and continuity, and offer a dedicated concierge to retain them.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
)) AS v(
  title, archetype, vertical, opening_message, hidden_constraints,
  difficulty, escalation_trigger, ideal_outcome, rubric_weights
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.scenario_seeds s WHERE s.title = v.title
);

-- END 126_academy_seed_library.sql


-- ---------------------------------------------------------------------------
-- VERIFICATION - run these separately AFTER the script above succeeds.
-- ---------------------------------------------------------------------------
--
-- 1) Four tables exist:
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('scenario_seeds','training_sessions','training_turns','training_reviews')
--  ORDER BY table_name;   -- expect 4 rows
--
-- 2) RLS is ON for all four:
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('scenario_seeds','training_sessions','training_turns','training_reviews');
--  -- expect relrowsecurity = true on every row
--
-- 3) training_turns is APPEND-ONLY - this is the critical one.
--    It must return ONLY 'SELECT', 'INSERT' and the ALL service_role policy.
--    Any UPDATE or DELETE row here means append-only is broken:
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='training_turns' ORDER BY cmd;
--
-- 4) Full policy inventory across Academy:
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public'
--    AND tablename IN ('scenario_seeds','training_sessions','training_turns','training_reviews')
--  ORDER BY tablename, cmd;
--
-- 5) Helper functions exist and are SECURITY DEFINER with a pinned search_path:
-- SELECT proname, prosecdef, proconfig FROM pg_proc
--  WHERE proname IN ('is_academy_trainer','can_access_academy_session');
--  -- expect prosecdef = true and proconfig = {search_path=public}
--
-- 6) The 12 seeds loaded, two per vertical:
-- SELECT vertical, count(*) FROM public.scenario_seeds GROUP BY vertical ORDER BY vertical;
--  -- expect 6 rows, count = 2 each (12 total)
--
-- 7) The department enum now has 'academy':
-- SELECT unnest(enum_range(NULL::public.employee_department))::text ORDER BY 1;
-- ---------------------------------------------------------------------------
