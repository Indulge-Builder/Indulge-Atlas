import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side sign-out.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Sign-out used to be client-only: `createClient().auth.signOut()` in the nav,
 * then `router.push()`. Two things went wrong with that, and both are invisible
 * locally on a fast reload:
 *
 *  1. The session lives in COOKIES (`@supabase/ssr`). Clearing them from
 *     JavaScript never produces a `Set-Cookie` on a server response, so any
 *     already-rendered RSC payload — and any request already in flight — still
 *     carried a valid session.
 *
 *  2. Next.js keeps a client-side Router Cache of visited routes. After
 *     `router.push("/academy/login")` the entry for `/academy` was still in it,
 *     so pressing Back re-displayed a fully authenticated page without ever
 *     asking the server. `router.refresh()` only refreshes the route you are
 *     currently on, which by then was the login page.
 *
 * Signing out on the server fixes both: `signOut()` here runs against the
 * cookie-aware server client so the response carries real cookie deletions, and
 * `revalidatePath("/", "layout")` invalidates every cached segment so nothing
 * stale survives in the Router Cache.
 *
 * POST-only. A GET would let any `<img src="/auth/signout">` on any page log the
 * user out, and browsers may prefetch GET links.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Only attempt the revoke when a session actually exists — signOut() on an
  // anonymous request logs a pointless "Auth session missing!" error.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // `scope: "global"` revokes the refresh token everywhere, not just this
    // browser. A trainee signing out on a shared machine should not leave a
    // session alive on their phone.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.error("[signout] supabase.auth.signOut failed:", error.message);
    }
  }

  // Drop every cached RSC segment so a Back press cannot re-display a
  // logged-in page from the client Router Cache.
  revalidatePath("/", "layout");

  /*
   * Where to land. Academy has its own front door; sending an intern to the
   * Atlas login would drop them at a product they cannot open.
   */
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const target = from.startsWith("/academy") ? "/academy/login" : "/login";

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = target;
  redirectUrl.search = "";

  // 303 so the browser follows with GET rather than replaying the POST.
  const response = NextResponse.redirect(redirectUrl, { status: 303 });

  // Belt and braces: tell the browser never to serve this navigation from its
  // own back/forward cache either.
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");

  return response;
}
