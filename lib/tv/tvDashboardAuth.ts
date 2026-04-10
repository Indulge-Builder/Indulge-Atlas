import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function tvDashboardTokenValid(
  token: string | null | undefined,
): boolean {
  const expected = process.env.TV_DASHBOARD_SECRET?.trim();
  if (!token || !expected) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getTvTokenFromRequest(request: NextRequest): string | null {
  const q = request.nextUrl.searchParams.get("token");
  if (q) return q.trim();
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}
