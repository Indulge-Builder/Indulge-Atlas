-- Migration 111: schedule the hourly concierge SLA overdue sweep.
--
-- Mirrors migration 098 (pg_cron -> pg_net.http_post -> protected Next.js route).
-- The sweep route is POST /api/cron/concierge-sla-sweep, authed with a Bearer
-- token equal to process.env.CRON_SECRET.
--
-- Requires two vault secrets to be set ONCE, out of band (values not in source):
--   select vault.create_secret('https://YOUR-APP-DOMAIN', 'app_base_url');
--   select vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret');
-- If either secret is missing this migration skips scheduling (no broken job is
-- created) and raises a NOTICE — set the secrets and re-run this block.
--
-- Alternative (if the app is Vercel-hosted): skip this migration and add a Vercel
-- cron in vercel.json — see the route file header. Do not use both.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text;
  secret   text;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1;
  SELECT decrypted_secret INTO secret   FROM vault.decrypted_secrets WHERE name = 'cron_secret'   LIMIT 1;

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'concierge-sla-sweep NOT scheduled: set vault secrets app_base_url + cron_secret, then re-run this block.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'concierge-sla-sweep') THEN
    PERFORM cron.unschedule('concierge-sla-sweep');
  END IF;

  PERFORM cron.schedule(
    'concierge-sla-sweep',
    '0 * * * *',  -- hourly
    format(
      $job$ SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L),
        body := '{}'::jsonb
      ); $job$,
      base_url || '/api/cron/concierge-sla-sweep',
      secret
    )
  );
END $$;
