"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { UserRole, Profile } from "@/lib/types/database";
import { z } from "zod";

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

const uuidSchema = z.string().uuid();

// ── Guard: admin OR scout (read access) ───────────────────

async function requireAdminOrScout() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role: string } | null)?.role;
  if (role !== "admin" && role !== "scout") {
    throw new Error("Unauthorized: admin or scout required");
  }

  return { supabase, serviceClient: await createServiceClient(), user };
}

// ── Guard: admin only (destructive operations) ─────────────

async function requireAdminOnly() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role: string } | null)?.role;
  if (role !== "admin") {
    throw new Error("Unauthorized: admin required");
  }

  return { supabase, serviceClient: await createServiceClient(), user };
}

// ── List all users ─────────────────────────────────────────

export async function getAllProfiles(): Promise<Profile[]> {
  const { supabase } = await requireAdminOrScout();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

// ── Create a new user ──────────────────────────────────────
// Uses the Supabase Auth Admin API (service role) to create the
// auth user. The handle_new_user trigger auto-creates the profile.

export async function createUser(params: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { serviceClient } = await requireAdminOnly();

    // Create auth user
    const { data: authData, error: authError } =
      await serviceClient.auth.admin.createUser({
        email: params.email.trim().toLowerCase(),
        password: params.password,
        email_confirm: true, // auto-confirm so they can log in immediately
        user_metadata: {
          full_name: params.full_name.trim(),
          role: params.role,
        },
      });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: "User creation failed" };
    }

    // The handle_new_user trigger will create the profile.
    // We update role explicitly in case the trigger runs before metadata is set.
    await serviceClient
      .from("profiles")
      .update({ role: params.role, full_name: params.full_name.trim() })
      .eq("id", authData.user.id);

    revalidatePath("/admin");

    return { success: true, data: { id: authData.user.id } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ── Update user profile ────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  updates: {
    full_name?: string;
    role?: UserRole;
    is_active?: boolean;
  }
): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: "Invalid user ID" };

    const { serviceClient } = await requireAdminOnly();

    const { error } = await serviceClient
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    // If deactivating, also disable the auth user to prevent login
    if (updates.is_active === false) {
      await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // effectively permanent — ~100 years
      });
    }

    // If re-activating, unban
    if (updates.is_active === true) {
      await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ── Send password reset email ──────────────────────────────

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminOrScout();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
    });

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ── Delete a user (hard) ───────────────────────────────────
// Prefer deactivating over deleting. This is irreversible.

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: "Invalid user ID" };

    const { serviceClient } = await requireAdminOnly();

    const { error } = await serviceClient.auth.admin.deleteUser(userId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}
