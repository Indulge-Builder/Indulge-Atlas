-- Enable pg_cron and pg_net if not already enabled
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove existing job if re-running migration
select cron.unschedule('reset-stale-bot-sessions')
where exists (
  select 1 from cron.job
  where jobname = 'reset-stale-bot-sessions'
);

-- Schedule every hour at minute 0
select cron.schedule(
  'reset-stale-bot-sessions',
  '0 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'supabase_url'
    ) || '/functions/v1/reset-stale-sessions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_secret'
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Store secrets in vault so pg_cron can access them.
-- Run this manually in the Supabase SQL Editor with real values,
-- or set via Supabase dashboard → Settings → Vault.
-- DO NOT hardcode real values here.

-- insert into vault.secrets (name, secret)
-- values ('supabase_url', 'https://YOUR_PROJECT.supabase.co')
-- on conflict (name) do update set secret = excluded.secret;

-- insert into vault.secrets (name, secret)
-- values ('cron_secret', 'YOUR_CRON_SECRET_VALUE')
-- on conflict (name) do update set secret = excluded.secret;
