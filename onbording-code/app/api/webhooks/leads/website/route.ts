import { NextRequest, NextResponse } from "next/server";
import { verifyBearerSecret } from "@/lib/utils/webhook";
import { checkWebhookRateLimit } from "@/lib/utils/rateLimit";
import { processAndInsertLead } from "@/lib/services/leadIngestion";
import { enqueueWebhookLog } from "@/lib/services/webhookLog";
import { applyFieldMappings } from "@/lib/services/fieldMappingEngine";

/**
 * POST /api/webhooks/leads/website
 *
 * Typeform / Webflow / standard flat JSON. No array parsing needed.
 */
export async function POST(request: NextRequest) {
  try {
    return await handleWebsiteLeadPost(request);
  } catch (err) {
    console.error("[webhooks/leads/website] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function handleWebsiteLeadPost(request: NextRequest) {
  const rl = await checkWebhookRateLimit(request);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authError = verifyBearerSecret(request, "PABBLY_WEBSITE_SECRET");
  if (authError) {
    console.warn(
      "[webhooks/leads/website] Rejected: missing or invalid Bearer token.",
    );
    return authError;
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  enqueueWebhookLog("website", rawBody);

  // ── Dynamic mapping engine ─────────────────────────────────────────────────
  const { hasMappings, mappedFields, unmappedFormData } =
    await applyFieldMappings("website", rawBody);

  if (hasMappings) {
    const utmMedium =
      (mappedFields.utm_medium as string) ??
      (rawBody.platform as string)?.trim() ??
      "website";

    const dynamicPayload = {
      ...mappedFields,
      platform: "website",
      utm_source:
        ((mappedFields.utm_source ?? rawBody.utm_source) as string)?.trim() ||
        "website",
      utm_medium: utmMedium,
      utm_campaign:
        ((mappedFields.utm_campaign ??
          rawBody.campaign_name ??
          rawBody.utm_campaign) as string)?.trim() || undefined,
      form_data:
        Object.keys(unmappedFormData).length > 0 ? unmappedFormData : undefined,
    };

    const result = await processAndInsertLead(dynamicPayload, "website");
    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          lead_id: result.lead_id,
          assigned_to: result.assigned_to,
          utm_campaign: result.utm_campaign,
          _engine: "dynamic",
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // ── End dynamic engine ─────────────────────────────────────────────────────

  // Standard flat mapping — common field name variants
  const first_name = (rawBody.first_name ?? rawBody.firstName) as
    | string
    | undefined;
  const last_name = (rawBody.last_name ?? rawBody.lastName) as
    | string
    | undefined;
  const full_name = (rawBody.full_name ?? rawBody.fullName ?? rawBody.name) as
    | string
    | undefined;
  const phone_number = (rawBody.phone_number ??
    rawBody.phone ??
    rawBody.phoneNumber) as string | undefined;
  const email = (rawBody.email ?? rawBody.mail) as string | undefined;

  // Everything else → form_data
  const standardKeys = new Set([
    "first_name",
    "firstName",
    "last_name",
    "lastName",
    "full_name",
    "fullName",
    "name",
    "phone_number",
    "phone",
    "phoneNumber",
    "email",
    "mail",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "campaign_id",
    "campaign_name",
    "ad_name",
    "platform",
  ]);
  const formData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (!standardKeys.has(key) && value != null && value !== "") {
      formData[key] = value;
    }
  }

  // UTM: source=website, medium=website|organic|etc, campaign=campaign name
  const platformVal = (rawBody.platform as string)?.trim();
  const utmMedium =
    (rawBody.utm_medium as string)?.trim() || platformVal || "website";

  const formattedData = {
    first_name: first_name?.trim?.() || undefined,
    last_name: last_name?.trim?.() || undefined,
    full_name: full_name?.trim?.() || undefined,
    phone_number: phone_number?.trim?.() || undefined,
    email: email?.trim?.() || undefined,
    platform: "website", // Canonical: connects to campaign_metrics, filters, search
    utm_source: ((rawBody.utm_source as string)?.trim() || "website") as string,
    utm_medium: utmMedium, // Sub-platform: website, organic, etc.
    utm_campaign:
      ((rawBody.campaign_name ?? rawBody.utm_campaign) as string)?.trim() ||
      undefined, // Campaign name
    campaign_id: (rawBody.campaign_id as string) ?? undefined,
    campaign_name: (rawBody.campaign_name as string) ?? undefined,
    ad_name: (rawBody.ad_name as string) ?? undefined,
    message: (rawBody.message as string) ?? undefined,
    form_data: Object.keys(formData).length > 0 ? formData : undefined,
  };

  const result = await processAndInsertLead(formattedData, "website");

  if (result.success) {
    return NextResponse.json(
      {
        success: true,
        lead_id: result.lead_id,
        assigned_to: result.assigned_to,
        utm_campaign: result.utm_campaign,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
