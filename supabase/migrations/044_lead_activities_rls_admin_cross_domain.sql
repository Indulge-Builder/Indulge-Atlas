-- =============================================================================
-- Fix lead_activities RLS after 043: admins could not INSERT; scouts/admins
-- were blocked when acting on leads outside their profile domain.
-- Aligns with leads_select (scout/admin/finance cross-domain visibility).
-- =============================================================================

DROP POLICY IF EXISTS "lead_activities_select_by_domain" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert_by_role" ON public.lead_activities;

-- SELECT: privileged roles see timeline for any lead; agents/viewers only same domain
CREATE POLICY "lead_activities_select_by_domain" ON public.lead_activities
  FOR SELECT USING (
    (
      public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = lead_activities.lead_id
      )
    )
    OR (
      public.get_role_from_jwt() IN ('agent', 'viewer')
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = lead_activities.lead_id
          AND l.domain = public.get_my_domain()
      )
    )
  );

-- INSERT: scout/admin may log for any lead; agents only for leads in their domain
CREATE POLICY "lead_activities_insert_by_role" ON public.lead_activities
  FOR INSERT WITH CHECK (
    (
      public.get_role_from_jwt() IN ('scout', 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = lead_activities.lead_id
      )
    )
    OR (
      public.get_role_from_jwt() = 'agent'
      AND EXISTS (
        SELECT 1
        FROM public.leads l
        WHERE l.id = lead_activities.lead_id
          AND l.domain = public.get_my_domain()
      )
    )
  );
