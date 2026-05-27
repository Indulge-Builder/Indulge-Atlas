import { NextRequest, NextResponse, after } from "next/server";
import { verifyBearerSecret } from "@/lib/utils/webhook";
import { checkWebhookRateLimit } from "@/lib/utils/rateLimit";
import { processAndInsertLead } from "@/lib/services/leadIngestion";
import { enqueueWebhookLog } from "@/lib/services/webhookLog";
import { normalizeMeta, normalizeGoogle, normalizeWebsite } from "@/lib/leads/adapters";
import { sendLeadAssignmentNotification } from "@/lib/services/gupshupClient";

type LeadSource = "meta" | "google" | "website";

const ADAPTERS = {
  meta: normalizeMeta,
  google: normalizeGoogle,
  website: normalizeWebsite,
} as const;

/**
 * POST /api/webhooks/leads?source=meta|google|website
 *
 * Single entry point for all Pabbly → Atlas lead ingestion.
 *
 * Pabbly setup: use the field mapper in Pabbly to send a clean flat JSON with
 * named keys (first_name, phone_number, campaign_name, etc.) so no array
 * parsing is needed on this side. See lib/leads/adapters.ts for expected keys.
 *
 * Auth: Authorization: Bearer <PABBLY_WEBHOOK_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await checkWebhookRateLimit(request);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authError = verifyBearerSecret(request, "PABBLY_WEBHOOK_SECRET");
    if (authError) {
      return authError;
    }

    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const sourceParam = (request.nextUrl.searchParams.get("source") ?? "website") as LeadSource;
    const source: LeadSource = sourceParam in ADAPTERS ? sourceParam : "website";

    enqueueWebhookLog(source, rawBody);

    const normalize = ADAPTERS[source];
    const payload = normalize(rawBody);

    const result = await processAndInsertLead(payload, source);

    if (result.success) {
      if (result.assigned_to && result.lead_name && result.lead_phone !== undefined) {
        after(async () => {
          await sendLeadAssignmentNotification(
            result.assigned_to!,
            result.lead_name!,
            result.lead_phone!,
          ).catch((err) => {
            console.error("[webhooks/leads] Lead assignment notification failed:", err);
          });
        });
      }
      return NextResponse.json(
        { success: true, lead_id: result.lead_id, assigned_to: result.assigned_to },
        { status: 200 },
      );
    }

    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    console.error("[webhooks/leads] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "POST /api/webhooks/leads?source=meta|google|website" });
}
