-- Migration 088: Allow authorised users to UPDATE public.clients (notes, etc.).
-- Previously only SELECT + INSERT policies existed; updates were implicitly denied under RLS.

DROP POLICY IF EXISTS "clients_update" ON public.clients;

CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR closed_by = auth.uid()
    OR assigned_agent_id = auth.uid()
  )
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR closed_by = auth.uid()
    OR assigned_agent_id = auth.uid()
  );
