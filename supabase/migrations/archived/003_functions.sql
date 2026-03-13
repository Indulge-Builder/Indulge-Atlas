-- ============================================================
-- Indulge Global CRM — Postgres Functions
-- ============================================================

-- ── Round-Robin Agent Assignment ──────────────────────────
-- Assigns the next available active agent with the fewest
-- currently active (non-terminal) leads. Falls back to the
-- agent who has been waiting the longest if counts are tied.

create or replace function public.assign_next_agent()
returns uuid language sql security definer stable as $$
  select p.id
  from public.profiles p
  left join (
    select
      assigned_agent_id,
      count(*) as active_lead_count
    from public.leads
    where status not in ('WON', 'LOST', 'JUNK')
    group by assigned_agent_id
  ) lc on lc.assigned_agent_id = p.id
  where p.role = 'agent'
    and p.is_active = true
  order by
    coalesce(lc.active_lead_count, 0) asc,
    p.created_at asc
  limit 1;
$$;

-- ── Lead Statistics for Dashboard ─────────────────────────
-- Returns aggregated lead counts per status for a given agent

create or replace function public.get_agent_lead_stats(agent_uuid uuid)
returns table (
  status public.lead_status,
  count  bigint
) language sql security definer stable as $$
  select status, count(*) as count
  from public.leads
  where assigned_agent_id = agent_uuid
  group by status;
$$;

-- ── Upcoming Tasks Count ───────────────────────────────────

create or replace function public.get_agent_upcoming_tasks(agent_uuid uuid)
returns bigint language sql security definer stable as $$
  select count(*)
  from public.tasks
  where agent_id = agent_uuid
    and is_completed = false
    and due_at >= now();
$$;
