import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

// ── Supabase admin client ──────────────────────────────────────────────────────
// Service role key bypasses RLS — this is intentional for server-to-server intake.
// The client is instantiated once at module scope; it is stateless and safe to
// share across concurrent serverless invocations.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Timing-safe secret comparison ─────────────────────────────────────────────
// Prevents timing-oracle attacks where response latency leaks secret length/chars.
function secretsMatch(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Zod payload schema ─────────────────────────────────────────────────────────
// Forgiving schema designed for messy web-form payloads piped through Pabbly.
// Only first_name and domain are hard requirements — everything else collapses
// empty strings / undefined / null to null so the DB stays clean.
//
// .passthrough() is critical: unknown keys sent by Pabbly (e.g. `channel`,
// custom Meta Lead Ad questions, chatbot answers) are preserved on parsed.data
// so we can safely funnel them into the `form_responses` JSONB column below
// rather than letting Supabase reject the whole row.
const emptyStringToNull = z
  .string()
  .trim()
  .transform((val) => (val === "" ? null : val))
  .nullable()
  .optional();

const leadPayloadSchema = z
  .object({
    // ── Hard requirements ────────────────────────────────────────────────────
    first_name: z.string().min(1, "first_name is required"),
    domain: z.string().default("indulge_global"),

    // ── Known DB columns — empty string collapses to null ───────────────────
    last_name: emptyStringToNull,
    phone_number: z.coerce
      .string()
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    city: emptyStringToNull,
    address: emptyStringToNull,
    secondary_phone: emptyStringToNull,

    // ── Status ───────────────────────────────────────────────────────────────
    status: z.string().default("new"),

    // ── UTM attribution — empty strings fall back to 'organic' ──────────────
    utm_source: z
      .string()
      .trim()
      .transform((val) => (val === "" ? "organic" : val))
      .nullable()
      .optional()
      .default("organic"),
    utm_medium: z
      .string()
      .trim()
      .transform((val) => (val === "" ? "organic" : val))
      .nullable()
      .optional()
      .default("organic"),
    utm_campaign: z
      .string()
      .trim()
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),

    // ── Dynamic / non-column fields — validated here, stored in form_responses
    // `channel`, `message`, `form_responses`, and any other keys Pabbly sends
    // that are NOT explicit DB columns are destructured into `dynamicRest`
    // below and packed into the `form_responses` JSONB column.
    channel: emptyStringToNull,
    message: emptyStringToNull,
    form_responses: z.record(z.string(), z.any()).nullable().optional(),
  })
  .passthrough(); // Preserve any extra keys not listed above

// Widen the inferred type so TypeScript permits the `...dynamicRest` spread
type LeadPayload = z.infer<typeof leadPayloadSchema> & Record<string, unknown>;

// ── Capped Round-Robin agent assignment ────────────────────────────────────────
// Uses optimized Supabase RPC: picks agent with lowest active 'new' lead count.
// Samson Exception: samson@indulge.global is excluded when they have >= 15 new leads.
async function pickNextAgent(): Promise<string | null> {
  const { data, error } = await supabase.rpc("pick_next_agent_capped");

  if (error) {
    console.error("[webhooks/leads] pick_next_agent_capped RPC failed:", error.message);
    return null;
  }

  return data as string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/leads
//
// Pabbly Connect calls this after capturing a lead from Meta / Google forms.
// Accepts UTM parameters for closed-loop attribution to campaign_metrics.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Step 1: Authenticate via Bearer token ──────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const expectedSecret = process.env.PABBLY_WEBHOOK_SECRET;

  if (
    !bearerToken ||
    !expectedSecret ||
    !secretsMatch(bearerToken, expectedSecret)
  ) {
    console.warn("[webhooks/leads] Rejected: missing or invalid Bearer token.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 2: Parse JSON body ─────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // ── Step 3: Validate with Zod ───────────────────────────────────────────────
  const parsed = leadPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.error(
      "[webhooks/leads] Zod Validation Failed:",
      parsed.error.format(),
    );
    return NextResponse.json(
      { error: "Payload validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const payload = parsed.data as LeadPayload;

  // ── Step 4: Round-robin agent assignment ────────────────────────────────────
  const assignedAgentId = await pickNextAgent();

  // ── Step 5: Sanitize payload — only known DB columns go into dbPayload ─────
  // Destructure every column that exists in the `leads` table as a first-class
  // field. Everything else (channel, message, form_responses, random Meta Lead
  // Ad questions, WA chatbot answers, etc.) lands in `dynamicRest` and is
  // stored as-is in the `form_responses` JSONB column so zero data is lost.
  const {
    first_name,
    last_name,
    phone_number,
    email,
    city,
    address,
    secondary_phone,
    domain,
    status,
    utm_source,
    utm_medium,
    utm_campaign,
    // Non-column fields captured for form_responses / source derivation:
    channel,
    message,
    form_responses,
    ...extraFields // any remaining passthrough keys from Pabbly
  } = payload;

  // Merge all non-column data into a single JSONB object.
  // Omit null/undefined values to keep the stored JSON tidy.
  const dynamicRest: Record<string, unknown> = {
    ...(channel != null ? { channel } : {}),
    ...(message != null ? { message } : {}),
    ...(form_responses != null ? { form_responses } : {}),
    ...extraFields,
  };

  const dbPayload = {
    first_name,
    last_name: last_name ?? null,
    phone_number: phone_number ?? null,
    email: email ?? null,
    city: city ?? null,
    address: address ?? null,
    secondary_phone: secondary_phone ?? null,
    domain,
    status: "new" as const,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
    // `source` is the human-readable acquisition channel stored as plain text
    source: (channel as string | null | undefined) ?? utm_source ?? null,
    // All dynamic / non-column fields packed into JSONB — never lost
    form_responses: Object.keys(dynamicRest).length > 0 ? dynamicRest : null,
    assigned_to: assignedAgentId,
    assigned_at: assignedAgentId ? new Date().toISOString() : null,
  };

  console.log("[webhooks/leads] Payload sanitized. Campaign:", dbPayload.utm_campaign ?? "organic", "| Assigned to:", assignedAgentId ?? "unassigned");

  // ── Step 6: Insert lead ─────────────────────────────────────────────────────
  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert([dbPayload])
    .select("id")
    .single();

  if (insertError || !lead) {
    // 500 signals Pabbly to auto-retry the task
    console.error(
      "[webhooks/leads] Lead insertion failed:",
      insertError?.message,
    );
    return NextResponse.json(
      { error: "Lead could not be saved. Retry queued." },
      { status: 500 },
    );
  }

  // ── Step 7: Audit entry (skipped if no agent assigned — FK is NOT NULL) ────
  if (assignedAgentId) {
    const { error: activityErr } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: lead.id,
        performed_by: assignedAgentId,
        type: "status_change",
        payload: {
          from: null,
          to: "new",
          note: `Lead ingested via Pabbly. UTM campaign: ${utm_campaign ?? "none"}. Assigned via round-robin.`,
          timestamp: new Date().toISOString(),
        },
      });

    if (activityErr) {
      console.error(
        "[webhooks/leads] Activity log failed (non-fatal):",
        activityErr.message,
      );
    }
  }

  // ── Step 8: Respond 200 — Pabbly marks task as successful on any 2xx ───────
  console.info(
    `[webhooks/leads] Lead ${lead.id} created. Agent: ${assignedAgentId ?? "unassigned"}. Campaign: ${utm_campaign ?? "organic"}`,
  );

  return NextResponse.json(
    {
      success: true,
      lead_id: lead.id,
      assigned_to: assignedAgentId ?? null,
      utm_campaign: utm_campaign ?? null,
    },
    { status: 200 },
  );
}

// ── Health probe ───────────────────────────────────────────────────────────────
// Pabbly and uptime monitors can hit GET to verify reachability before
// wiring up the full workflow.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
