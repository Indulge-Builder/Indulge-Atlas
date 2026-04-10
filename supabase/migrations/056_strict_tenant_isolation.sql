-- ============================================================
-- Migration 056: Strict Multi-Tenant Architecture
--
-- Roles:  admin | founder | manager | agent | guest
--   (migrate: scout → manager, finance → guest)
-- Domains: indulge_concierge | indulge_shop | indulge_house | indulge_legacy
--   (migrate: indulge_global → indulge_concierge)
--
-- Execution order (critical):
--   1. Drop all existing RLS policies FIRST
--      (policies referencing leads.domain block ALTER COLUMN)
--   2. Add new enum values (idempotent IF NOT EXISTS guards)
--   3. Convert affected columns to TEXT (releases enum constraint)
--   4. Run data migrations as plain TEXT updates
--   5. Drop old enum types, recreate with canonical values
--   6. Re-cast columns to new enum types
--   7. Create/replace helper functions
--   8. Create new RLS policies
--   9. Update pick_next_agent_for_domain function
--  10. Grant execute on helpers
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: DROP ALL LEGACY RLS POLICIES
-- Must happen BEFORE any ALTER COLUMN — policies that join
-- leads.domain (e.g. lead_activities_select_by_domain) block
-- the type conversion with error 0A000.
-- ────────────────────────────────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "profiles_select"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete"    ON public.profiles;

-- leads
DROP POLICY IF EXISTS "leads_select"  ON public.leads;
DROP POLICY IF EXISTS "leads_insert"  ON public.leads;
DROP POLICY IF EXISTS "leads_update"  ON public.leads;
DROP POLICY IF EXISTS "leads_delete"  ON public.leads;

-- tasks
DROP POLICY IF EXISTS "tasks_select"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"  ON public.tasks;

-- lead_activities (these subquery leads.domain — must drop before ALTER COLUMN)
DROP POLICY IF EXISTS "activities_select"                ON public.lead_activities;
DROP POLICY IF EXISTS "activities_insert"                ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_select_by_domain" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert_by_role"   ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_select"           ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert"           ON public.lead_activities;

-- campaign_metrics
DROP POLICY IF EXISTS "campaign_metrics_select" ON public.campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_write"  ON public.campaign_metrics;

-- campaign_drafts
DROP POLICY IF EXISTS "drafts_select" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_insert" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_update" ON public.campaign_drafts;
DROP POLICY IF EXISTS "drafts_delete" ON public.campaign_drafts;

-- shop tables
DROP POLICY IF EXISTS "shop_orders_select"         ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_insert"         ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_update"         ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_delete"         ON public.shop_orders;
DROP POLICY IF EXISTS "shop_master_targets_select" ON public.shop_master_targets;
DROP POLICY IF EXISTS "shop_master_targets_write"  ON public.shop_master_targets;

-- whatsapp_messages (migration 055)
DROP POLICY IF EXISTS "whatsapp_messages_select" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_insert" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_update" ON public.whatsapp_messages;

-- ────────────────────────────────────────────────────────────
-- SECTION 2: ADD NEW ENUM VALUES (idempotent)
-- ALTER TYPE … ADD VALUE must run in its own DO block and
-- cannot be followed by DML using those values in the same
-- transaction (Postgres error 55P04). We convert columns to
-- TEXT next, so we never actually USE these new values while
-- the old enum types still exist.
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'founder'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE public.user_role ADD VALUE 'founder';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'guest'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE public.user_role ADD VALUE 'guest';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manager'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE public.user_role ADD VALUE 'manager';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'indulge_concierge'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'indulge_domain')) THEN
    ALTER TYPE public.indulge_domain ADD VALUE 'indulge_concierge';
  END IF;

END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: CONVERT COLUMNS TO TEXT
-- Now that all policies are gone, ALTER COLUMN succeeds.
-- Operating on TEXT means no enum constraint during data
-- migration and DROP TYPE steps.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ALTER COLUMN role   TYPE TEXT,
  ALTER COLUMN domain TYPE TEXT;

ALTER TABLE public.leads
  ALTER COLUMN domain TYPE TEXT;

-- lead_routing_rules.action_target_domain may already be TEXT
DO $$ BEGIN
  ALTER TABLE public.lead_routing_rules
    ALTER COLUMN action_target_domain TYPE TEXT;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- SECTION 4: DATA MIGRATIONS (columns are plain TEXT now)
-- ────────────────────────────────────────────────────────────

-- Roles: known renames
UPDATE public.profiles SET role = 'manager' WHERE role = 'scout';
UPDATE public.profiles SET role = 'guest'   WHERE role = 'finance';

-- Roles: sanitise any other legacy/invalid values (e.g. 'viewer') → 'agent'
UPDATE public.profiles
  SET role = 'agent'
  WHERE role NOT IN ('admin', 'founder', 'manager', 'agent', 'guest');

-- Domains: indulge_global → indulge_concierge
UPDATE public.profiles SET domain = 'indulge_concierge' WHERE domain = 'indulge_global';
UPDATE public.leads     SET domain = 'indulge_concierge' WHERE domain = 'indulge_global';

-- Domains: sanitise any other unknown values → 'indulge_concierge'
UPDATE public.profiles
  SET domain = 'indulge_concierge'
  WHERE domain NOT IN ('indulge_concierge', 'indulge_shop', 'indulge_house', 'indulge_legacy');

UPDATE public.leads
  SET domain = 'indulge_concierge'
  WHERE domain NOT IN ('indulge_concierge', 'indulge_shop', 'indulge_house', 'indulge_legacy');

-- Routing rules
UPDATE public.lead_routing_rules
  SET action_target_domain = 'indulge_concierge'
  WHERE action_target_domain = 'indulge_global';

-- ────────────────────────────────────────────────────────────
-- SECTION 5: REBUILD ENUM TYPES WITH CANONICAL VALUE SETS
-- ────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.user_role    CASCADE;
DROP TYPE IF EXISTS public.indulge_domain CASCADE;

CREATE TYPE public.user_role AS ENUM (
  'admin',
  'founder',
  'manager',
  'agent',
  'guest'
);

CREATE TYPE public.indulge_domain AS ENUM (
  'indulge_concierge',
  'indulge_shop',
  'indulge_house',
  'indulge_legacy'
);

-- Re-cast columns back to the new enum types
ALTER TABLE public.profiles
  ALTER COLUMN role   TYPE public.user_role    USING role::public.user_role,
  ALTER COLUMN domain TYPE public.indulge_domain USING domain::public.indulge_domain;

ALTER TABLE public.profiles
  ALTER COLUMN role   SET DEFAULT 'agent',
  ALTER COLUMN domain SET DEFAULT 'indulge_concierge';

ALTER TABLE public.leads
  ALTER COLUMN domain TYPE public.indulge_domain USING domain::public.indulge_domain;

ALTER TABLE public.leads
  ALTER COLUMN domain SET DEFAULT 'indulge_concierge';

-- ────────────────────────────────────────────────────────────
-- SECTION 6: SECURE HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()),
    'agent'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_domain()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'domain'),
    (SELECT domain::TEXT FROM public.profiles WHERE id = auth.uid()),
    'indulge_concierge'
  );
$$;

-- Backward-compatible aliases
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_user_role();
$$;

CREATE OR REPLACE FUNCTION public.get_my_domain()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_user_domain();
$$;

CREATE OR REPLACE FUNCTION public.get_role_from_jwt()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_user_role();
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 7: NEW RLS POLICIES
--
-- Role permission matrix:
--   admin   → ALL, all domains
--   founder → ALL, all domains
--   manager → ALL, own domain only
--   agent   → SELECT/INSERT/UPDATE own assigned records; NO DELETE
--   guest   → SELECT only, own domain; NO mutations
-- ────────────────────────────────────────────────────────────

-- ── PROFILES ────────────────────────────────────────────────

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND domain::TEXT = public.get_user_domain()
    )
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.get_user_role() IN ('admin', 'founder')
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
  );

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (
    public.get_user_role() = 'admin'
  );

-- ── LEADS ───────────────────────────────────────────────────

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND domain::TEXT = public.get_user_domain()
    )
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
      AND domain::TEXT = public.get_user_domain()
    )
    OR (
      public.get_user_role() = 'guest'
      AND domain::TEXT = public.get_user_domain()
    )
  );

CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND domain::TEXT = public.get_user_domain()
    )
    OR (
      public.get_user_role() = 'agent'
      AND domain::TEXT = public.get_user_domain()
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND domain::TEXT = public.get_user_domain()
    )
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
      AND domain::TEXT = public.get_user_domain()
    )
  );

CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE USING (
    public.get_user_role() IN ('admin', 'founder')
  );

-- ── TASKS ───────────────────────────────────────────────────

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() = 'manager'
      AND (
        auth.uid() = ANY(assigned_to_users)
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
        )
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND auth.uid() = ANY(assigned_to_users)
    )
    OR (
      public.get_user_role() = 'guest'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND auth.uid() = ANY(assigned_to_users)
    )
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND auth.uid() = ANY(assigned_to_users)
    )
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    public.get_user_role() IN ('admin', 'founder')
  );

-- ── LEAD ACTIVITIES ─────────────────────────────────────────

CREATE POLICY "lead_activities_select" ON public.lead_activities
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "lead_activities_insert" ON public.lead_activities
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

-- ── CAMPAIGN METRICS ────────────────────────────────────────

-- campaign_metrics has no per-row domain (synced ad platform rows are shared).
-- Managers/guests: any authenticated user in those roles may read (cannot filter by domain without a column).
CREATE POLICY "campaign_metrics_select" ON public.campaign_metrics
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND auth.uid() IS NOT NULL
    )
  );

CREATE POLICY "campaign_metrics_write" ON public.campaign_metrics
  FOR ALL USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
  );

-- ── CAMPAIGN DRAFTS ─────────────────────────────────────────

-- Domain is on profiles, not on campaign_drafts — scope via draft creator's profile.
CREATE POLICY "drafts_select" ON public.campaign_drafts
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR created_by = auth.uid()
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = created_by
          AND p.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "drafts_insert" ON public.campaign_drafts
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
  );

CREATE POLICY "drafts_update" ON public.campaign_drafts
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
  );

CREATE POLICY "drafts_delete" ON public.campaign_drafts
  FOR DELETE USING (
    public.get_user_role() IN ('admin', 'founder')
  );

-- ── SHOP ORDERS ─────────────────────────────────────────────

CREATE POLICY "shop_orders_select" ON public.shop_orders
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND (
        assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
        )
        OR EXISTS (
          SELECT 1 FROM public.tasks t
          JOIN public.leads l ON l.id = t.lead_id
          WHERE t.id = task_id AND l.domain::TEXT = public.get_user_domain()
        )
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "shop_orders_insert" ON public.shop_orders
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "shop_orders_update" ON public.shop_orders
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "shop_orders_delete" ON public.shop_orders
  FOR DELETE USING (
    public.get_user_role() IN ('admin', 'founder')
  );

-- ── SHOP MASTER TARGETS ─────────────────────────────────────

CREATE POLICY "shop_master_targets_select" ON public.shop_master_targets
  FOR SELECT USING (true);

CREATE POLICY "shop_master_targets_write" ON public.shop_master_targets
  FOR ALL USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
  );

-- ── WHATSAPP MESSAGES ───────────────────────────────────────

CREATE POLICY "whatsapp_messages_select" ON public.whatsapp_messages
  FOR SELECT USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      public.get_user_role() IN ('manager', 'guest')
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "whatsapp_messages_insert" ON public.whatsapp_messages
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
          AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "whatsapp_messages_update" ON public.whatsapp_messages
  FOR UPDATE USING (
    public.get_user_role() IN ('admin', 'founder')
  );

-- ────────────────────────────────────────────────────────────
-- SECTION 8: UPDATE PICK-NEXT-AGENT FUNCTION
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(p_domain TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_domain   TEXT;
BEGIN
  v_domain := CASE WHEN p_domain = 'indulge_global' THEN 'indulge_concierge' ELSE p_domain END;

  SELECT p.id INTO v_agent_id
  FROM public.profiles p
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS new_lead_count
    FROM   public.leads
    WHERE  status = 'new'
    GROUP  BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role      = 'agent'
    AND p.domain::TEXT = v_domain
    AND p.is_active = true
    AND (p.is_on_leave IS NULL OR p.is_on_leave = false)
    AND COALESCE(lc.new_lead_count, 0) < 15
  ORDER BY COALESCE(lc.new_lead_count, 0) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 9: GRANT EXECUTE ON HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_user_role()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_domain()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_domain()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_from_jwt() TO authenticated;

-- ============================================================
-- After applying:
--   1. Redeploy Next.js app.
--   2. Force-refresh all active sessions so JWT user_metadata
--      reflects the new role/domain values.
-- ============================================================
