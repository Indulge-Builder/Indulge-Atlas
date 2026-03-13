-- ============================================================
-- Indulge Global CRM — Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.tasks enable row level security;

-- ── Helper: get current user's role ───────────────────────

create or replace function public.get_my_role()
returns public.user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles ───────────────────────────────────────────────

-- Users can read their own profile; managers/admins can read all
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Users can update their own profile only
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- ── leads ──────────────────────────────────────────────────

-- Agents can only see leads assigned to them
-- Managers and admins see everything
create policy "leads_select" on public.leads
  for select using (
    assigned_agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Agents can only update their own leads
-- Managers and admins can update all leads
create policy "leads_update" on public.leads
  for update using (
    assigned_agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Only service role (webhook) and managers/admins can insert new leads
create policy "leads_insert" on public.leads
  for insert with check (
    public.get_my_role() in ('manager', 'admin')
  );

-- Only admins can delete leads
create policy "leads_delete" on public.leads
  for delete using (
    public.get_my_role() = 'admin'
  );

-- ── lead_activities ────────────────────────────────────────

-- Agents can read activities for their own leads
create policy "activities_select" on public.lead_activities
  for select using (
    agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.assigned_agent_id = auth.uid()
    )
  );

-- Agents can insert activities for their own leads only
create policy "activities_insert" on public.lead_activities
  for insert with check (
    agent_id = auth.uid()
    and (
      public.get_my_role() in ('manager', 'admin')
      or exists (
        select 1 from public.leads l
        where l.id = lead_id
          and l.assigned_agent_id = auth.uid()
      )
    )
  );

-- Activities are immutable (no update or delete by users)

-- ── tasks ──────────────────────────────────────────────────

-- Agents can only see their own tasks
create policy "tasks_select" on public.tasks
  for select using (
    agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Agents can insert tasks for themselves
create policy "tasks_insert" on public.tasks
  for insert with check (
    agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Agents can update (complete) their own tasks
create policy "tasks_update" on public.tasks
  for update using (
    agent_id = auth.uid()
    or public.get_my_role() in ('manager', 'admin')
  );

-- Agents can delete their own tasks; admins can delete all
create policy "tasks_delete" on public.tasks
  for delete using (
    agent_id = auth.uid()
    or public.get_my_role() = 'admin'
  );
