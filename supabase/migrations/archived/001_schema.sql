-- ============================================================
-- Indulge Global CRM — Schema Migration
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Enums ──────────────────────────────────────────────────

create type public.user_role as enum ('agent', 'manager', 'admin');

create type public.lead_status as enum (
  'NEW',
  'ATTEMPTED',
  'IN_DISCUSSION',
  'WON',
  'LOST',
  'NURTURING',
  'JUNK'
);

create type public.activity_type as enum (
  'status_change',
  'note',
  'call_attempt',
  'task_created'
);

create type public.task_type as enum (
  'retry_call',
  'nurture_followup',
  'send_whatsapp',
  'send_file'
);

-- ── profiles ───────────────────────────────────────────────
-- Extends auth.users with agent-specific data

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        public.user_role not null default 'agent',
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'agent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── leads ──────────────────────────────────────────────────

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  phone             text not null,
  email             text,
  city              text,
  campaign_source   text,
  status            public.lead_status not null default 'NEW',
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_assigned_agent_id_idx on public.leads(assigned_agent_id);
create index leads_status_idx on public.leads(status);
create index leads_created_at_idx on public.leads(created_at desc);

create trigger leads_updated_at
  before update on public.leads
  for each row execute procedure public.handle_updated_at();

-- ── lead_activities ────────────────────────────────────────
-- Immutable audit log of all actions taken on a lead

create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  type        public.activity_type not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index lead_activities_lead_id_idx on public.lead_activities(lead_id);
create index lead_activities_agent_id_idx on public.lead_activities(agent_id);

-- ── tasks ──────────────────────────────────────────────────

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  agent_id      uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  due_at        timestamptz not null,
  type          public.task_type not null default 'retry_call',
  is_completed  boolean not null default false,
  created_at    timestamptz not null default now()
);

create index tasks_agent_id_idx on public.tasks(agent_id);
create index tasks_due_at_idx on public.tasks(due_at asc);
create index tasks_lead_id_idx on public.tasks(lead_id);
