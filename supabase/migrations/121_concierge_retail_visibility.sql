-- 121_concierge_retail_visibility.sql
-- Retail cross-visibility (build spec, "Retail" section): a ticket in a Retail
-- category is ALSO visible to the Retail team, across every Queendom, on top of the
-- normal Queendom scoping. Read-only oversight — it does NOT grant edit/assign/move.
--
-- [ASSUMPTION — review before applying] "Retail team" = profiles.department = 'shop'
-- (Indulge Shop). There is no dedicated 'retail' department in the enum; Shop is the
-- retail/goods team. If your Retail team maps elsewhere, change the two
-- `get_user_department() = 'shop'` checks below before applying.
--
-- Retail categories are marked by ticket_categories.is_retail (admin-toggleable from
-- Ticket Settings). Backfilled here for the seeded top-level "Retail" category + its
-- subcategories so it works out of the box.
--
-- This adds the retail branch to BOTH gates that govern ticket reads:
--   1. the inline concierge_tickets SELECT policy (the ticket list), and
--   2. can_view_concierge_ticket() (the timeline/attachments/checklist reads).
-- Both are reproduced verbatim from migration 117 with the retail branch OR-ed on.

-- ── is_retail flag on categories ─────────────────────────────────────────────────

ALTER TABLE public.ticket_categories
  ADD COLUMN IF NOT EXISTS is_retail boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ticket_categories.is_retail IS
  'When true, tickets in this category (or its subcategories) are visible to the Retail/Shop team across all Queendoms.';

-- Backfill the seeded "Retail" top-level category and everything under it.
UPDATE public.ticket_categories c
SET is_retail = true
WHERE lower(c.name) = 'retail'
   OR c.parent_id IN (SELECT id FROM public.ticket_categories WHERE lower(name) = 'retail');

-- ── can_view helper (governs updates/attachments/checklist reads) ────────────────

CREATE OR REPLACE FUNCTION public.can_view_concierge_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.concierge_tickets t
    WHERE t.id = p_ticket_id
      AND (
        public.get_user_role() IN ('admin','founder','super_admin')
        OR public.get_user_department() = 'finance'
        OR (
          public.get_user_department() = 'concierge'
          AND (
            t.org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
            OR public.user_in_concierge_group(t.org_group)
          )
        )
        -- Retail cross-visibility (spec): Shop/Retail team sees retail-category tickets.
        OR (
          public.get_user_department() = 'shop'
          AND EXISTS (
            SELECT 1 FROM public.ticket_categories c
            WHERE c.id IN (t.category_id, t.subcategory_id)
              AND (
                c.is_retail
                OR EXISTS (SELECT 1 FROM public.ticket_categories pc WHERE pc.id = c.parent_id AND pc.is_retail)
              )
          )
        )
      )
  );
$function$;

-- ── inline concierge_tickets SELECT policy (the ticket list) ─────────────────────

DROP POLICY IF EXISTS "concierge_tickets_select" ON public.concierge_tickets;
CREATE POLICY "concierge_tickets_select"
  ON public.concierge_tickets FOR SELECT TO authenticated
  USING (
    public.get_user_role() IN ('admin','founder','super_admin')
    OR public.get_user_department() = 'finance'
    OR (
      public.get_user_department() = 'concierge'
      AND (
        org_group::text = (SELECT p.concierge_group::text FROM public.profiles p WHERE p.id = auth.uid())
        OR public.user_in_concierge_group(org_group)
      )
    )
    -- Retail cross-visibility (spec): Shop/Retail team sees retail-category tickets
    -- across every Queendom. Read-only — edit/insert/update policies are unchanged.
    OR (
      public.get_user_department() = 'shop'
      AND EXISTS (
        SELECT 1 FROM public.ticket_categories c
        WHERE c.id IN (category_id, subcategory_id)
          AND (
            c.is_retail
            OR EXISTS (SELECT 1 FROM public.ticket_categories pc WHERE pc.id = c.parent_id AND pc.is_retail)
          )
      )
    )
  );
