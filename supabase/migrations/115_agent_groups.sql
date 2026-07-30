-- Migration 115: Agent groups (imported from Freshdesk) + membership join.
--
-- Freshdesk has 11 agent groups but their membership is EMPTY, so we import the
-- group LIST only and populate members in Atlas (Admin → Groups). These groups
-- are an organisational directory and are DISTINCT from:
--   * profiles.department (the fixed access-control enum), and
--   * profiles.concierge_group (anishqa/ananyshree — used for ticket RLS scoping).
--
-- Access model (matches the concierge lookup tables, migration 107):
--   * SELECT: any authenticated staff member.
--   * WRITE (all): admin / founder / super_admin via get_user_role() (reads
--     ONLY from public.profiles, never JWT).
--   * service_role bypass for scripted imports.

-- ── agent_groups ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_groups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  slug         text        UNIQUE,
  source       text        NOT NULL DEFAULT 'freshdesk',
  fd_group_id  bigint      NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_groups_select"
  ON public.agent_groups FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "agent_groups_write"
  ON public.agent_groups FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "agent_groups_service_role"
  ON public.agent_groups
  USING (auth.role() = 'service_role');

-- ── agent_group_members ──────────────────────────────────────────────────────
-- Join table: which Atlas profiles belong to which group. FD membership was
-- empty, so this is populated exclusively from within Atlas.

CREATE TABLE IF NOT EXISTS public.agent_group_members (
  group_id      uuid        NOT NULL REFERENCES public.agent_groups(id) ON DELETE CASCADE,
  profile_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_group text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_group_members_profile
  ON public.agent_group_members (profile_id);

ALTER TABLE public.agent_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_group_members_select"
  ON public.agent_group_members FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "agent_group_members_write"
  ON public.agent_group_members FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin', 'founder', 'super_admin'))
  WITH CHECK (public.get_user_role() IN ('admin', 'founder', 'super_admin'));

CREATE POLICY "agent_group_members_service_role"
  ON public.agent_group_members
  USING (auth.role() = 'service_role');

-- ── Seed the 11 Freshdesk groups (idempotent) ────────────────────────────────
-- fd_group_id values captured from GET /api/v2/groups on 2026-07-10.

INSERT INTO public.agent_groups (name, slug, source, fd_group_id) VALUES
  ('Ananyshree''s Queendom', 'ananyshree-queendom', 'freshdesk', 1070000391220),
  ('Anishqa''s Queendom',    'anishqa-queendom',    'freshdesk', 1070000391257),
  ('Bishop',                 'bishop',              'freshdesk', 1070000366020),
  ('Concierge',              'concierge',           'freshdesk', 1070000366028),
  ('Finance and Billing',    'finance-and-billing', 'freshdesk', 1070000153051),
  ('Global Events',          'global-events',       'freshdesk', 1070000231279),
  ('Indulge Shop',           'indulge-shop',        'freshdesk', 1070000390608),
  ('Jokers',                 'jokers',              'freshdesk', 1070000390795),
  ('Management',             'management',          'freshdesk', 1070000285957),
  ('Queendom',               'queendom',            'freshdesk', 1070000153048),
  ('Retail',                 'retail',              'freshdesk', 1070000390311)
ON CONFLICT (name) DO NOTHING;
