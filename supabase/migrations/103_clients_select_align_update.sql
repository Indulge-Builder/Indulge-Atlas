-- Migration 103: Align clients SELECT with the clients UPDATE policy.
-- Migration 080 defined "clients_select" as: closed_by owner, ('admin','founder','manager'),
-- or an explicit lead_collaborators grant. Migration 088/102 defined "clients_update" to also
-- allow super_admin and the assigned_agent_id owner. That mismatch means a super_admin or an
-- assigned-agent owner passes the UPDATE policy but fails the SELECT that PostgREST runs for
-- `.update().select("id")` — the write succeeds yet returns zero rows, surfacing as a false
-- "You don't have permission to update this client".
--
-- Bring SELECT in line with UPDATE: add super_admin and assigned_agent_id. This only widens
-- read access for row owners / super_admins and does not narrow any existing grant.

DROP POLICY IF EXISTS "clients_select" ON public.clients;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (
    closed_by = auth.uid()
    OR assigned_agent_id = auth.uid()
    OR public.get_user_role() IN ('admin', 'founder', 'super_admin', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.lead_collaborators lc
      WHERE lc.lead_id = clients.lead_origin_id
        AND lc.user_id = auth.uid()
    )
  );
