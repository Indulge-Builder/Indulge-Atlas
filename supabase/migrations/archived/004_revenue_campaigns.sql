-- ============================================================
-- Indulge Global CRM — Revenue & Campaign Metrics Migration
-- ============================================================

-- ── Ad platform enum ────────────────────────────────────────
create type public.ad_platform as enum ('meta', 'google');

-- ── leads: add revenue & campaign tracking columns ──────────
alter table public.leads
  add column if not exists deal_value  numeric(12, 2),
  add column if not exists campaign_id text;

create index if not exists leads_campaign_id_idx on public.leads(campaign_id);

-- ── campaign_metrics ────────────────────────────────────────
-- Stores cached/synced data from Meta and Google Ads APIs.
-- Upserted on every sync — not an append-only table.

create table public.campaign_metrics (
  id              uuid primary key default gen_random_uuid(),
  platform        public.ad_platform not null,
  campaign_id     text not null,
  campaign_name   text not null,
  amount_spent    numeric(12, 2) not null default 0,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  -- One record per platform + campaign combination
  unique (platform, campaign_id)
);

create index campaign_metrics_platform_idx on public.campaign_metrics(platform);
create index campaign_metrics_last_synced_idx on public.campaign_metrics(last_synced_at desc);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.campaign_metrics enable row level security;

-- Managers and admins can read campaign data
create policy "managers_read_campaign_metrics"
  on public.campaign_metrics for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('manager', 'admin')
    )
  );

-- Only admins can directly modify campaign data;
-- syncing is done via service role in server actions
create policy "admins_manage_campaign_metrics"
  on public.campaign_metrics for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );
