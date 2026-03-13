# Supabase Realtime Setup for Task Reminders

The `TaskReminderProvider` relies on **Supabase Realtime** to receive mid-session task creations (e.g., when a user adds a task via the Calendar). If Realtime is not enabled for the `tasks` table, the code will **fail silently** — no errors, but no live updates.

## How to Enable Realtime for the `tasks` Table

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project.
3. Go to **Database** → **Replication** (or **Realtime** in older dashboards).
4. Find the `public.tasks` table in the list.
5. Toggle **Realtime** ON for the `tasks` table.
6. Ensure the table is included in the `supabase_realtime` publication.

## Verification

- After enabling, create a new task while the dashboard is open.
- In the browser console, you should see: `[Task Engine] Realtime Payload Received: {...}`
- If you see nothing, Realtime is likely not enabled or the publication does not include `tasks`.

## Troubleshooting

- **No payloads:** Check that `tasks` is in the Realtime publication.
- **RLS blocking:** Realtime respects Row Level Security. Ensure the authenticated user can `SELECT` the rows they're subscribed to (filter: `assigned_to=eq.${user.id}`).
- **Connection issues:** Check the browser Network tab for WebSocket connections to your Supabase project URL.
