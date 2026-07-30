-- 123_concierge_watchers.sql   (apply AFTER 122)
-- Watcher role, part 2. A Watcher gets READ-ONLY visibility of every ticket in the
-- Queendom(s) they watch, across the normal isolation boundary — mirroring the
-- Retail carve-out (migration 121). No edit / create / assign / move / resolve.
--
-- Watched Queendoms live in concierge_watchers. The read branch is OR-ed into BOTH
-- ticket read gates: the inline concierge_tickets SELECT policy AND the
-- can_view_concierge_ticket() helper (which also governs timeline/attachments/
-- checklist reads). Edit/insert/update policies are deliberately left unchanged, so
-- Watchers can look but never touch.

-- ── mapping table (watcher → Queendom) ───────────────────────────────────────
create table if not exists public.concierge_watchers (
  profile_id uuid                   not null references public.profiles(id) on delete cascade,
  org_group  public.concierge_group not null,
  created_at timestamptz            not null default now(),
  primary key (profile_id, org_group)
);
create index if not exists idx_concierge_watchers_group on public.concierge_watchers (org_group);

alter table public.concierge_watchers enable row level security;

create policy "concierge_watchers_select" on public.concierge_watchers
  for select to authenticated
  using (profile_id = auth.uid() or public.get_user_role() in ('admin','founder','super_admin'));

create policy "concierge_watchers_write" on public.concierge_watchers
  for all to authenticated
  using (public.get_user_role() in ('admin','founder','super_admin'))
  with check (public.get_user_role() in ('admin','founder','super_admin'));

create policy "concierge_watchers_service_role" on public.concierge_watchers
  using (auth.role() = 'service_role');

-- ── membership helper (mirrors user_in_concierge_group) ──────────────────────
create or replace function public.user_watches_group(g public.concierge_group)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.concierge_watchers w
    where w.profile_id = auth.uid() and w.org_group = g
  );
$function$;

-- ── read gate 1: can_view_concierge_ticket (reproduces migration 121 + watcher) ─
create or replace function public.can_view_concierge_ticket(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.concierge_tickets t
    where t.id = p_ticket_id
      and (
        public.get_user_role() in ('admin','founder','super_admin')
        or public.get_user_department() = 'finance'
        or (
          public.get_user_department() = 'concierge'
          and (
            t.org_group::text = (select p.concierge_group::text from public.profiles p where p.id = auth.uid())
            or public.user_in_concierge_group(t.org_group)
          )
        )
        -- Retail cross-visibility (migration 121)
        or (
          public.get_user_department() = 'shop'
          and exists (
            select 1 from public.ticket_categories c
            where c.id in (t.category_id, t.subcategory_id)
              and (
                c.is_retail
                or exists (select 1 from public.ticket_categories pc where pc.id = c.parent_id and pc.is_retail)
              )
          )
        )
        -- Watcher oversight (migration 123): read-only across watched Queendoms.
        or (
          public.get_user_department() = 'watcher'
          and public.user_watches_group(t.org_group)
        )
      )
  );
$function$;

-- ── read gate 2: inline concierge_tickets SELECT policy (121 + watcher) ───────
drop policy if exists "concierge_tickets_select" on public.concierge_tickets;
create policy "concierge_tickets_select"
  on public.concierge_tickets for select to authenticated
  using (
    public.get_user_role() in ('admin','founder','super_admin')
    or public.get_user_department() = 'finance'
    or (
      public.get_user_department() = 'concierge'
      and (
        org_group::text = (select p.concierge_group::text from public.profiles p where p.id = auth.uid())
        or public.user_in_concierge_group(org_group)
      )
    )
    -- Retail cross-visibility (migration 121)
    or (
      public.get_user_department() = 'shop'
      and exists (
        select 1 from public.ticket_categories c
        where c.id in (category_id, subcategory_id)
          and (
            c.is_retail
            or exists (select 1 from public.ticket_categories pc where pc.id = c.parent_id and pc.is_retail)
          )
      )
    )
    -- Watcher oversight (migration 123): read-only across watched Queendoms.
    or (
      public.get_user_department() = 'watcher'
      and public.user_watches_group(org_group)
    )
  );
