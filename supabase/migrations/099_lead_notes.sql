-- migration 099: lead_notes — append-only public notes log per lead
-- Notes can be created by the assigned agent, collaborators, or privileged roles.
-- Replaces the single leads.notes text column for multi-note use cases.
-- leads.notes is intentionally kept for now; it will be deprecated gradually.

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  -- optional: the call outcome pill selected when note was created via Called modal
  call_outcome  TEXT CHECK (call_outcome IN ('rnr', 'switched_off', 'wrong_number', 'conversing', 'other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: most reads are "all notes for a lead, newest first"
CREATE INDEX lead_notes_lead_id_created_at_idx ON public.lead_notes (lead_id, created_at DESC);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Agents and privileged roles who can see the lead can read notes
CREATE POLICY "lead_notes_select" ON public.lead_notes FOR SELECT
  USING (
    get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_notes.lead_id
        AND (l.assigned_to = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.lead_collaborators lc
               WHERE lc.lead_id = l.id AND lc.user_id = auth.uid()
             ))
    )
  );

-- Insert: assigned agent, collaborators, or privileged roles
CREATE POLICY "lead_notes_insert" ON public.lead_notes FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (
      get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_notes.lead_id
          AND (l.assigned_to = auth.uid()
               OR EXISTS (
                 SELECT 1 FROM public.lead_collaborators lc
                 WHERE lc.lead_id = l.id AND lc.user_id = auth.uid()
               ))
      )
    )
  );

-- No UPDATE or DELETE — notes are append-only (immutable audit trail)

-- Service role bypass for internal operations
CREATE POLICY "lead_notes_service_role" ON public.lead_notes
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add call_count and last_call_outcome to leads table for fast display
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_call_outcome TEXT CHECK (last_call_outcome IN ('rnr', 'switched_off', 'wrong_number', 'conversing', 'other'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_breach_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_intent      TEXT CHECK (lead_intent IN ('hot', 'cold'));
