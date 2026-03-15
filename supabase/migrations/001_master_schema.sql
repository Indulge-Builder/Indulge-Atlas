

-- ── 1. EXTENSIONS ─────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── 2. ENUMS ──────────────────────────────────────────────

CREATE TYPE public.user_role AS ENUM (
  'scout',    -- Performance Marketer / Head of Campaigns
  'agent',    -- Onboarding / Sales Agent
  'admin',    -- Full system access
  'finance'   -- Read-only access to deals and revenue
);

CREATE TYPE public.indulge_domain AS ENUM (
  'indulge_global',
  'indulge_shop',
  'the_indulge_house',
  'indulge_legacy'
);

CREATE TYPE public.lead_status AS ENUM (
  'new',
  'attempted',
  'in_discussion',
  'won',
  'lost',
  'nurturing',
  'trash'
);

CREATE TYPE public.task_type AS ENUM (
  -- Agent task types
  'call',
  'whatsapp_message',
  'email',
  'file_dispatch',
  'general_follow_up',
  -- Scout / strategic task types
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

CREATE TYPE public.ad_platform AS ENUM (
  'meta',
  'google',
  'website',
  'events',
  'referral'
);

-- Used by campaign_drafts
CREATE TYPE public.draft_status AS ENUM (
  'draft',
  'approved',
  'deployed'
);

-- Used by lead_activities audit log
CREATE TYPE public.activity_type AS ENUM (
  'status_change',
  'note',
  'call_attempt',
  'task_created'
);


-- ── 3. SHARED TRIGGER FUNCTION ────────────────────────────

CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── 4. TABLES ─────────────────────────────────────────────

-- ── profiles ──────────────────────────────────────────────
-- One row per auth.users entry. Auto-created on signup via trigger.

CREATE TABLE public.profiles (
  id          uuid                  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text                  NOT NULL,
  email       text                  NOT NULL,
  phone       text,
  dob         date,
  role        public.user_role       NOT NULL DEFAULT 'agent',
  domain      public.indulge_domain  NOT NULL DEFAULT 'indulge_global',
  is_active   boolean               NOT NULL DEFAULT true,
  created_at  timestamptz           NOT NULL DEFAULT now(),
  updated_at  timestamptz           NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- Auto-create profile row when a new auth user signs up

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

-- profiles now exists — safe to create this RLS helper
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ── leads ──────────────────────────────────────────────────

CREATE TABLE public.leads (
  id            uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    text                  NOT NULL,
  last_name     text,                              -- nullable: single-name contacts
  phone_number  text                  NOT NULL,
  email         text,
  city          text,
  source        text,                              -- e.g. 'Meta Ads', 'Referral'
  campaign_id   text,                              -- free-text campaign identifier
  deal_value    numeric(14, 2),
  domain        public.indulge_domain  NOT NULL DEFAULT 'indulge_global',
  status        public.lead_status     NOT NULL DEFAULT 'new',
  assigned_to   uuid                  REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz           NOT NULL DEFAULT now(),
  updated_at    timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX leads_assigned_to_idx  ON public.leads(assigned_to);
CREATE INDEX leads_status_idx       ON public.leads(status);
CREATE INDEX leads_domain_idx       ON public.leads(domain);
CREATE INDEX leads_campaign_id_idx  ON public.leads(campaign_id);
CREATE INDEX leads_source_idx       ON public.leads(source);
CREATE INDEX leads_created_at_idx   ON public.leads(created_at DESC);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ── tasks ──────────────────────────────────────────────────
-- lead_id is NULLABLE — scouts create strategic tasks with no associated lead.

CREATE TABLE public.tasks (
  id           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid               REFERENCES public.leads(id) ON DELETE CASCADE,  -- nullable
  assigned_to  uuid               NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text               NOT NULL,
  task_type    public.task_type   NOT NULL DEFAULT 'call',
  status       public.task_status NOT NULL DEFAULT 'pending',
  due_date     timestamptz        NOT NULL,
  notes        text,
  created_at   timestamptz        NOT NULL DEFAULT now(),
  updated_at   timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX tasks_assigned_to_idx ON public.tasks(assigned_to);
CREATE INDEX tasks_lead_id_idx     ON public.tasks(lead_id);
CREATE INDEX tasks_due_date_idx    ON public.tasks(due_date ASC);
CREATE INDEX tasks_status_idx      ON public.tasks(status);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ── lead_activities ────────────────────────────────────────
-- Immutable audit log — rows are never updated or deleted.

CREATE TABLE public.lead_activities (
  id            uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid                  NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  performed_by  uuid                  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          public.activity_type  NOT NULL,
  payload       jsonb                 NOT NULL DEFAULT '{}',
  created_at    timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX lead_activities_lead_id_idx      ON public.lead_activities(lead_id);
CREATE INDEX lead_activities_performed_by_idx ON public.lead_activities(performed_by);
CREATE INDEX lead_activities_type_idx         ON public.lead_activities(type);


-- ── campaign_metrics ───────────────────────────────────────
-- Cached data synced from Meta / Google Ads APIs.

CREATE TABLE public.campaign_metrics (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        public.ad_platform NOT NULL,
  campaign_id     text               NOT NULL,
  campaign_name   text               NOT NULL,
  amount_spent    numeric(14, 2)     NOT NULL DEFAULT 0,
  impressions     bigint             NOT NULL DEFAULT 0,
  clicks          bigint             NOT NULL DEFAULT 0,
  last_synced_at  timestamptz        NOT NULL DEFAULT now(),
  created_at      timestamptz        NOT NULL DEFAULT now(),

  UNIQUE (platform, campaign_id)
);

CREATE INDEX campaign_metrics_platform_idx ON public.campaign_metrics(platform);
CREATE INDEX campaign_metrics_synced_idx   ON public.campaign_metrics(last_synced_at DESC);


-- ── campaign_drafts ────────────────────────────────────────
-- Saved plans from the Ad Planner Studio.

CREATE TABLE public.campaign_drafts (
  id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name     text                NOT NULL,
  platform          public.ad_platform  NOT NULL,
  objective         text,
  total_budget      numeric(14, 2)      NOT NULL DEFAULT 0,
  target_cpa        numeric(14, 2)      NOT NULL DEFAULT 0,
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


-- ── 6. UTILITY FUNCTIONS ──────────────────────────────────

-- Round-robin agent assignment:
-- Returns the active agent with the fewest non-terminal leads.
-- Tie-broken by earliest created_at (longest waiting).

CREATE OR REPLACE FUNCTION public.assign_next_agent()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN (
    SELECT
      assigned_to,
      COUNT(*) AS active_lead_count
    FROM public.leads
    WHERE status NOT IN ('won', 'lost', 'trash')
    GROUP BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role    = 'agent'
    AND p.is_active = true
  ORDER BY
    COALESCE(lc.active_lead_count, 0) ASC,
    p.created_at ASC
  LIMIT 1;
$$;

-- Aggregated lead status counts for a given agent

CREATE OR REPLACE FUNCTION public.get_agent_lead_stats(agent_uuid uuid)
RETURNS TABLE (status public.lead_status, count bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT status, COUNT(*) AS count
  FROM public.leads
  WHERE assigned_to = agent_uuid
  GROUP BY status;
$$;

-- Count of pending tasks not yet due for a given profile

CREATE OR REPLACE FUNCTION public.get_agent_upcoming_tasks(agent_uuid uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)
  FROM public.tasks
  WHERE assigned_to = agent_uuid
    AND status      = 'pending'
    AND due_date   >= now();
$$;


-- ── 7. ROW LEVEL SECURITY ─────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_drafts  ENABLE ROW LEVEL SECURITY;


-- ── profiles policies ─────────────────────────────────────

-- Everyone reads their own row; scouts / admins / finance read the full roster
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
  );

-- Users update their own profile; admins update any
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (id = auth.uid() OR public.get_my_role() = 'admin');

-- Direct inserts only by admins (signup trigger runs as SECURITY DEFINER)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ── leads policies ────────────────────────────────────────

-- Agents see only their leads; scouts / admins / finance see all
CREATE POLICY "leads_select" ON public.leads
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
  );

-- Scouts and admins insert freely; agents may only insert with themselves as owner
CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('scout', 'admin')
    OR (
      public.get_my_role() = 'agent'
      AND assigned_to = auth.uid()
    )
  );

-- Agents update only their own leads; scouts and admins update any
CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

-- Only admins delete leads
CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE USING (public.get_my_role() = 'admin');


-- ── tasks policies ────────────────────────────────────────

-- Agents see their own tasks; scouts / admins see all
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

-- Agents create tasks for themselves; scouts / admins create for anyone
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

-- Agents update their own tasks; scouts / admins update any
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin')
  );

-- Agents delete their own tasks; admins delete any
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    assigned_to = auth.uid()
    OR public.get_my_role() = 'admin'
  );


-- ── lead_activities policies ──────────────────────────────

-- Agents read activities on leads assigned to them; scouts / admins / finance read all
CREATE POLICY "activities_select" ON public.lead_activities
  FOR SELECT USING (
    performed_by = auth.uid()
    OR public.get_my_role() IN ('scout', 'admin', 'finance')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND l.assigned_to = auth.uid()
    )
  );

-- Any user may log an activity on a lead they own (or scouts / admins on any)
CREATE POLICY "activities_insert" ON public.lead_activities
  FOR INSERT WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.get_my_role() IN ('scout', 'admin')
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.assigned_to = auth.uid()
      )
    )
  );

-- Activities are immutable: no UPDATE or DELETE policies are created.


-- ── campaign_metrics policies ─────────────────────────────

-- Scouts, admins, and finance read metrics
CREATE POLICY "campaign_metrics_select" ON public.campaign_metrics
  FOR SELECT USING (
    public.get_my_role() IN ('scout', 'admin', 'finance')
  );

-- Only admins write directly; syncing is done via service role in server actions
CREATE POLICY "campaign_metrics_write" ON public.campaign_metrics
  FOR ALL USING (public.get_my_role() = 'admin');


-- ── campaign_drafts policies ──────────────────────────────

-- Scouts and admins read all drafts
CREATE POLICY "drafts_select" ON public.campaign_drafts
  FOR SELECT USING (
    public.get_my_role() IN ('scout', 'admin')
  );

-- Scouts and admins insert their own drafts
CREATE POLICY "drafts_insert" ON public.campaign_drafts
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.get_my_role() IN ('scout', 'admin')
  );

-- Scouts update their own drafts; admins update any
CREATE POLICY "drafts_update" ON public.campaign_drafts
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- Scouts delete their own drafts; admins delete any
CREATE POLICY "drafts_delete" ON public.campaign_drafts
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.get_my_role() = 'admin'
  );
