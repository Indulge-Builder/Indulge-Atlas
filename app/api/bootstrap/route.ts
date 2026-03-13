import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/bootstrap
 *
 * Promotes the currently logged-in user to admin when no admins exist.
 * Use this after a fresh DB reset to bootstrap your first admin account.
 *
 * 1. Sign up at /login (toggle to "Create account")
 * 2. After signup, visit /api/bootstrap (or it runs automatically)
 * 3. You become admin and can manage users, leads, etc.
 */
export async function POST(request: Request) {
  // Guard: only accessible when BOOTSTRAP_ENABLED=true is explicitly set
  if (process.env.BOOTSTRAP_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Bootstrap is disabled. Set BOOTSTRAP_ENABLED=true to enable." },
      { status: 403 }
    );
  }

  // Optional extra secret for additional protection
  const secret = process.env.BOOTSTRAP_SECRET;
  if (secret) {
    const body = await request.json().catch(() => ({})) as { secret?: string };
    if (body.secret !== secret) {
      return NextResponse.json({ error: "Invalid bootstrap secret." }, { status: 401 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must be logged in to bootstrap." },
      { status: 401 }
    );
  }

  const service = await createServiceClient();

  // Check if any admin exists
  const { data: admins, error: countError } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (countError) {
    return NextResponse.json(
      { error: "Failed to check admin count." },
      { status: 500 }
    );
  }

  if (admins && admins.length > 0) {
    return NextResponse.json({
      success: false,
      message: "An admin already exists. Use the Admin panel to manage users.",
    });
  }

  // Promote current user to admin
  const { error: updateError } = await service
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to promote user to admin." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "You are now the admin. Refresh the app to access admin features.",
  });
}
