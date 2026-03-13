-- ============================================================
-- Indulge Global CRM — Campaign Drafts (Ad Planner)
-- ============================================================

-- ── Draft status enum ────────────────────────────────────────
create type public.draft_status as enum ('draft', 'approved', 'deployed');

-- ── campaign_drafts ──────────────────────────────────────────
-- Stores campaign plans created in the Ad Planner Studio.
-- Scouts can save, iterate, and promote drafts to "approved"
-- before handing off to the deployment team.

create table public.campaign_drafts (
  id                uuid          primary key default gen_random_uuid(),
  campaign_name     text          not null,
  platform          public.ad_platform not null,
  objective         text,
  total_budget      numeric(14, 2) not null default 0,
  target_cpa        numeric(14, 2) not null default 0,
  projected_revenue numeric(14, 2) not null default 0,
  status            public.draft_status not null default 'draft',
  created_by        uuid          not null references public.profiles(id) on delete cascade,
  created_at        timestamptz   not null default now()
);

-- Indexes for common query patterns
create index campaign_drafts_created_by_idx on public.campaign_drafts(created_by);
create index campaign_drafts_status_idx     on public.campaign_drafts(status);
create index campaign_drafts_created_at_idx on public.campaign_drafts(created_at desc);

-- ── Row Level Security ───────────────────────────────────────
alter table public.campaign_drafts enable row level security;

-- Scouts (managers) and admins can read all drafts
create policy "scouts_read_campaign_drafts"
  on public.campaign_drafts for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('manager', 'admin')
    )
  );

-- Scouts and admins can insert their own drafts
create policy "scouts_insert_campaign_drafts"
  on public.campaign_drafts for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('manager', 'admin')
    )
  );

-- Scouts can update their own drafts; admins can update any
create policy "scouts_update_own_drafts"
  on public.campaign_drafts for update
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );

-- Only the owner or admin may delete a draft
create policy "scouts_delete_own_drafts"
  on public.campaign_drafts for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );
