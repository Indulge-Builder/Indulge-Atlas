import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Supabase Auth PKCE callback.
 * Exchanges the code from the email link for a valid session and redirects.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    const isResetFlow = next === "/update-password";
    return NextResponse.redirect(
      `${BASE_URL}${isResetFlow ? "/update-password" : "/login"}?error=Invalid_Link`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const isResetFlow = next === "/update-password";
    return NextResponse.redirect(
      `${BASE_URL}${isResetFlow ? "/update-password" : "/login"}?error=Invalid_Link`
    );
  }

  const safePath =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${BASE_URL}${safePath}`);
}
