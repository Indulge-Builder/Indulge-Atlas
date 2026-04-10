-- =============================================================================
-- INDULGE ATLAS — Shop Workspace (orders + master targets + SLA updates)
-- =============================================================================
-- Note: 052 is onboarding_leads; this is the shop engine migration.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_orders_lead_id_idx ON public.shop_orders (lead_id);
CREATE INDEX shop_orders_assigned_to_idx ON public.shop_orders (assigned_to);
CREATE INDEX shop_orders_status_idx ON public.shop_orders (status);
CREATE INDEX shop_orders_created_at_idx ON public.shop_orders (created_at DESC);

CREATE TABLE public.shop_master_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  inventory_total int NOT NULL CHECK (inventory_total >= 0),
  inventory_sold int NOT NULL DEFAULT 0 CHECK (inventory_sold >= 0),
  priority text NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('super_high', 'high', 'normal')
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_master_targets_status_idx ON public.shop_master_targets (status);

CREATE TABLE public.shop_target_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.shop_master_targets(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  units_sold_in_update int NOT NULL DEFAULT 0 CHECK (units_sold_in_update >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_target_updates_target_id_idx ON public.shop_target_updates (target_id);
CREATE INDEX shop_target_updates_created_at_idx ON public.shop_target_updates (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INVENTORY: increment parent target when an update row is inserted
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.shop_target_updates_inc_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shop_master_targets
  SET inventory_sold = inventory_sold + NEW.units_sold_in_update
  WHERE id = NEW.target_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shop_target_updates_inc_inventory
  AFTER INSERT ON public.shop_target_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.shop_target_updates_inc_inventory();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS HELPERS (align with multi-tenant leads + shop domain)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_shop_workspace_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR public.get_my_domain() = 'indulge_shop'::public.indulge_domain;
$$;

CREATE OR REPLACE FUNCTION public.can_access_shop_order_via_lead(p_lead_id uuid)
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
      FROM public.leads l
      WHERE l.id = p_lead_id
        AND l.assigned_to = auth.uid()
        AND l.domain = public.get_my_domain()
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — shop_orders
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_orders_select" ON public.shop_orders
  FOR SELECT
  USING (
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR assigned_to = auth.uid()
    OR public.can_access_shop_order_via_lead(lead_id)
  );

CREATE POLICY "shop_orders_insert" ON public.shop_orders
  FOR INSERT
  WITH CHECK (
    public.get_role_from_jwt() IN ('scout', 'admin', 'finance')
    OR (
      public.get_role_from_jwt() = 'agent'
      AND assigned_to = auth.uid()
      AND public.can_access_shop_order_via_lead(lead_id)
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
        OR public.can_access_shop_order_via_lead(lead_id)
      )
    )
  );

CREATE POLICY "shop_orders_delete" ON public.shop_orders
  FOR DELETE
  USING (public.get_role_from_jwt() IN ('scout', 'admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY — shop_master_targets
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shop_master_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_master_targets_select" ON public.shop_master_targets
  FOR SELECT
  USING (public.can_access_shop_workspace_data());

CREATE POLICY "shop_master_targets_insert" ON public.shop_master_targets
  FOR INSERT
  WITH CHECK (public.get_role_from_jwt() IN ('scout', 'admin'));

CREATE POLICY "shop_master_targets_update" ON public.shop_master_targets
  FOR UPDATE
  USING (public.get_role_from_jwt() IN ('scout', 'admin'));

CREATE POLICY "shop_master_targets_delete" ON public.shop_master_targets
  FOR DELETE
  USING (public.get_role_from_jwt() IN ('admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY — shop_target_updates
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shop_target_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_target_updates_select" ON public.shop_target_updates
  FOR SELECT
  USING (public.can_access_shop_workspace_data());

CREATE POLICY "shop_target_updates_insert" ON public.shop_target_updates
  FOR INSERT
  WITH CHECK (
    agent_id = auth.uid()
    AND public.can_access_shop_workspace_data()
    AND EXISTS (
      SELECT 1
      FROM public.shop_master_targets t
      WHERE t.id = target_id
        AND t.status = 'active'
    )
  );

COMMENT ON TABLE public.shop_orders IS 'Indulge Shop order lifecycle rows (CRM workspace).';
COMMENT ON TABLE public.shop_master_targets IS 'Inventory / revenue targets for Shop SLA engine.';
COMMENT ON TABLE public.shop_target_updates IS 'Agent log updates; increments inventory_sold via trigger.';
