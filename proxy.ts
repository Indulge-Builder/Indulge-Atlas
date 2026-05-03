import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[proxy] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set them on Vercel before build).",
    );
    return new NextResponse("Server configuration error", { status: 503 });
  }

  try {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    // Refresh the session so it stays alive across navigations
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[proxy] supabase.auth.getUser failed:", authError.message);
    }

    const { pathname } = request.nextUrl;

    const publicRoutes = [
      "/login",
      "/forgot-password",
      "/update-password",
      "/auth/callback",
      "/tv",
      "/api/tv",
    ];
    const isPublicRoute = publicRoutes.some((route) =>
      pathname.startsWith(route),
    );

    // Elia Preview chat — JSON API; return 401 from the route, not an HTML redirect
    const isEliaApi = pathname.startsWith("/api/elia");

    // Webhook routes use their own secret-based auth — keep them public
    const isWebhookRoute = pathname.startsWith("/api/webhooks");

    // Server Actions POST with `next-action`. Redirecting here returns HTML and
    // breaks fetchServerAction (expects text/x-component). Let the action run;
    // each action enforces auth and returns a serialisable result.
    const isServerAction =
      request.method === "POST" && request.headers.has("next-action");

    if (
      !user &&
      !isPublicRoute &&
      !isWebhookRoute &&
      !isEliaApi &&
      !isServerAction
    ) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectedFrom", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Logged-in users visiting auth entry pages get sent to the dashboard
    if (user && pathname === "/login") {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/";
      return NextResponse.redirect(dashboardUrl);
    }
    if (user && pathname === "/forgot-password") {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/";
      return NextResponse.redirect(dashboardUrl);
    }

    return supabaseResponse;
  } catch (err) {
    console.error("[proxy] Unhandled error:", err);
    return new NextResponse("Service temporarily unavailable", { status: 503 });
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - _next/webpack-hmr, _next/development (dev HMR - massive request spam)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public static assets (svg, png, jpg, ico, webp, etc.)
     */
    "/((?!_next/static|_next/image|_next/webpack-hmr|_next/development|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|mp4|woff|woff2|ttf|otf)$).*)",
  ],
};
