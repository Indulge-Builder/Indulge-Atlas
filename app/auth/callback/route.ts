import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function originFromRequest(request: Request): string {
  return new URL(request.url).origin;
}

function safeNextPath(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

function updatePasswordPath(flow: string | null, fallback: "first" | "reset"): string {
  const f = flow === "first" || flow === "reset" ? flow : fallback;
  return `/update-password?flow=${encodeURIComponent(f)}`;
}

/**
 * After `verifyOtp`, send the user to the correct surface based on Supabase auth type.
 */
function pathAfterOtpType(type: string, next: string, flow: string | null): string {
  if (type === "invite" || type === "signup") {
    return updatePasswordPath(flow, "first");
  }
  if (type === "recovery") {
    return updatePasswordPath(flow, "reset");
  }
  if (type === "magiclink" || type === "email") {
    return safeNextPath(next);
  }
  return "/login?error=auth_callback_failed";
}

function redirectAuthCallbackFailed(request: Request, preferUpdatePassword: boolean) {
  const origin = originFromRequest(request);
  const path = preferUpdatePassword ? "/update-password" : "/login";
  const url = new URL(path, origin);
  url.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(url);
}

/**
 * Supabase Auth callback: PKCE (`code`) and email links (`token_hash` + `type`).
 * Redirect targets use the request origin so links stay on the host the user opened
 * (in addition to configuring `NEXT_PUBLIC_SITE_URL` for email `redirectTo`).
 */
export async function GET(request: NextRequest) {
  const origin = originFromRequest(request);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  const flow = searchParams.get("flow");

  const supabase = await createClient();

  if (token_hash && typeParam) {
    const type = typeParam as EmailOtpType;
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (error) {
      return redirectAuthCallbackFailed(
        request,
        type === "recovery" || type === "invite" || type === "signup",
      );
    }
    const path = pathAfterOtpType(typeParam, next, flow);
    return NextResponse.redirect(new URL(path, origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const preferPw =
        next === "/update-password" ||
        next.startsWith("/update-password") ||
        flow === "reset" ||
        flow === "first";
      return redirectAuthCallbackFailed(request, preferPw);
    }

    const base = safeNextPath(next);
    if (base === "/update-password") {
      return NextResponse.redirect(new URL(updatePasswordPath(flow, "reset"), origin));
    }
    return NextResponse.redirect(new URL(base, origin));
  }

  return redirectAuthCallbackFailed(request, false);
}
