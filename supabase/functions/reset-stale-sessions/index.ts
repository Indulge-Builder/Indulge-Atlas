import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // JOB 1: Full reset for handed_off sessions idle > 24h
  const { data: fullResets, error: err1 } = await supabase
    .from('bot_sessions')
    .update({
      state: 'greeting',
      bot_turn_count: 0,
      context_jsonb: {},
    })
    .eq('state', 'handed_off')
    .lt('last_message_at', cutoff)
    .select('phone')

  if (err1) {
    console.error('[reset-stale-sessions] job1 failed:', err1.message)
  } else {
    console.log('[reset-stale-sessions] job1 full resets:', fullResets?.length ?? 0)
  }

  // JOB 2: Turn count reset only for active sessions idle > 24h
  // context_jsonb is intentionally preserved — customer feels remembered
  const { data: turnResets, error: err2 } = await supabase
    .from('bot_sessions')
    .update({
      bot_turn_count: 0,
    })
    .neq('state', 'handed_off')
    .neq('state', 'greeting')
    .lt('last_message_at', cutoff)
    .select('phone')

  if (err2) {
    console.error('[reset-stale-sessions] job2 failed:', err2.message)
  } else {
    console.log('[reset-stale-sessions] job2 turn resets:', turnResets?.length ?? 0)
  }

  const summary = {
    full_resets: fullResets?.length ?? 0,
    turn_resets: turnResets?.length ?? 0,
    ran_at: now.toISOString(),
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
