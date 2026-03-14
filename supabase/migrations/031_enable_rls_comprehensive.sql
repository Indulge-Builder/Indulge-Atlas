-- =============================================================================
-- INDULGE ATLAS — Comprehensive Row Level Security (RLS) Migration
-- =============================================================================
--
-- Finalizes Supabase database security with bulletproof RLS policies.
-- Role identification: JWT user_metadata.role ('agent' | 'scout' | 'admin')
--
-- TABLES COVERED:
--   profiles, leads, tasks, lead_activities, campaign_metrics, campaign_drafts,
--   user_scratchpad_notes, conversations, conversation_participants, messages
--
-- Run in Supabase SQL Editor. Idempotent: drops existing policies before create.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. ROLE HELPER — JWT-based role extraction
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns role from auth.jwt() -> user_metadata ->> 'role'
-- Falls back to profiles.role if JWT lacks it (backward compatibility).
-- Valid roles: 'agent', 'scout', 'admin' (schema also has 'finance')

CREATE OR REPLACE FUNCTION public.get_role_from_jwt()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    (SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    'agent'
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENABLE RLS ON ALL TABLES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_drafts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scratchpad_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROFILES
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: id (PK, references auth.users)
-- Rules: Users see own row; scouts/admins see all. Only admins insert/delete.
--        Users can update own row; admins can update any.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.get_role_from_jwt() = 'admin')
  WITH CHECK (id = auth.uid() OR public.get_role_from_jwt() = 'admin');

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (public.get_role_from_jwt() = 'admin');

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (public.get_role_from_jwt() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LEADS
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: assigned_to (FK to profiles)
-- Rules:
--   SELECT/UPDATE: Agents see only rows where assigned_to = auth.uid().
--                  Scouts and Admins see/edit ALL rows.
--   INSERT: Agents may only insert rows assigned to themselves.
--   DELETE: STRICTLY DENIED for Agents. Only Scouts and Admins can delete.

DROP POLICY IF EXISTS "leads_select" ON public.leads;
DROP POLICY IF EXISTS "leads_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
DROP POLICY IF EXISTS "leads_delete" ON public.leads;

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT WITH CHECK (
    public.get_role_from_jwt() IN ('scout', 'admin')
    OR (public.get_role_from_jwt() = 'agent' AND assigned_to = auth.uid())
  );

CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

-- Agents CANNOT delete. Only scouts and admins.
CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE USING (public.get_role_from_jwt() IN ('scout', 'admin'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TASKS
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: assigned_to (FK to profiles)
-- Rules: Same as leads — agents see/edit only their assigned rows; scouts/admins
--        see all. Agents insert only for self. DELETE denied for agents.

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    (public.get_role_from_jwt() = 'agent' AND assigned_to = auth.uid())
    OR public.get_role_from_jwt() IN ('scout', 'admin')
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
  );

-- Agents CANNOT delete. Only scouts and admins.
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (public.get_role_from_jwt() IN ('scout', 'admin'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. USER_SCRATCHPAD_NOTES — Absolute Isolation
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: user_id (FK to auth.users)
-- Rules: ONLY the owning user can SELECT, INSERT, UPDATE, or DELETE.
--        Scouts and Admins CANNOT read an agent's private scratchpad.

DROP POLICY IF EXISTS "scratchpad_select_own" ON public.user_scratchpad_notes;
DROP POLICY IF EXISTS "scratchpad_insert_own" ON public.user_scratchpad_notes;
DROP POLICY IF EXISTS "scratchpad_update_own" ON public.user_scratchpad_notes;
DROP POLICY IF EXISTS "scratchpad_delete_own" ON public.user_scratchpad_notes;

CREATE POLICY "scratchpad_select_own" ON public.user_scratchpad_notes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "scratchpad_insert_own" ON public.user_scratchpad_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "scratchpad_update_own" ON public.user_scratchpad_notes
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scratchpad_delete_own" ON public.user_scratchpad_notes
  FOR DELETE USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. LEAD_ACTIVITIES — Immutable audit log
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: performed_by (FK to profiles)
-- Rules: Agents see activities for leads they're assigned to, or their own.
--        Scouts/Admins see all. Insert: must be performed_by = auth.uid() and
--        either scout/admin or assigned to the lead. No UPDATE or DELETE.

DROP POLICY IF EXISTS "activities_select" ON public.lead_activities;
DROP POLICY IF EXISTS "activities_insert" ON public.lead_activities;

CREATE POLICY "activities_select" ON public.lead_activities
  FOR SELECT USING (
    performed_by = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_to = auth.uid()
    )
  );

CREATE POLICY "activities_insert" ON public.lead_activities
  FOR INSERT WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.get_role_from_jwt() IN ('scout', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.assigned_to = auth.uid()
      )
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CAMPAIGN_METRICS — Public/Shared table (dropdown-style data)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rules: Authenticated users can SELECT. Only Admins can INSERT, UPDATE, DELETE.

DROP POLICY IF EXISTS "campaign_metrics_select" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_write" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_insert" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_update" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_delete" ON public.campaign_metrics;

CREATE POLICY "campaign_metrics_select" ON public.campaign_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "campaign_metrics_insert" ON public.campaign_metrics
  FOR INSERT WITH CHECK (public.get_role_from_jwt() = 'admin');

CREATE POLICY "campaign_metrics_update" ON public.campaign_metrics
  FOR UPDATE USING (public.get_role_from_jwt() = 'admin')
  WITH CHECK (public.get_role_from_jwt() = 'admin');

CREATE POLICY "campaign_metrics_delete" ON public.campaign_metrics
  FOR DELETE USING (public.get_role_from_jwt() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CAMPAIGN_DRAFTS — Creator-scoped
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: created_by (FK to profiles)
-- Rules: Scouts/Admins can select. Insert: created_by = auth.uid(), scout/admin.
--        Update/Delete: creator or admin.

DROP POLICY IF EXISTS "drafts_select" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_insert" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_update" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_delete" ON public.campaign_drafts;

CREATE POLICY "drafts_select" ON public.campaign_drafts
  FOR SELECT USING (
    created_by = auth.uid()
    OR public.get_role_from_jwt() IN ('scout', 'admin')
  );

CREATE POLICY "drafts_insert" ON public.campaign_drafts
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.get_role_from_jwt() IN ('scout', 'admin')
  );

CREATE POLICY "drafts_update" ON public.campaign_drafts
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.get_role_from_jwt() = 'admin'
  );

CREATE POLICY "drafts_delete" ON public.campaign_drafts
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.get_role_from_jwt() = 'admin'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CONVERSATIONS — Messaging
-- ─────────────────────────────────────────────────────────────────────────────
-- No direct user column; access via conversation_participants.
-- Rules: Users see only conversations they participate in.

DROP POLICY IF EXISTS "conv_select" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_own" ON public.conversations;

CREATE POLICY "conv_select" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = conversations.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "conv_update_own" ON public.conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = conversations.id AND user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CONVERSATION_PARTICIPANTS — Messaging
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: user_id (FK to profiles)
-- Rules: Each user can only read their own participant rows (non-recursive).

DROP POLICY IF EXISTS "cp_select" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;

CREATE POLICY "cp_select" ON public.conversation_participants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "cp_insert" ON public.conversation_participants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cp_update_own" ON public.conversation_participants
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. MESSAGES — Messaging
-- ─────────────────────────────────────────────────────────────────────────────
-- User column: sender_id (FK to profiles)
-- Rules: Users see messages only in conversations they participate in.
--        Insert: sender must be auth.uid() and user must be a participant.

DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;

CREATE POLICY "msg_select" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. UPDATE get_my_role() TO USE JWT (optional compatibility)
-- ─────────────────────────────────────────────────────────────────────────────
-- Existing code may call get_my_role(). Point it at JWT with profile fallback.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role')::public.user_role,
    (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    'agent'::public.user_role
  );
$$;
