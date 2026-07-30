import { NextRequest, NextResponse } from "next/server";
import { verifyBearerSecret } from "@/lib/utils/webhook";
import { sweepOverdueTickets } from "@/lib/actions/concierge-sla";

// Protected hourly SLA overdue sweep for concierge tickets.
// Auth: Authorization: Bearer <CRON_SECRET>. Works with either caller:
//   - pg_cron -> net.http_post (POST) — see migration 111 (repo convention).
//   - Vercel Cron (GET) — add to vercel.json:
//       { "crons": [{ "path": "/api/cron/concierge-sla-sweep", "schedule": "0 * * * *" }] }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const authError = verifyBearerSecret(request, "CRON_SECRET");
  if (authError) return authError;
  try {
    const result = await sweepOverdueTickets();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[concierge-sla-sweep]", err);
    return NextResponse.json({ ok: false, error: "sweep failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
