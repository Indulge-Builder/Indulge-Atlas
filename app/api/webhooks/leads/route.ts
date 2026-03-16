import { NextResponse } from "next/server";

/**
 * GET /api/webhooks/leads — Health probe for the leads webhook family.
 * POST is deprecated: use /api/webhooks/leads/meta, /google, or /website.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoints: ["/api/webhooks/leads/meta", "/api/webhooks/leads/google", "/api/webhooks/leads/website"],
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Use /api/webhooks/leads/meta, /google, or /website for lead ingestion.",
    },
    { status: 410 },
  );
}
