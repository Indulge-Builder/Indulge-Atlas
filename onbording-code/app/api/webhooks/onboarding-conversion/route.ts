import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  insertOnboardingConversion,
  parseOnboardingConversionJson,
} from "@/lib/onboarding/onboardingConversion";
import { verifyBearerSecret } from "@/lib/utils/webhook";

/**
 * POST /api/webhooks/onboarding-conversion
 *
 * Internal-only: Bearer token must match ONBOARDING_CONVERSION_WEBHOOK_SECRET.
 * Inserts a row into public.onboarding_leads.
 */
export async function POST(request: NextRequest) {
  const authError = verifyBearerSecret(
    request,
    "ONBOARDING_CONVERSION_WEBHOOK_SECRET",
  );
  if (authError) {
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

  const parsed = parseOnboardingConversionJson(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const supabase = await createServiceClient();
  const { error } = await insertOnboardingConversion(supabase, parsed.data);

  if (error) {
    console.error("[webhooks/onboarding-conversion]", error);
    return NextResponse.json(
      { error: "Failed to record conversion." },
      { status: 500 },
    );
  }

  revalidatePath("/admin/conversions");
  revalidatePath("/tv/conversions");

  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
