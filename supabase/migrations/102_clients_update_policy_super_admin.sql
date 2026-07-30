-- Migration 102: Add super_admin to the clients UPDATE policy.
-- Migration 088 created "clients_update" allowing ('admin', 'founder', 'manager') plus
-- row owners. The application layer (canManageAnyClient → isPrivilegedRole) also grants
-- super_admin edit rights, so a super_admin passes the app gate but the RLS UPDATE
-- matches zero rows — a silent no-op that previously surfaced as a false "saved".
-- Bring the policy in line with the app: include super_admin.

DROP POLICY IF EXISTS "clients_update" ON public.clients;

CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
    OR closed_by = auth.uid()
    OR assigned_agent_id = auth.uid()
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
    OR closed_by = auth.uid()
    OR assigned_agent_id = auth.uid()
  );
