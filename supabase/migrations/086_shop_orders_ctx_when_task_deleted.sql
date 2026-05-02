-- =============================================================================
-- shop_orders: allow rows after task deletion (ON DELETE SET NULL on task_id)
-- =============================================================================
-- Migration 054 added CHECK shop_orders_lead_or_task_ctx:
--   (lead_id NOT NULL AND task_id IS NULL) OR (task_id IS NOT NULL)
-- Task-only orders use lead_id NULL + task_id set. When the task row is deleted,
-- Postgres runs SET task_id NULL, producing lead_id NULL + task_id NULL which
-- violated the constraint even when customer_name / customer_phone capture the sale.
-- Extend the check so standalone shop orders remain valid when buyer fields exist.
-- =============================================================================

ALTER TABLE public.shop_orders
  DROP CONSTRAINT IF EXISTS shop_orders_lead_or_task_ctx;

ALTER TABLE public.shop_orders
  ADD CONSTRAINT shop_orders_lead_or_task_ctx CHECK (
    (lead_id IS NOT NULL AND task_id IS NULL)
    OR (task_id IS NOT NULL)
    OR (
      lead_id IS NULL
      AND task_id IS NULL
      AND (
        NULLIF(btrim(COALESCE(customer_name, '')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(customer_phone, '')), '') IS NOT NULL
      )
    )
  );

COMMENT ON CONSTRAINT shop_orders_lead_or_task_ctx ON public.shop_orders IS
  'CRM lead row, or shop task link, or orphan task-only order with buyer name/phone after task deleted.';
