-- Migration 107: Concierge ticketing — shared lookup / reference tables.
--
-- Parent tables that concierge_tickets (migration 108) FKs into: the category
-- taxonomy, checklist templates, SLA policies, canned responses, and vendors.
-- These carry NO FK to concierge_tickets, so they are safe to create first.
--
-- Access model (see build spec §6):
--   * Config tables (categories, checklist templates, SLA, canned): readable by
--     all authenticated staff; managed (write) by admin / founder / super_admin.
--   * Vendors: readable + writable by concierge/finance staff and privileged roles
--     (Genies create/link vendors from notes).
-- get_user_role() / get_user_department() read ONLY from public.profiles.

-- ── ticket_categories ────────────────────────────────────────────────────────
-- Self-referencing taxonomy: top-level category (parent_id NULL) -> subcategory.

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  parent_id  uuid        NULL REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  sort_order integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent
  ON public.ticket_categories (parent_id, sort_order);

-- Prevent duplicate sibling names (top-level uniqueness needs a NULL-safe key).
CREATE UNIQUE INDEX IF NOT EXISTS ticket_categories_name_parent_uidx
  ON public.ticket_categories (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_categories_select"
  ON public.ticket_categories FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "ticket_categories_write"
  ON public.ticket_categories FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "ticket_categories_service_role"
  ON public.ticket_categories
  USING (auth.role() = 'service_role');

-- ── ticket_checklist_templates ───────────────────────────────────────────────
-- Per-category checklist item templates; snapshotted onto a ticket at creation.

CREATE TABLE IF NOT EXISTS public.ticket_checklist_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_checklist_templates_category
  ON public.ticket_checklist_templates (category_id, sort_order);

ALTER TABLE public.ticket_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_checklist_templates_select"
  ON public.ticket_checklist_templates FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "ticket_checklist_templates_write"
  ON public.ticket_checklist_templates FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "ticket_checklist_templates_service_role"
  ON public.ticket_checklist_templates
  USING (auth.role() = 'service_role');

-- ── sla_policies ─────────────────────────────────────────────────────────────
-- Matching order at compute time: (category+priority) -> (category, NULL) -> default.

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL,
  category_id            uuid        NULL REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  priority               public.concierge_ticket_priority NULL,   -- NULL = all priorities
  first_response_minutes integer     NOT NULL CHECK (first_response_minutes >= 0),
  resolution_minutes     integer     NOT NULL CHECK (resolution_minutes >= 0),
  is_default             boolean     NOT NULL DEFAULT false,
  is_active              boolean     NOT NULL DEFAULT true,
  escalation_enabled     boolean     NOT NULL DEFAULT true,
  -- 'calendar' = 24/7 clock (concierge desk runs round-the-clock); durations are
  -- calendar minutes. 'business_hours' retained for a possible future windowed clock.
  clock                  text        NOT NULL DEFAULT 'calendar'
                                     CHECK (clock IN ('business_hours', 'calendar')),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_match
  ON public.sla_policies (category_id, priority)
  WHERE is_active;

-- The Default policy is intentionally one row PER priority (Urgent/High/Medium/Low),
-- so there is no single-default constraint. This partial unique index prevents two
-- active default rows for the SAME priority. (Index the bare enum column, NOT a
-- priority::text cast — enum→text is only STABLE and is rejected in index exprs.
-- NULL priorities are distinct in a unique index, which is acceptable here.)
CREATE UNIQUE INDEX IF NOT EXISTS sla_policies_default_priority_uidx
  ON public.sla_policies (priority)
  WHERE is_default AND is_active;

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_policies_select"
  ON public.sla_policies FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "sla_policies_write"
  ON public.sla_policies FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "sla_policies_service_role"
  ON public.sla_policies
  USING (auth.role() = 'service_role');

-- ── canned_responses ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canned_responses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  shortcut      text        NULL,
  body_template text        NOT NULL,
  category_id   uuid        NULL REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_active
  ON public.canned_responses (name)
  WHERE is_active;

ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canned_responses_select"
  ON public.canned_responses FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "canned_responses_write"
  ON public.canned_responses FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "canned_responses_service_role"
  ON public.canned_responses
  USING (auth.role() = 'service_role');

-- ── vendors ──────────────────────────────────────────────────────────────────
-- Minimal vendor directory. trust_score is derived from vendor_feedback (108)
-- and recomputed by the server action after each feedback insert.

CREATE TABLE IF NOT EXISTS public.vendors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  company     text        NULL,
  phone       text        NULL,          -- E.164 (normalizeToE164, IN default)
  email       text        NULL,
  poc         text        NULL,
  location    text        NULL,
  trust_score numeric     NULL,
  created_by  uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dedup helper: block obvious duplicates on (lower(name), phone). The action also
-- fuzzy-matches before inserting; this constraint is the hard backstop.
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_phone_uidx
  ON public.vendors (lower(name), COALESCE(phone, ''));

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors_select"
  ON public.vendors FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR public.get_user_department() IN ('concierge', 'finance')
  );

CREATE POLICY "vendors_insert"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR public.get_user_department() IN ('concierge', 'finance')
  );

CREATE POLICY "vendors_update"
  ON public.vendors FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR public.get_user_department() IN ('concierge', 'finance')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin')
    OR public.get_user_department() IN ('concierge', 'finance')
  );

CREATE POLICY "vendors_service_role"
  ON public.vendors
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.vendors IS
  'Minimal vendor directory for concierge tickets. trust_score derived from vendor_feedback.';
