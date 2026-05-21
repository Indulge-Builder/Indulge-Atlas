-- Migration 092: Budget tracking tables — transactions and deliverables per domain.
-- Used by /budget page. Visible and editable by all authenticated users with
-- founder / admin / super_admin roles (enforced at application layer + RLS).

-- ── budget_transactions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.budget_transactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text        NOT NULL CHECK (domain IN ('meta', 'elia', 'zoho')),
  date        text        NOT NULL,          -- human-readable e.g. "May 21, 2026"
  item        text        NOT NULL,          -- item name / ad account
  amount      numeric     NOT NULL CHECK (amount > 0),
  currency    text        NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD')),
  paid_by     text        NULL,              -- optional "paid by" field (Meta only)
  created_by  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read
CREATE POLICY "budget_transactions_select"
  ON public.budget_transactions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only privileged roles may insert
CREATE POLICY "budget_transactions_insert"
  ON public.budget_transactions FOR INSERT
  WITH CHECK (
    public.get_user_role() IN ('founder', 'admin', 'super_admin')
  );

-- Only privileged roles may delete
CREATE POLICY "budget_transactions_delete"
  ON public.budget_transactions FOR DELETE
  USING (
    public.get_user_role() IN ('founder', 'admin', 'super_admin')
  );

-- Service role bypass
CREATE POLICY "budget_transactions_service_role"
  ON public.budget_transactions
  USING (auth.role() = 'service_role');

-- ── budget_deliverables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.budget_deliverables (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text        NOT NULL CHECK (domain IN ('meta', 'elia', 'zoho')),
  text        text        NOT NULL,
  done        boolean     NOT NULL DEFAULT false,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_deliverables_select"
  ON public.budget_deliverables FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "budget_deliverables_insert"
  ON public.budget_deliverables FOR INSERT
  WITH CHECK (
    public.get_user_role() IN ('founder', 'admin', 'super_admin')
  );

CREATE POLICY "budget_deliverables_update"
  ON public.budget_deliverables FOR UPDATE
  USING (
    public.get_user_role() IN ('founder', 'admin', 'super_admin')
  );

CREATE POLICY "budget_deliverables_delete"
  ON public.budget_deliverables FOR DELETE
  USING (
    public.get_user_role() IN ('founder', 'admin', 'super_admin')
  );

CREATE POLICY "budget_deliverables_service_role"
  ON public.budget_deliverables
  USING (auth.role() = 'service_role');

-- ── updated_at trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER budget_deliverables_updated_at
  BEFORE UPDATE ON public.budget_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_budget_transactions_domain
  ON public.budget_transactions (domain);

CREATE INDEX IF NOT EXISTS idx_budget_deliverables_domain
  ON public.budget_deliverables (domain, sort_order);

-- ── seed: existing transactions from Payments.xlsx ────────────────────────────
-- These are inserted once; subsequent additions go through the UI.
-- created_by is left as a placeholder UUID that will be overwritten by the app
-- or you can run this after seeding your founder user ID.

-- NOTE: Replace '00000000-0000-0000-0000-000000000000' with the actual founder
-- profile UUID before running, or omit the seed and add via the UI.

DO $$
DECLARE
  founder_id uuid;
BEGIN
  SELECT id INTO founder_id FROM public.profiles WHERE role = 'founder' LIMIT 1;
  IF founder_id IS NULL THEN RETURN; END IF;

  -- Meta transactions
  INSERT INTO public.budget_transactions (domain, date, item, amount, currency, paid_by, created_by) VALUES
    ('meta', 'May 1',  'Global', 90000,    'INR', 'Smruti',              founder_id),
    ('meta', 'May 2',  'Dubai',  6072.28,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 4',  'Dubai',  6072.28,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 5',  'Global', 90000,    'INR', 'Smruti',              founder_id),
    ('meta', 'May 5',  'Dubai',  6072.28,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 7',  'Global', 90000,    'INR', 'Smruti-Arfam',        founder_id),
    ('meta', 'May 7',  'GMR',    9549.16,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 7',  'Dubai',  6072.28,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 8',  'Dubai',  6072.28,  'INR', 'Andreas',             founder_id),
    ('meta', 'May 11', 'Global', 90000,    'INR', 'Mastercard',          founder_id),
    ('meta', 'May 13', 'GMR',    50000,    'INR', 'UPI - Advita/Vishal', founder_id),
    ('meta', 'May 13', 'Dubai',  40000,    'INR', 'UPI - Advita/Vishal', founder_id),
    ('meta', 'May 16', 'Global', 40000,    'INR', 'Topup - Vishal',      founder_id),
    ('meta', 'May 16', 'Global', 50000,    'INR', 'Topup - Vishal',      founder_id),
    ('meta', 'May 18', 'Global', 90000,    'INR', 'Mastercard',          founder_id);

  -- Elia transactions
  INSERT INTO public.budget_transactions (domain, date, item, amount, currency, created_by) VALUES
    ('elia', 'May 18, 2026', 'AI Model API', 59,  'USD', founder_id),
    ('elia', 'May 11, 2026', 'Claude',       200, 'USD', founder_id),
    ('elia', 'Apr 22, 2026', 'Cursor',       60,  'USD', founder_id),
    ('elia', 'Mar 19, 2026', 'Supabase',     25,  'USD', founder_id),
    ('elia', 'Apr 20, 2026', 'Supabase',     25,  'USD', founder_id);

  -- Zoho transactions
  INSERT INTO public.budget_transactions (domain, date, item, amount, currency, created_by) VALUES
    ('zoho', 'Mar 7, 2026',  'Pabbly',         18607.42, 'INR', founder_id),
    ('zoho', 'Feb 18, 2026', 'Zoho User 1',    3540,     'INR', founder_id),
    ('zoho', 'Mar 22, 2026', 'Zoho Plan',      10620,    'INR', founder_id),
    ('zoho', 'Mar 26, 2026', 'Zoho Seat',      2626.46,  'INR', founder_id),
    ('zoho', 'Feb 23, 2026', 'Zoho Seat',      5815.71,  'INR', founder_id),
    ('zoho', 'Mar 25, 2026', 'Zoho Seat',      8221.93,  'INR', founder_id),
    ('zoho', 'Apr 4, 2026',  'Zoho Seat',      3197.42,  'INR', founder_id),
    ('zoho', 'Apr 2, 2026',  'WhatsApp Credit', 1020.94, 'INR', founder_id);

  -- Meta deliverables
  INSERT INTO public.budget_deliverables (domain, text, done, sort_order, created_by) VALUES
    ('meta', 'Total 3 Conversions till now', true, 1, founder_id);

  -- Elia deliverables
  INSERT INTO public.budget_deliverables (domain, text, done, sort_order, created_by) VALUES
    ('elia', 'Supabase production database provisioned',     true,  1, founder_id),
    ('elia', 'Claude API integrated for Elia AI engine',    true,  2, founder_id),
    ('elia', 'Cursor IDE licences activated for dev team',  true,  3, founder_id),
    ('elia', 'AI Model API live for client profile analysis', true, 4, founder_id),
    ('elia', 'Elia WhatsApp profile integration (Chetto)',  true,  5, founder_id),
    ('elia', 'Freshdesk integration',                       true,  6, founder_id),
    ('elia', 'Expand Elia with streaming + RAG features',   false, 7, founder_id),
    ('elia', 'Integrate Elia with Typeform',                false, 8, founder_id);

  -- Zoho deliverables
  INSERT INTO public.budget_deliverables (domain, text, done, sort_order, created_by) VALUES
    ('zoho', 'Zoho CRM plan activated',                              true,  1, founder_id),
    ('zoho', 'Pabbly, Meta leads, WhatsApp business credit loaded',  false, 2, founder_id),
    ('zoho', 'All agent seats assigned and onboarded',              false, 3, founder_id),
    ('zoho', 'Features built, workflow set, Journey designed',       false, 4, founder_id);

END $$;
