import { NextRequest, NextResponse } from "next/server";
import { verifyPabblyWebhook } from "@/lib/utils/webhook";
import { processAndInsertLead } from "@/lib/services/leadIngestion";
import { enqueueWebhookLog } from "@/lib/services/webhookLog";

/**
 * POST /api/webhooks/leads/meta
 *
 * Pabbly → Meta Lead Gen forms. Extracts from raw_meta_fields, builds clean payload.
 */
export async function POST(request: NextRequest) {
  const authError = verifyPabblyWebhook(request);
  if (authError) {
    console.warn(
      "[webhooks/leads/meta] Rejected: missing or invalid Bearer token.",
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

  enqueueWebhookLog("meta", rawBody);

  const formData: Record<string, unknown> = {};
  let full_name = (rawBody.full_name as string) ?? "";
  let first_name = (rawBody.first_name as string) ?? "";
  let last_name = (rawBody.last_name as string) ?? null;
  let phone_number = (rawBody.phone_number as string) ?? null;
  let email = (rawBody.email as string) ?? null;

  // Parse raw_meta_fields
  let metaFields = rawBody.raw_meta_fields;
  if (metaFields != null) {
    try {
      if (typeof metaFields === "string") {
        metaFields = metaFields.trim()
          ? (JSON.parse(metaFields) as Array<{
              name: string;
              values: string[];
            }>)
          : [];
      }
      if (Array.isArray(metaFields)) {
        for (const item of metaFields) {
          if (!item || typeof item !== "object" || !item.name) continue;
          const name = String(item.name).toLowerCase();
          const value = Array.isArray(item.values) ? item.values[0] : null;
          const strVal = value != null ? String(value).trim() : "";

          if (name.includes("full_name") || name === "name") {
            full_name = strVal || full_name;
          } else if (name.includes("last_name") || name === "last_name") {
            last_name = strVal || last_name;
          } else if (name.includes("first_name")) {
            first_name = strVal || first_name;
          } else if (name.includes("phone")) {
            phone_number = strVal || phone_number;
          } else if (name.includes("email")) {
            email = strVal || email;
          } else {
            const val = Array.isArray(item.values)
              ? item.values.length > 1
                ? item.values.join(", ")
                : item.values[0]
              : value;
            formData[item.name] = val != null ? String(val) : "";
          }
        }
      }
    } catch (err) {
      console.warn(
        "[webhooks/leads/meta] Failed to parse raw_meta_fields:",
        err,
      );
    }
  }

  // Alias top-level `phone` → phone_number when canonical key is absent
  if (
    (phone_number == null || String(phone_number).trim() === "") &&
    rawBody.phone != null &&
    String(rawBody.phone).trim() !== ""
  ) {
    phone_number = String(rawBody.phone).trim();
  }

  // Merge top-level fields into form_data for any passthrough
  const topLevelFormKeys = [
    "campaign_name",
    "ad_name",
    "platform",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "message",
  ];
  for (const key of Object.keys(rawBody)) {
    if (
      ![
        "full_name",
        "first_name",
        "last_name",
        "phone_number",
        "phone",
        "email",
        "domain",
        "source",
        "raw_meta_fields",
      ].includes(key) &&
      !topLevelFormKeys.includes(key)
    ) {
      if (rawBody[key] != null && rawBody[key] !== "") {
        formData[key] = rawBody[key];
      }
    }
  }

  // UTM: source=meta, medium=facebook|instagram|website, campaign=campaign name
  const platformVal = (rawBody.platform as string)?.trim();
  const utmMedium =
    (rawBody.utm_medium as string)?.trim() || platformVal || undefined;

  const domainRaw = rawBody.domain;
  const sourceRaw = rawBody.source;

  const formattedData = {
    full_name: full_name || undefined,
    first_name: first_name || undefined,
    last_name: last_name ?? undefined,
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
    platform: utmMedium, // Canonical: connects to campaign_metrics, filters, search
    utm_source: ((rawBody.utm_source as string)?.trim() || "meta") as string,
    utm_medium: utmMedium, // Sub-platform: facebook, instagram, website
    utm_campaign:
      ((rawBody.campaign_name ?? rawBody.utm_campaign) as string)?.trim() ||
      undefined, // Campaign name
    campaign_id: (rawBody.campaign_id as string) ?? undefined,
    message: (rawBody.message as string) ?? undefined,
    form_data: Object.keys(formData).length > 0 ? formData : undefined,
  };

  const result = await processAndInsertLead(formattedData, "meta");

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
