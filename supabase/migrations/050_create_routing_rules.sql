-- =============================================================================
-- INDULGE ATLAS — Dynamic Lead Routing Rules (management console)
-- =============================================================================
-- Enterprise-style ordered rules for future webhook assignment. RLS: admin + scout.
-- =============================================================================

CREATE TABLE public.lead_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority integer NOT NULL DEFAULT 100,
  rule_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  condition_field text NOT NULL,
  condition_operator text NOT NULL,
  condition_value text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('assign_to_agent', 'route_to_domain_pool')),
  action_target_uuid uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action_target_domain text NULL
);

CREATE INDEX idx_lead_routing_rules_priority ON public.lead_routing_rules (priority ASC);

ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_routing_rules_admin_scout_all"
  ON public.lead_routing_rules
  FOR ALL
  TO authenticated
  USING (public.get_role_from_jwt() IN ('admin', 'scout'))
  WITH CHECK (public.get_role_from_jwt() IN ('admin', 'scout'));

COMMENT ON TABLE public.lead_routing_rules IS
  'Ordered lead routing rules for dynamic assignment (admin/scout management UI).';
