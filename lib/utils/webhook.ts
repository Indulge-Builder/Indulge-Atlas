import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function secretsMatch(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies Bearer token against PABBLY_WEBHOOK_SECRET.
 * Returns null if valid, or a 401 Response to return.
 */
export function verifyPabblyWebhook(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const expectedSecret = process.env.PABBLY_WEBHOOK_SECRET;

  if (!bearerToken || !expectedSecret || !secretsMatch(bearerToken, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
