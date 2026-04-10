import { NextRequest, NextResponse } from "next/server";
import { verifyBearerSecret } from "@/lib/utils/webhook";
import { checkWebhookRateLimit } from "@/lib/utils/rateLimit";
import { processAndInsertLead } from "@/lib/services/leadIngestion";
import { enqueueWebhookLog } from "@/lib/services/webhookLog";
import { applyFieldMappings } from "@/lib/services/fieldMappingEngine";

/**
 * POST /api/webhooks/leads/google
 *
 * Pabbly → Google Ads Lead Form Extensions. Extracts from raw_google_fields.
 */
export async function POST(request: NextRequest) {
  const rl = await checkWebhookRateLimit(request);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authError = verifyBearerSecret(request, "PABBLY_GOOGLE_SECRET");
  if (authError) {
    console.warn(
      "[webhooks/leads/google] Rejected: missing or invalid Bearer token.",
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

  enqueueWebhookLog("google", rawBody);

  // ── Dynamic mapping engine ─────────────────────────────────────────────────
  const { hasMappings, mappedFields, unmappedFormData } =
    await applyFieldMappings("google", rawBody);

  if (hasMappings) {
    const utmMedium =
      (mappedFields.utm_medium as string) ??
      (rawBody.platform as string)?.trim() ??
      undefined;

    const dynamicPayload = {
      ...mappedFields,
      platform: "google",
      utm_source:
        ((mappedFields.utm_source ?? rawBody.utm_source) as string)?.trim() ||
        "google",
      utm_medium: utmMedium,
      utm_campaign:
        ((mappedFields.utm_campaign ??
          rawBody.campaign_name ??
          rawBody.utm_campaign) as string)?.trim() || undefined,
      form_data:
        Object.keys(unmappedFormData).length > 0 ? unmappedFormData : undefined,
    };

    const result = await processAndInsertLead(dynamicPayload, "google");
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

  const formData: Record<string, unknown> = {};
  let full_name = (rawBody.full_name as string) ?? "";
  let phone_number = (rawBody.phone_number as string) ?? null;
  let email = (rawBody.email as string) ?? null;

  // Parse raw_google_fields
  let googleData = rawBody.raw_google_fields;
  if (googleData != null) {
    try {
      if (typeof googleData === "string") {
        googleData = googleData.trim()
          ? (JSON.parse(googleData) as Array<{
              column_id?: string;
              column_name?: string;
              string_value?: string;
            }>)
          : [];
      }
      if (Array.isArray(googleData)) {
        for (const item of googleData) {
          if (!item || typeof item !== "object") continue;
          // Support: column_id, column_name, question, name, field_name
          const colId = (item.column_id ??
            item.column_name ??
            item.question ??
            item.name ??
            item.field_name) as string | undefined;
          // Support: string_value, value, answer, values[0]
          const rawVal =
            item.string_value ??
            item.value ??
            item.answer ??
            (Array.isArray(item.values) ? item.values[0] : null);
          const strVal = rawVal != null ? String(rawVal).trim() : "";

          if (!colId) continue;

          const colNorm = String(colId).trim();
          const colUpper = colNorm.toUpperCase();

          if (colUpper === "FULL_NAME") {
            full_name = strVal || full_name;
          } else if (
            colUpper === "PHONE_NUMBER" ||
            colNorm === "phoneNumber" ||
            colNorm === "phone"
          ) {
            phone_number = strVal || phone_number;
          } else if (colUpper === "EMAIL") {
            email = strVal || email;
          } else {
            // All custom questions → form_data (include empty answers so we don't drop keys)
            formData[colNorm] = strVal || "";
          }
        }
      }
    } catch (err) {
      console.warn(
        "[webhooks/leads/google] Failed to parse raw_google_fields:",
        err,
      );
    }
  }

  if (
    (phone_number == null || String(phone_number).trim() === "") &&
    rawBody.phone != null &&
    String(rawBody.phone).trim() !== ""
  ) {
    phone_number = String(rawBody.phone).trim();
  }
  if (
    (phone_number == null || String(phone_number).trim() === "") &&
    rawBody.phoneNumber != null &&
    String(rawBody.phoneNumber).trim() !== ""
  ) {
    phone_number = String(rawBody.phoneNumber).trim();
  }

  // Merge any other top-level keys into form_data
  const standardKeys = new Set([
    "full_name",
    "first_name",
    "last_name",
    "phone_number",
    "phone",
    "phoneNumber",
    "email",
    "domain",
    "source",
    "raw_google_fields",
    "campaign_name",
    "ad_name",
    "platform",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "campaign_id",
  ]);
  for (const key of Object.keys(rawBody)) {
    if (!standardKeys.has(key) && rawBody[key] != null && rawBody[key] !== "") {
      formData[key] = rawBody[key];
    }
  }

  // UTM: source=google, medium=search|youtube|display|etc, campaign=campaign name
  const platformVal = (rawBody.platform as string)?.trim();
  const utmMedium =
    (rawBody.utm_medium as string)?.trim() || platformVal || undefined;

  const domainRaw = rawBody.domain;
  const sourceRaw = rawBody.source;

  const formattedData = {
    full_name: full_name || undefined,
    phone_number: phone_number ?? undefined,
    email: email ?? undefined,
    ...(typeof domainRaw === "string" && domainRaw.trim() !== ""
      ? { domain: domainRaw.trim() }
      : {}),
    ...(typeof sourceRaw === "string" && sourceRaw.trim() !== ""
      ? { source: sourceRaw.trim() }
      : {}),
    campaign_name: (rawBody.campaign_name as string) ?? undefined,
    ad_name: (rawBody.ad_name as string) ?? undefined,
    platform: "google", // Canonical: connects to campaign_metrics, filters, search
    utm_source: ((rawBody.utm_source as string)?.trim() || "google") as string,
    utm_medium: utmMedium, // Sub-platform: search, youtube, display, etc.
    utm_campaign:
      ((rawBody.campaign_name ?? rawBody.utm_campaign) as string)?.trim() ||
      undefined, // Campaign name
    campaign_id: (rawBody.campaign_id as string) ?? undefined,
    form_data: Object.keys(formData).length > 0 ? formData : undefined,
  };

  const result = await processAndInsertLead(formattedData, "google");

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
