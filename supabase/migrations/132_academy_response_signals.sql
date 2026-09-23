-- Migration 132: Academy — estimated AI assistance per submitted response.
--
-- WHY A SIBLING TABLE, NOT A COLUMN ON training_turns:
--   `training_turns` is append-only by design (migration 125 grants SELECT +
--   INSERT and no UPDATE/DELETE, deliberately — it is the transcript the
--   evaluator grades). The estimate is produced asynchronously, after the turn
--   is written, so recording it on the turn row would require an UPDATE and
--   break that guarantee. One row per turn here keeps the transcript immutable
--   and the estimate revisable.
--
-- WHAT IS STORED, AND WHAT IT MEANS:
--   `estimate_percent` is a language model's opinion of how machine-like the
--   writing reads. It is NOT evidence that any tool was used, and it is least
--   reliable on short text — which is why `outcome` distinguishes a real
--   estimate from a reply that was too short to judge. Rows with
--   outcome <> 'estimated' carry a NULL percent rather than an invented number,
--   so averages computed downstream cannot be polluted by placeholder values.
--
--   The composition_* columns are different in kind: they are facts the editor
--   observed (characters pasted vs typed, largest paste, timings). A paste is a
--   paste. Nothing in this table attributes text to a particular AI tool, and
--   no consumer should present it as doing so.
--
-- Writes are service_role only, exactly like training_reviews: the detection
-- service persists these; there is no client-side insert path, so an intern
-- cannot author their own score.

CREATE TABLE IF NOT EXISTS public.training_response_signals (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One estimate per submitted response. ON DELETE CASCADE so purging a
  -- session's transcript takes its estimates with it.
  turn_id            uuid        NOT NULL UNIQUE REFERENCES public.training_turns(id) ON DELETE CASCADE,
  session_id         uuid        NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  intern_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 'estimated'          — a usable estimate was produced
  -- 'insufficient_text'  — reply too short to judge; no number invented
  -- 'unavailable'        — the detection call failed or the key is absent
  outcome            text        NOT NULL DEFAULT 'estimated'
                                 CHECK (outcome IN ('estimated', 'insufficient_text', 'unavailable')),
  -- NULL unless outcome = 'estimated'. Enforced below so a placeholder cannot
  -- silently enter the averages.
  estimate_percent   integer     NULL CHECK (estimate_percent BETWEEN 0 AND 100),
  -- One short sentence about register/phrasing. Never an accusation of tool use.
  rationale          text        NULL,

  -- Observed editing facts. NULL when the client did not report telemetry
  -- (older clients, or a submission path that does not collect it).
  composition        jsonb       NULL,

  -- Model + prompt version, so a shift in scores can be told from a re-tune.
  model_version      text        NULL,
  -- Word count actually judged — makes "why was this skipped" answerable later.
  word_count         integer     NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT training_response_signals_percent_matches_outcome
    CHECK (
      (outcome = 'estimated' AND estimate_percent IS NOT NULL)
      OR (outcome <> 'estimated' AND estimate_percent IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_training_response_signals_session
  ON public.training_response_signals (session_id);
-- Drives the per-trainee rollup and timeline.
CREATE INDEX IF NOT EXISTS idx_training_response_signals_intern
  ON public.training_response_signals (intern_id, created_at DESC);

ALTER TABLE public.training_response_signals ENABLE ROW LEVEL SECURITY;

-- Read: the owning intern or any trainer — same reach as the transcript itself.
-- Write: service_role only.
DROP POLICY IF EXISTS "training_response_signals_select" ON public.training_response_signals;
CREATE POLICY "training_response_signals_select"
  ON public.training_response_signals FOR SELECT TO authenticated
  USING (public.can_access_academy_session(session_id));

DROP POLICY IF EXISTS "training_response_signals_service_role" ON public.training_response_signals;
CREATE POLICY "training_response_signals_service_role"
  ON public.training_response_signals
  USING (auth.role() = 'service_role');
