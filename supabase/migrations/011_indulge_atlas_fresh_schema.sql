-- =============================================================================
-- INDULGE ATLAS — Fresh Schema Migration
-- =============================================================================
--
-- A single, modular migration for setting up the Indulge Atlas CRM database
-- from scratch. Designed for clean installs and fresh environments.
--
-- USAGE:
--   For a fresh database, run ONLY this migration:
--     1. Move or remove migrations 001–010 from supabase/migrations/
--     2. Run: supabase db reset
--   Or apply directly via Supabase SQL Editor on a new project.
--
-- Entity relationships:
--   auth.users ──1:1──> profiles
--   profiles   ──1:N──> leads (assigned_to)
--   profiles   ──1:N──> tasks (assigned_to)
--   profiles   ──1:N──> lead_activities (performed_by)
--   profiles   ──1:N──> campaign_drafts (created_by)
--   leads      ──1:N──> lead_activities
--   leads      ──1:N──> tasks (lead_id, nullable for scout tasks)
--   campaign_metrics — standalone (synced from ad platforms)
--
-- Role hierarchy: agent < scout < admin | finance
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ENUMS (ordered by dependency)
-- ─────────────────────────────────────────────────────────────────────────────

-- User roles: agent (sales), scout (performance/campaigns), admin, finance
CREATE TYPE public.user_role AS ENUM (
  'agent',
  'scout',
  'admin',
  'finance'
);

-- Business units / domains within Indulge
CREATE TYPE public.indulge_domain AS ENUM (
  'indulge_global',
  'indulge_shop',
  'the_indulge_house',
  'indulge_legacy'
);

-- Lead pipeline stages (lowercase for consistency)
CREATE TYPE public.lead_status AS ENUM (
  'new',
  'attempted',
  'in_discussion',
  'won',
  'lost',
  'nurturing',
  'trash'
);

-- Agent + scout task types
CREATE TYPE public.task_type AS ENUM (
  'call',
  'whatsapp_message',
  'email',
  'file_dispatch',
  'general_follow_up',
  'campaign_review',
  'strategy_meeting',
  'budget_approval',
  'performance_analysis'
);

CREATE TYPE public.task_status AS ENUM (
  'pending',
  'completed',
  'overdue'
);

-- Ad platforms for campaigns and metrics
CREATE TYPE public.ad_platform AS ENUM (
  'meta',
  'google',
  'website',
  'events',
  'referral'
);

-- Campaign draft lifecycle
CREATE TYPE public.draft_status AS ENUM (
  'draft',
  'approved',
  'deployed'
);

-- Lead activity audit log types
CREATE TYPE public.activity_type AS ENUM (
  'status_change',
  'note',
  'call_attempt',
  'task_created'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SHARED UTILITIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-update updated_at on any table
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CORE TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users. Auto-created on signup via trigger.
-- Extended with role, domain, and business metadata.

CREATE TABLE public.profiles (
  id          uuid                  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text                  NOT NULL,
  email       text                  NOT NULL,
  phone       text,
  dob         date,
  role        public.user_role       NOT NULL DEFAULT 'agent',
  domain      public.indulge_domain NOT NULL DEFAULT 'indulge_global',
  is_active   boolean                NOT NULL DEFAULT true,
  created_at  timestamptz            NOT NULL DEFAULT now(),
  updated_at  timestamptz            NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, domain)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.user_role,
      'agent'
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'domain')::public.indulge_domain,
      'indulge_global'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS helper: returns current user's role (must exist after profiles)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ── leads ───────────────────────────────────────────────────────────────────
-- CRM leads with pipeline status, assignment, and attribution.

CREATE TABLE public.leads (
  id               uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       text                  NOT NULL,
  last_name        text,
  phone_number     text                  NOT NULL,
  secondary_phone  text,
  email            text,
  city             text,
  address          text,
  channel          text,                  -- acquisition channel: website | whatsapp | meta_lead_form | facebook | instagram
  source           text,
  campaign_id      text,
  deal_value       numeric(14, 2),
  domain           public.indulge_domain  NOT NULL DEFAULT 'indulge_global',
  status           public.lead_status     NOT NULL DEFAULT 'new',
  assigned_to      uuid                  REFERENCES public.profiles(id) ON DELETE SET NULL,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,                  -- joins to campaign_metrics.campaign_id
  form_responses   jsonb,                 -- raw JSONB from Meta Lead Ad / website / WA chatbot
  notes            text,
  created_at    timestamptz            NOT NULL DEFAULT now(),
  updated_at    timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX leads_assigned_to_idx       ON public.leads(assigned_to);
CREATE INDEX leads_status_idx            ON public.leads(status);
CREATE INDEX leads_assigned_status_idx   ON public.leads(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX leads_domain_idx            ON public.leads(domain);
CREATE INDEX leads_campaign_id_idx       ON public.leads(campaign_id);
CREATE INDEX leads_utm_campaign_idx      ON public.leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX leads_source_idx            ON public.leads(source);
CREATE INDEX leads_created_at_idx       ON public.leads(created_at DESC);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ── tasks ───────────────────────────────────────────────────────────────────
-- Agent tasks (linked to leads) and scout tasks (lead_id nullable).

CREATE TABLE public.tasks (
  id           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid               REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to  uuid               NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text               NOT NULL,
  task_type    public.task_type   NOT NULL DEFAULT 'call',
  status       public.task_status NOT NULL DEFAULT 'pending',
  due_date     timestamptz        NOT NULL,
  notes        text,
  created_at   timestamptz         NOT NULL DEFAULT now(),
  updated_at   timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX tasks_assigned_to_idx    ON public.tasks(assigned_to);
CREATE INDEX tasks_assigned_due_idx   ON public.tasks(assigned_to, due_date ASC);
CREATE INDEX tasks_lead_id_idx         ON public.tasks(lead_id);
CREATE INDEX tasks_due_date_idx        ON public.tasks(due_date ASC);
CREATE INDEX tasks_status_idx          ON public.tasks(status);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ── lead_activities ───────────────────────────────────────────────────────────
-- Immutable audit log. Rows are never updated or deleted.

CREATE TABLE public.lead_activities (
  id            uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid                  NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  performed_by  uuid                  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          public.activity_type  NOT NULL,
  payload       jsonb                 NOT NULL DEFAULT '{}',
  created_at    timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX lead_activities_lead_id_idx       ON public.lead_activities(lead_id);
CREATE INDEX lead_activities_lead_created_idx   ON public.lead_activities(lead_id, created_at DESC);
CREATE INDEX lead_activities_performed_by_idx  ON public.lead_activities(performed_by);
CREATE INDEX lead_activities_type_idx          ON public.lead_activities(type);


-- ── campaign_metrics ────────────────────────────────────────────────────────
-- Cached data synced from Meta / Google Ads APIs. Upserted on sync.

CREATE TABLE public.campaign_metrics (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        public.ad_platform NOT NULL,
  campaign_id      text               NOT NULL,
  campaign_name   text               NOT NULL,
  amount_spent    numeric(14, 2)      NOT NULL DEFAULT 0,
  impressions     bigint             NOT NULL DEFAULT 0,
  clicks          bigint             NOT NULL DEFAULT 0,
  cpc             numeric(10, 4)     NOT NULL DEFAULT 0,
  last_synced_at  timestamptz         NOT NULL DEFAULT now(),
  created_at      timestamptz         NOT NULL DEFAULT now(),

  UNIQUE (platform, campaign_id)
);

CREATE INDEX campaign_metrics_platform_idx    ON public.campaign_metrics(platform);
CREATE INDEX campaign_metrics_campaign_id_idx ON public.campaign_metrics(campaign_id);
CREATE INDEX campaign_metrics_synced_idx      ON public.campaign_metrics(last_synced_at DESC);


-- ── campaign_drafts ────────────────────────────────────────────────────────
-- Ad Planner Studio: saved campaign plans before deployment.

CREATE TABLE public.campaign_drafts (
  id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name     text                NOT NULL,
  platform          public.ad_platform  NOT NULL,
  objective         text,
  total_budget      numeric(14, 2)      NOT NULL DEFAULT 0,
  target_cpa        numeric(14, 2)       NOT NULL DEFAULT 0,
  projected_revenue numeric(14, 2)      NOT NULL DEFAULT 0,
  status            public.draft_status NOT NULL DEFAULT 'draft',
  created_by        uuid                NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        timestamptz         NOT NULL DEFAULT now(),
  updated_at        timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX campaign_drafts_created_by_idx ON public.campaign_drafts(created_by);
CREATE INDEX campaign_drafts_status_idx     ON public.campaign_drafts(status);
CREATE INDEX campaign_drafts_created_at_idx ON public.campaign_drafts(created_at DESC);

CREATE TRIGGER campaign_drafts_updated_at
  BEFORE UPDATE ON public.campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. BUSINESS FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Round-robin agent assignment for webhooks / auto-assign
CREATE OR REPLACE FUNCTION public.assign_next_agent()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS active_lead_count
    FROM public.leads
    WHERE status NOT IN ('won', 'lost', 'trash')
    GROUP BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role = 'agent'
    AND p.is_active = true
  ORDER BY COALESCE(lc.active_lead_count, 0) ASC, p.created_at ASC
  LIMIT 1;
$$;

-- Lead status counts for agent dashboard
CREATE OR REPLACE FUNCTION public.get_agent_lead_stats(agent_uuid uuid)
RETURNS TABLE (status public.lead_status, count bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT status, COUNT(*) AS count
  FROM public.leads
  WHERE assigned_to = agent_uuid
  GROUP BY status;
$$;

-- Upcoming task count for agent dashboard
CREATE OR REPLACE FUNCTION public.get_agent_upcoming_tasks(agent_uuid uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)
  FROM public.tasks
  WHERE assigned_to = agent_uuid
    AND status = 'pending'
    AND due_date >= now();
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_drafts  ENABLE ROW LEVEL SECURITY;


-- ── profiles ────────────────────────────────────────────────────────────────

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ── leads ───────────────────────────────────────────────────────────────────

CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('scout', 'admin')
    OR (public.get_my_role() = 'agent' AND assigned_to = auth.uid())
  );

CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ── tasks ───────────────────────────────────────────────────────────────────

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() = 'admin'
  );


-- ── lead_activities ───────────────────────────────────────────────────────────

CREATE POLICY "activities_select" ON public.lead_activities
  FOR SELECT USING (
    performed_by = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_to = auth.uid()
    )
  );

CREATE POLICY "activities_insert" ON public.lead_activities
  FOR INSERT WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.get_my_role() IN ('scout', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.assigned_to = auth.uid()
      )
    )
  );

-- No UPDATE or DELETE policies — activities are immutable.


-- ── campaign_metrics ─────────────────────────────────────────────────────────

CREATE POLICY "campaign_metrics_select" ON public.campaign_metrics
  FOR SELECT USING (
    public.get_my_role() IN ('scout', 'admin', 'finance')
  );

CREATE POLICY "campaign_metrics_write" ON public.campaign_metrics
  FOR ALL USING (public.get_my_role() = 'admin');


-- ── campaign_drafts ─────────────────────────────────────────────────────────

CREATE POLICY "drafts_select" ON public.campaign_drafts
  FOR SELECT USING (
    public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "drafts_insert" ON public.campaign_drafts
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.get_my_role() IN ('scout', 'admin')
  );

CREATE POLICY "drafts_update" ON public.campaign_drafts
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "drafts_delete" ON public.campaign_drafts
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'admin'
  );
