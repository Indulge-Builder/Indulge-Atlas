import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

// ── Supabase admin client ──────────────────────────────────
// Uses the service role key so RLS is bypassed entirely.
// We instantiate it once at module scope — the client is stateless
// and safe to share across requests in a serverless environment.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      // Disable auto-refresh: this client never acts on behalf of a user.
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ── Zod payload schema ─────────────────────────────────────
// Mirrors the normalised output produced by Pabbly Connect.
// phone_number is the only truly required contact field;
// everything else degrades gracefully.
const pabblyPayloadSchema = z.object({
  first_name:   z.string().min(1, "first_name is required"),
  last_name:    z.string().optional(),
  email:        z.string().email("Invalid email").optional().or(z.literal("")),
  phone_number: z.string().min(4, "phone_number is required"),
  utm_source:   z.string().optional(),
  utm_medium:   z.string().optional(),
  utm_campaign: z.string().optional(),
  campaign_id:  z.string().optional(),
  source:       z.string().optional(), // legacy: map to utm_source if utm_source absent
}).passthrough();

type PabblyPayload = z.infer<typeof pabblyPayloadSchema>;

// ── Timing-safe secret comparison ─────────────────────────
// Prevents timing-based attacks where an attacker probes
// character-by-character response-time differences.
function secretsMatch(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    // timingSafeEqual requires identical byte lengths.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Round-robin assignment (recency-based) ─────────────────
// Returns the UUID of the active agent who received a lead
// least recently.  Agents who have never been assigned a
// lead are always prioritised first (treated as having a
// last-assigned date of Unix epoch 0).
//
// Implementation uses exactly two DB queries:
//   1. Fetch all active agent IDs from `profiles`.
//   2. Fetch the single most-recent lead per agent in one pass.
// No N+1 queries. O(n) in-process sort.
async function pickNextAgent(): Promise<string | null> {
  // ── 1. Fetch active agents ─────────────────────────────
  const { data: agents, error: agentsErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "agent")
    .eq("is_active", true);

  if (agentsErr) {
    console.error("[webhook/lead] Agents query failed:", agentsErr.message);
    return null;
  }

  if (!agents || agents.length === 0) {
    console.warn("[webhook/lead] No active agents found — lead will be unassigned.");
    return null;
  }

  const agentIds: string[] = agents.map((a) => a.id);

  // ── 2. Most-recent lead per agent ─────────────────────
  // We fetch leads for only these agents, ordered newest-first.
  // A single forward scan lets us record the first (= most recent)
  // lead per agent without a GROUP BY / window function.
  const { data: recentLeads, error: leadsErr } = await supabase
    .from("leads")
    .select("assigned_to, created_at")
    .in("assigned_to", agentIds)
    .order("created_at", { ascending: false })
    .limit(agentIds.length * 10);

  if (leadsErr) {
    console.error("[webhook/lead] Recent-leads query failed:", leadsErr.message);
    return agentIds[0];
  }

  const latestAt = new Map<string, number>();
  for (const row of recentLeads ?? []) {
    if (row.assigned_to && !latestAt.has(row.assigned_to)) {
      latestAt.set(row.assigned_to, new Date(row.created_at).getTime());
    }
  }

  // ── 3. Sort: agents with no leads first (epoch = 0),
  //           then by oldest most-recent-lead ascending.
  const sorted = [...agentIds].sort((a, b) => {
    const aTime = latestAt.get(a) ?? 0; // 0 = epoch = highest priority
    const bTime = latestAt.get(b) ?? 0;
    return aTime - bTime;
  });

  return sorted[0];
}

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/lead
//
// Pabbly Connect calls this endpoint after normalising raw form
// submissions from Meta Ads, Google Ads, website forms, etc.
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Step 1: Authenticate ───────────────────────────────
  const incomingSecret = request.headers.get("x-indulge-webhook-secret");
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (!incomingSecret || !expectedSecret || !secretsMatch(incomingSecret, expectedSecret)) {
    console.warn("[webhook/lead] Rejected: invalid or missing secret.");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ── Step 2: Parse JSON body ────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // ── Step 3: Validate with Zod ──────────────────────────
  const parsed = pabblyPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    console.warn("[webhook/lead] Validation failed:", issues);
    return NextResponse.json(
      { error: "Payload validation failed.", issues },
      { status: 422 }
    );
  }

  const payload: PabblyPayload = parsed.data;

  // Compose full_name from Pabbly's split first/last fields.
  const fullName = [payload.first_name.trim(), payload.last_name?.trim()]
    .filter(Boolean)
    .join(" ");

  // ── Step 4: Round-robin agent assignment ───────────────
  const assignedAgentId = await pickNextAgent();

  // Map legacy "source" to utm_source when utm_source is absent
  const utmSource = payload.utm_source?.trim() ?? payload.source?.trim() ?? null;
  const utmCampaign = payload.utm_campaign?.trim() ?? payload.campaign_id?.trim() ?? null;

  // ── Step 5: Insert lead ────────────────────────────────
  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      first_name:   payload.first_name.trim(),
      last_name:    payload.last_name?.trim() || null,
      phone_number: payload.phone_number.trim(),
      email:        payload.email?.trim() || null,
      utm_source:   utmSource,
      utm_medium:   payload.utm_medium?.trim() ?? null,
      utm_campaign: utmCampaign,
      campaign_id:  payload.campaign_id?.trim() ?? null,
      status:       "new",
      assigned_to:  assignedAgentId,
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    // 500 tells Pabbly to queue this task for an automatic retry.
    console.error("[webhook/lead] Lead insertion failed:", insertError?.message);
    return NextResponse.json(
      { error: "Lead could not be saved. Retry queued." },
      { status: 500 }
    );
  }

  // ── Step 6: Immutable audit entry ──────────────────────
  // Write only when an agent is available — lead_activities.agent_id
  // is NOT NULL in the schema, so we skip if unassigned.
  if (assignedAgentId) {
    const { error: activityErr } = await supabase
      .from("lead_activities")
      .insert({
        lead_id:  lead.id,
        performed_by: assignedAgentId,
        type:         "status_change",
        payload: {
          from:      null,
          to:        "new",
          note:      `Lead ingested via Pabbly (utm: ${utmSource ?? "none"}). Assigned via recency-based round-robin.`,
          utm_source: utmSource,
          timestamp: new Date().toISOString(),
        },
      });

    if (activityErr) {
      // Non-fatal — the lead is already committed; just log the gap.
      console.error("[webhook/lead] Activity log failed:", activityErr.message);
    }
  }

  // ── Step 7: Respond 200 ────────────────────────────────
  // Pabbly marks a task as successful only on a 2xx response.
  // We return 200 (not 201) to satisfy its success-detection logic.
  console.info(
    `[webhook/lead] Lead ${lead.id} created. Assigned to agent: ${assignedAgentId ?? "unassigned"}`
  );

  return NextResponse.json(
    {
      success:            true,
      lead_id:            lead.id,
      assigned_to: assignedAgentId ?? null,
    },
    { status: 200 }
  );
}

// ── Health check ───────────────────────────────────────────
// Pabbly and monitoring tools can hit GET to verify the endpoint
// is reachable before wiring up the full workflow.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
