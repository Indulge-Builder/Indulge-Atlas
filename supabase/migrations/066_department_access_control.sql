-- =============================================================================
-- INDULGE ATLAS — Department Access Control Foundation
-- Migration 066: employee_department enum, profiles extensions, get_user_department()
-- =============================================================================
--
-- AXIS 1: domain   → "What DATA can you see?"      (Row-Level Security)
-- AXIS 2: department → "What SCREENS can you open?" (UI Routing + Workspace Access)
--
-- These axes are orthogonal. A Finance employee might have
--   domain = indulge_global   (sees data across all business units)
--   department = finance       (can only open Finance workspace tools)
--
-- NULL department = cross-departmental role (admin, founder, system).
--   → admin/founder: full access regardless
--   → agent/manager with null department: should never happen post-creation;
--     handled defensively (falls back to role-only routing in the UI).
--
-- CANONICAL DOMAIN MAPPING:
--   indulge_concierge  → concierge, onboarding departments
--   indulge_shop       → shop department
--   indulge_house      → house department
--   indulge_legacy     → legacy department
--   indulge_global     → finance, tech, marketing departments (cross-BU access)
--     ↳ NEW domain value. Legacy 'indulge_global' alias (pre-056) was renamed
--       to 'indulge_concierge' in migration 056. This is a different concept:
--       cross-business-unit read access for internal support departments.
--       The pick_next_agent_for_domain() normalization (indulge_global →
--       indulge_concierge for lead assignment) is PRESERVED and intentional:
--       Finance/Tech/Marketing staff are not in the lead assignment pool.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND indulge_domain ENUM
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE is not transactional. It is safe to run outside
-- a transaction block. The IF NOT EXISTS guard makes this idempotent.

ALTER TYPE public.indulge_domain ADD VALUE IF NOT EXISTS 'indulge_global';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CREATE employee_department ENUM
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_department') THEN
    CREATE TYPE public.employee_department AS ENUM (
      'concierge',   -- Luxury lifestyle concierge & inbound sales
      'finance',     -- Financial operations, billing & analytics
      'tech',        -- Engineering, platform & infrastructure
      'shop',        -- E-commerce operations & product sales
      'house',       -- Property, real estate & lifestyle experiences
      'legacy',      -- Long-term membership & legacy client management
      'marketing',   -- Campaign management, brand & digital growth
      'onboarding'   -- Client onboarding, conversion & retention
    );
    COMMENT ON TYPE public.employee_department IS
      'The 8 internal departments of the Indulge Group. Drives UI workspace routing. NULL = cross-departmental (admin/founder).';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXTEND profiles TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL department = intentional for admin/founder (cross-departmental roles).
-- NULL job_title = acceptable; display fallback to role label in UI.
-- NULL reports_to = user reports to no one in the hierarchy.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department  public.employee_department NULL,
  ADD COLUMN IF NOT EXISTS job_title   text                       NULL,
  ADD COLUMN IF NOT EXISTS reports_to  uuid                       NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.department IS
  'Employee department. NULL for admin/founder cross-departmental roles. Drives UI workspace routing.';
COMMENT ON COLUMN public.profiles.job_title IS
  'Human-readable job title e.g. "Senior Concierge Manager". Display only.';
COMMENT ON COLUMN public.profiles.reports_to IS
  'FK to profiles(id): direct manager in the reporting hierarchy. NULL = reports to no one.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UPDATE handle_new_user() TO HANDLE department AND job_title
-- ─────────────────────────────────────────────────────────────────────────────
-- Extends the post-058 hardened trigger.
-- department is authoritative → read from raw_app_meta_data only.
-- job_title is display-only → safe to read from raw_user_meta_data.
-- reports_to is set separately by the Server Action (cannot pass a UUID via
-- metadata without resolving it first in the admin client).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       public.user_role;
  v_domain     public.indulge_domain;
  v_department public.employee_department;
BEGIN
  -- Role: trust app_metadata only (not user_metadata — see migration 058).
  v_role := 'agent'::public.user_role;
  IF NEW.raw_app_meta_data->>'role' IN (
    'admin', 'founder', 'manager', 'agent', 'guest'
  ) THEN
    v_role := (NEW.raw_app_meta_data->>'role')::public.user_role;
  END IF;

  -- Domain: trust app_metadata only.
  v_domain := 'indulge_concierge'::public.indulge_domain;
  IF NEW.raw_app_meta_data->>'domain' IN (
    'indulge_concierge', 'indulge_shop', 'indulge_house', 'indulge_legacy', 'indulge_global'
  ) THEN
    v_domain := (NEW.raw_app_meta_data->>'domain')::public.indulge_domain;
  END IF;

  -- Department: trust app_metadata only (drives workspace routing).
  v_department := NULL;
  IF NEW.raw_app_meta_data->>'department' IN (
    'concierge', 'finance', 'tech', 'shop', 'house', 'legacy', 'marketing', 'onboarding'
  ) THEN
    v_department := (NEW.raw_app_meta_data->>'department')::public.employee_department;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, domain, department, job_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role,
    v_domain,
    v_department,
    -- job_title is display-only: safe to read from user_metadata
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'job_title', '')), '')
  );
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CREATE get_user_department() HELPER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
-- Follows the exact same pattern as get_user_role() and get_user_domain().
-- Reads ONLY from public.profiles via auth.uid(). JWT claims are NEVER trusted
-- for authorization — this is an architectural invariant (see migration 058).
-- NULL return = user is cross-departmental (admin/founder/system).

CREATE OR REPLACE FUNCTION public.get_user_department()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT department::TEXT FROM public.profiles WHERE id = auth.uid());
$$;

COMMENT ON FUNCTION public.get_user_department() IS
  'Returns current user''s department from profiles. NULL = cross-departmental role (admin/founder). Never reads JWT claims.';

GRANT EXECUTE ON FUNCTION public.get_user_department() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. MINIMAL RLS UPDATE: support indulge_global cross-domain visibility
-- ─────────────────────────────────────────────────────────────────────────────
-- Users with domain = 'indulge_global' (Finance, Tech, Marketing) need
-- cross-domain SELECT on core tables. Only SELECT is expanded — INSERT/UPDATE
-- permissions are unchanged (Finance agents do not create leads).
--
-- Affected policies: profiles, leads (SELECT only).
-- Tasks and lead_activities are covered implicitly since they reference leads.
-- Only the SELECT clauses for manager/agent roles are modified.

-- ── profiles SELECT ──────────────────────────────────────────────────────────
-- Allow all authenticated users to see basic public profile info for the
-- internal directory (name, department, job_title, role). Sensitive HR fields
-- do not exist on the profiles table; no data leak risk.
-- We DROP the old per-role SELECT policies and replace with a unified one.

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_domain" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Allow own profile read" ON public.profiles;
DROP POLICY IF EXISTS "Allow admin read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow manager read domain profiles" ON public.profiles;

-- All authenticated users can read all profile rows (for directory feature).
-- The profiles table contains only display fields — no salary/bank/HR data.
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- ── leads SELECT — add indulge_global cross-domain clause ───────────────────
-- Identify the current select policy name first.
-- Based on migration 056/058 patterns, the policy is "leads_select".
-- We drop and recreate it with the global-domain clause added.

DROP POLICY IF EXISTS "leads_select" ON public.leads;

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT TO authenticated
  USING (
    -- Admins and founders see all leads across all domains
    public.get_user_role() IN ('admin', 'founder')
    -- indulge_global domain users (Finance, Tech, Marketing) see all leads
    OR public.get_user_domain() = 'indulge_global'
    -- Managers see leads in their domain
    OR (
      public.get_user_role() = 'manager'
      AND domain::TEXT = public.get_user_domain()
    )
    -- Agents see leads assigned to them OR in their domain
    OR (
      public.get_user_role() = 'agent'
      AND (
        assigned_to = auth.uid()
        OR domain::TEXT = public.get_user_domain()
      )
    )
    -- Guests (read-only) see their domain's leads
    OR (
      public.get_user_role() = 'guest'
      AND domain::TEXT = public.get_user_domain()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS profiles_department_idx
  ON public.profiles (department)
  WHERE department IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_reports_to_idx
  ON public.profiles (reports_to)
  WHERE reports_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_role_active_idx
  ON public.profiles (role, is_active)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_user_department() TO service_role;
