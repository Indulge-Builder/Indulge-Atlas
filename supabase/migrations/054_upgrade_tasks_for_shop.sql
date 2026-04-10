-- =============================================================================
-- INDULGE ATLAS — Shop Operations on existing `tasks` (extend, do not replace)
-- =============================================================================
-- Existing: `task_type` enum = call | whatsapp_message | … (channel/type of work).
-- New: `shop_operation_scope` = individual | group (collaboration mode).
-- Multi-assignee: already `assigned_to_users uuid[]` (034) — no junction table.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TASKS — shop operation fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS shop_operation_scope text NOT NULL DEFAULT 'individual'
    CHECK (shop_operation_scope IN ('individual', 'group')),
  ADD COLUMN IF NOT EXISTS target_inventory int NULL
    CHECK (target_inventory IS NULL OR target_inventory >= 0),
  ADD COLUMN IF NOT EXISTS target_sold int NOT NULL DEFAULT 0
    CHECK (target_sold >= 0),
  ADD COLUMN IF NOT EXISTS shop_task_priority text NOT NULL DEFAULT 'normal'
    CHECK (shop_task_priority IN ('super_high', 'high', 'normal')),
  ADD COLUMN IF NOT EXISTS deadline timestamptz NULL,
  ADD COLUMN IF NOT EXISTS shop_product_name text NULL;

COMMENT ON COLUMN public.tasks.shop_operation_scope IS 'Shop ops: individual vs group collaboration (distinct from task_type enum).';
COMMENT ON COLUMN public.tasks.target_inventory IS 'Optional inventory target (e.g. 20 tickets).';
COMMENT ON COLUMN public.tasks.target_sold IS 'Units sold toward target_inventory.';
COMMENT ON COLUMN public.tasks.shop_task_priority IS 'Shop war-room priority tier.';
COMMENT ON COLUMN public.tasks.deadline IS 'Shop deadline; if null, use due_date.';
COMMENT ON COLUMN public.tasks.shop_product_name IS 'Product label for inventory / sale flows.';

-- Backfill deadline from due_date where missing
UPDATE public.tasks
SET deadline = due_date
WHERE deadline IS NULL;

CREATE INDEX IF NOT EXISTS tasks_shop_scope_idx ON public.tasks (shop_operation_scope)
  WHERE shop_operation_scope = 'group';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SHOP_ORDERS — link to tasks + optional lead (task-only WhatsApp sales)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shop_orders
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name text NULL,
  ADD COLUMN IF NOT EXISTS customer_phone text NULL;

CREATE INDEX IF NOT EXISTS shop_orders_task_id_idx ON public.shop_orders (task_id);

ALTER TABLE public.shop_orders
  DROP CONSTRAINT IF EXISTS shop_orders_lead_or_task_ctx;

ALTER TABLE public.shop_orders
  ADD CONSTRAINT shop_orders_lead_or_task_ctx CHECK (
    (lead_id IS NOT NULL AND task_id IS NULL)
    OR (task_id IS NOT NULL)
  );

COMMENT ON COLUMN public.shop_orders.task_id IS 'When set, sale is tied to a shop task; lead_id may be null.';
COMMENT ON COLUMN public.shop_orders.customer_name IS 'Buyer name when no CRM lead row.';
COMMENT ON COLUMN public.shop_orders.customer_phone IS 'Buyer phone when no CRM lead row.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS helpers — task-linked orders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_shop_order_via_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = p_task_id
        AND auth.uid() = ANY (t.assigned_to_users)
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — shop_orders (replace policies to include task_id path)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shop_orders_select" ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_insert" ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_update" ON public.shop_orders;
DROP POLICY IF EXISTS "shop_orders_delete" ON public.shop_orders;

CREATE POLICY "shop_orders_select" ON public.shop_orders
  FOR SELECT
  USING (
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR assigned_to = auth.uid()
    OR (lead_id IS NOT NULL AND public.can_access_shop_order_via_lead(lead_id))
    OR (task_id IS NOT NULL AND public.can_access_shop_order_via_task(task_id))
  );

CREATE POLICY "shop_orders_insert" ON public.shop_orders
  FOR INSERT
  WITH CHECK (
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR (
      public.get_role_from_jwt() = 'agent'
      AND assigned_to = auth.uid()
      AND (
        (lead_id IS NOT NULL AND public.can_access_shop_order_via_lead(lead_id))
        OR (task_id IS NOT NULL AND public.can_access_shop_order_via_task(task_id))
      )
    )
  );

CREATE POLICY "shop_orders_update" ON public.shop_orders
  FOR UPDATE
  USING (
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR (
      public.get_role_from_jwt() = 'agent'
      AND (
        assigned_to = auth.uid()
        OR (lead_id IS NOT NULL AND public.can_access_shop_order_via_lead(lead_id))
        OR (task_id IS NOT NULL AND public.can_access_shop_order_via_task(task_id))
      )
    )
  );

CREATE POLICY "shop_orders_delete" ON public.shop_orders
  FOR DELETE
  USING (public.get_role_from_jwt() IN ('scout', 'admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Atomic increment for target_sold (Register Sale flow)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_shop_task_target_sold(p_task_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new int;
BEGIN
  UPDATE public.tasks
  SET target_sold = target_sold + 1
  WHERE id = p_task_id
    AND (
      auth.uid() = ANY (assigned_to_users)
      OR public.get_role_from_jwt() IN ('admin', 'scout', 'finance')
    )
  RETURNING target_sold INTO v_new;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'not_allowed_or_missing_task';
  END IF;
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_shop_task_target_sold(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_shop_task_target_sold(uuid) TO authenticated;
