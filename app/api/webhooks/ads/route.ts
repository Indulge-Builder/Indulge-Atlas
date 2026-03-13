import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

// ── Supabase admin client ──────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Timing-safe auth ───────────────────────────────────────────────────────────
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
// Pabbly sends an array of campaign objects, one per active campaign.
// Each object maps 1:1 to a row in campaign_metrics (upserted on campaign_id+platform).
const campaignSchema = z.object({
  campaign_id:   z.string().min(1, "campaign_id is required"),
  campaign_name: z.string().min(1, "campaign_name is required"),
  platform: z.enum(["meta", "google", "website", "events", "referral"], {
    message: "platform must be: meta | google | website | events | referral",
  }),
  impressions:  z.coerce.number().int().min(0).default(0),
  clicks:       z.coerce.number().int().min(0).default(0),
  spend:        z.coerce.number().min(0).default(0),   // renamed to amount_spent in DB
  cpc:          z.coerce.number().min(0).default(0),
});

// Accept either a single object or an array from Pabbly
const adsPayloadSchema = z.union([
  z.array(campaignSchema).min(1, "Payload must contain at least one campaign."),
  campaignSchema.transform((c) => [c]),
]);

type CampaignRow = z.infer<typeof campaignSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/ads
//
// Pabbly Connect calls this on a scheduled hourly push, pulling fresh
// numbers from Meta / Google Ads APIs and forwarding them here.
//
// Strategy: UPSERT on (platform, campaign_id).
//   • New campaign  → INSERT
//   • Known campaign → UPDATE live metrics in-place
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── Step 1: Authenticate ────────────────────────────────────────────────────
  const authHeader  = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const expectedSecret = process.env.PABBLY_WEBHOOK_SECRET;

  if (!bearerToken || !expectedSecret || !secretsMatch(bearerToken, expectedSecret)) {
    console.warn("[webhooks/ads] Rejected: missing or invalid Bearer token.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Step 2: Parse JSON ──────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // ── Step 3: Validate ────────────────────────────────────────────────────────
  const parsed = adsPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    console.warn("[webhooks/ads] Validation failed:", issues);
    return NextResponse.json({ error: "Payload validation failed.", issues }, { status: 400 });
  }

  const campaigns: CampaignRow[] = parsed.data;
  console.log(`[webhooks/ads] Syncing ${campaigns.length} campaign(s) from Pabbly.`);

  // ── Step 4: Upsert campaign metrics ─────────────────────────────────────────
  // onConflict targets the UNIQUE(platform, campaign_id) constraint.
  // All metric columns are overwritten with fresh values on each sync.
  const rows = campaigns.map((c) => ({
    campaign_id:   c.campaign_id,
    campaign_name: c.campaign_name,
    platform:      c.platform,
    impressions:   c.impressions,
    clicks:        c.clicks,
    amount_spent:  c.spend,
    cpc:           c.cpc,
    last_synced_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("campaign_metrics")
    .upsert(rows, {
      onConflict:        "platform,campaign_id",
      ignoreDuplicates:  false, // always overwrite — we want live numbers
    });

  if (upsertError) {
    console.error("[webhooks/ads] Upsert failed:", upsertError.message);
    return NextResponse.json(
      { error: "Metrics could not be saved. Retry queued." },
      { status: 500 }
    );
  }

  console.info(
    `[webhooks/ads] Synced ${rows.length} campaign(s): ${rows.map((r) => r.campaign_id).join(", ")}`
  );

  return NextResponse.json(
    {
      success:  true,
      synced:   rows.length,
      campaigns: rows.map((r) => ({ campaign_id: r.campaign_id, platform: r.platform })),
    },
    { status: 200 }
  );
}

// ── Health probe ───────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
