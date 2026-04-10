"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { UserRole, Profile, IndulgeDomain } from "@/lib/types/database";
import { createUserSchema, updateUserProfileSchema } from "@/lib/validations/user";
import { z } from "zod";

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

const uuidSchema = z.string().uuid();

// ── Guard: admin, founder, or manager (broad read/write access) ──

async function requireAdminOrManager() {
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
  if (!["admin", "founder", "manager"].includes(role ?? "")) {
    throw new Error("Unauthorized: admin, founder, or manager required");
  }

  return { supabase, serviceClient: await createServiceClient(), user };
}

/** @deprecated Use requireAdminOrManager */
const requireAdminOrScout = requireAdminOrManager;

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
  const { supabase } = await requireAdminOrManager();

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
  domain: IndulgeDomain;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createUserSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { serviceClient } = await requireAdminOnly();

    // Create auth user
    const { data: authData, error: authError } =
      await serviceClient.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true, // auto-confirm so they can log in immediately
        user_metadata: {
          full_name: parsed.data.full_name,
        },
        // Role/domain in app_metadata only — clients cannot forge via updateUser().
        app_metadata: {
          role: parsed.data.role,
          domain: parsed.data.domain,
        },
      });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: "User creation failed" };
    }

    // The handle_new_user trigger will create the profile.
    // We update role and domain explicitly in case the trigger runs before metadata is set.
    await serviceClient
      .from("profiles")
      .update({
        role: parsed.data.role,
        full_name: parsed.data.full_name,
        domain: parsed.data.domain,
      })
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
    domain?: IndulgeDomain;
    is_active?: boolean;
  }
): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: "Invalid user ID" };

    const validated = updateUserProfileSchema.safeParse(updates);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message ?? "Invalid input" };
    }

    const { serviceClient } = await requireAdminOnly();

    const { error } = await serviceClient
      .from("profiles")
      .update(validated.data)
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    // Sync Auth JWT: full_name stays in user_metadata; role/domain in app_metadata
    // (service-role only). RLS reads profiles only — see migration 058.
    const needsAuthSync =
      typeof validated.data.full_name === "string" ||
      typeof validated.data.role === "string" ||
      typeof validated.data.domain === "string";

    if (needsAuthSync) {
      const { data: existingAuth, error: getUserError } =
        await serviceClient.auth.admin.getUserById(userId);
      if (getUserError) return { success: false, error: getUserError.message };

      const u = existingAuth.user;
      const payload: {
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
      } = {};

      if (typeof validated.data.full_name === "string") {
        payload.user_metadata = {
          ...(u?.user_metadata ?? {}),
          full_name: validated.data.full_name,
        };
      }
      if (typeof validated.data.role === "string" || typeof validated.data.domain === "string") {
        payload.app_metadata = { ...(u?.app_metadata ?? {}) };
        if (typeof validated.data.role === "string") payload.app_metadata.role = validated.data.role;
        if (typeof validated.data.domain === "string") payload.app_metadata.domain = validated.data.domain;
      }

      const { error: authUpdErr } = await serviceClient.auth.admin.updateUserById(userId, payload);
      if (authUpdErr) return { success: false, error: authUpdErr.message };
    }

    // If deactivating, also disable the auth user to prevent login
    if (validated.data.is_active === false) {
      await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // effectively permanent — ~100 years
      });
    }

    // If re-activating, unban
    if (validated.data.is_active === true) {
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
    const { supabase } = await requireAdminOrManager();

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
