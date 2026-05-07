"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  UserRole,
  Profile,
  IndulgeDomain,
  EmployeeDepartment,
} from "@/lib/types/database";
import {
  createUserSchema,
  updateUserProfileSchema,
} from "@/lib/validations/user";
import { z } from "zod";
import { sanitizeText as sanitizePlainText } from "@/lib/utils/sanitize";
import { getPublicSiteUrl } from "@/lib/utils/site-url";
import { mapAuthError } from "@/lib/utils/auth-errors";

interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

const uuidSchema = z.string().uuid();

/** Sanitize a single text field — strips all HTML tags/attributes. */
function sanitizeText(input: string): string {
  return sanitizePlainText(input).trim();
}

// ── Auth guards ────────────────────────────────────────────────────────────

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

  return {
    supabase,
    serviceClient: await createServiceClient(),
    user,
    role: role!,
  };
}

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

  const callerRole = (profile as { role: string } | null)?.role;
  if (callerRole !== "admin") {
    throw new Error("Unauthorized: admin required");
  }

  return {
    supabase,
    serviceClient: await createServiceClient(),
    user,
    callerRole,
  };
}

// ── List all profiles ──────────────────────────────────────────────────────

export async function getAllProfiles(): Promise<Profile[]> {
  const { supabase } = await requireAdminOrManager();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, domain, department, job_title, reports_to, is_active, phone, dob, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

// ── Get profiles by department ──────────────────────────────────────────────

export async function getUsersByDepartment(
  department: EmployeeDepartment,
): Promise<ActionResult<Profile[]>> {
  try {
    const { supabase } = await requireAdminOrManager();

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, domain, department, job_title, reports_to, is_active, created_at, updated_at",
      )
      .eq("department", department)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as Profile[] };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unexpected error",
    };
  }
}

// ── Check whether an email already exists in auth.users ────────────────────

export async function checkEmailExists(
  email: string,
): Promise<ActionResult<{ exists: boolean }>> {
  try {
    // Any authenticated user can call this — used for real-time duplicate check in the wizard.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthenticated" };

    const normalised = email.trim().toLowerCase();
    if (!normalised) return { success: true, data: { exists: false } };

    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalised)
      .maybeSingle();

    return { success: true, data: { exists: !!data } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unexpected error",
    };
  }
}

// ── Get profiles suitable for the "Reports To" dropdown ────────────────────
// Returns managers and admins first, then other roles.
// Excludes the currently-being-created user (no circular FK yet to worry about).

export async function getProfilesForReportsTo(
  /** Exclude this profile id (e.g. user being edited cannot report to themselves). */
  excludeUserId?: string | null,
): Promise<
  ActionResult<
    Pick<Profile, "id" | "full_name" | "job_title" | "role" | "department">[]
  >
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthenticated" };

    let query = supabase
      .from("profiles")
      .select("id, full_name, job_title, role, department")
      .eq("is_active", true)
      .in("role", ["admin", "founder", "manager"])
      .order("full_name", { ascending: true });

    if (excludeUserId && uuidSchema.safeParse(excludeUserId).success) {
      query = query.neq("id", excludeUserId);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []) as Pick<
        Profile,
        "id" | "full_name" | "job_title" | "role" | "department"
      >[],
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unexpected error",
    };
  }
}

// ── Create a new user ──────────────────────────────────────────────────────
//
// Two flows:
//   send_invite = true  → inviteUserByEmail (magic link, user sets their own password)
//   send_invite = false → createUser with password (admin sets password directly)
//
// Architectural invariants (see CLAUDE.md / migration 058):
//   • role, domain, department are set in app_metadata only (service-role only write)
//   • full_name, job_title are set in user_metadata (display-only, non-auth)
//   • profiles row is explicitly updated after auth creation to guarantee consistency
//     in case the handle_new_user trigger races the metadata update
//
// TODO: Write to sys_audit_log when that table is created in Phase 1.

export async function createUser(params: {
  email: string;
  full_name: string;
  job_title: string;
  role: UserRole;
  domain: IndulgeDomain;
  department?: EmployeeDepartment | null;
  reports_to?: string | null;
  send_invite?: boolean;
  password?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createUserSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    // Gate: only admins can create users.
    // Validate role assignment: admins cannot assign founder or another admin.
    const { serviceClient, callerRole } = await requireAdminOnly();

    if (parsed.data.role === "founder") {
      return {
        success: false,
        error:
          "Founder role cannot be assigned via user creation. Contact the platform administrator.",
      };
    }

    // Sanitize all user-supplied text before writing to DB.
    const sanitizedName = sanitizeText(parsed.data.full_name);
    const sanitizedJobTitle = sanitizeText(parsed.data.job_title);

    const appMeta = {
      role: parsed.data.role,
      domain: parsed.data.domain,
      ...(parsed.data.department ? { department: parsed.data.department } : {}),
    };
    const userMeta = {
      full_name: sanitizedName,
      job_title: sanitizedJobTitle,
    };

    let newUserId: string;

    if (parsed.data.send_invite !== false) {
      // undefined or true → invite flow
      // ── Invite flow: magic link email ──────────────────────────────────────
      let siteUrl: string;
      try {
        siteUrl = getPublicSiteUrl();
      } catch (e) {
        return {
          success: false,
          error: mapAuthError(e instanceof Error ? e.message : null),
        };
      }

      const redirectTo = `${siteUrl}/auth/callback?next=/update-password&flow=first`;

      const { data: inviteData, error: inviteError } =
        await serviceClient.auth.admin.inviteUserByEmail(parsed.data.email, {
          data: userMeta,
          redirectTo,
        });

      if (inviteError)
        return { success: false, error: mapAuthError(inviteError.message) };
      if (!inviteData.user)
        return { success: false, error: "Invite failed — no user returned." };

      newUserId = inviteData.user.id;

      // Set app_metadata (role/domain/department) — inviteUserByEmail only allows user_metadata.
      const { error: metaError } =
        await serviceClient.auth.admin.updateUserById(newUserId, {
          app_metadata: appMeta,
        });
      if (metaError) {
        await serviceClient.auth.admin.deleteUser(newUserId);
        return { success: false, error: mapAuthError(metaError.message) };
      }
    } else {
      // ── Direct create flow: admin sets password ────────────────────────────
      const { data: authData, error: authError } =
        await serviceClient.auth.admin.createUser({
          email: parsed.data.email,
          password: parsed.data.password,
          email_confirm: true,
          user_metadata: userMeta,
          app_metadata: appMeta,
        });

      if (authError)
        return { success: false, error: mapAuthError(authError.message) };
      if (!authData.user)
        return { success: false, error: "User creation failed." };

      newUserId = authData.user.id;
    }

    // Explicitly update the profiles row for full consistency.
    // The handle_new_user trigger creates the row, but we guarantee all fields
    // are correct in case of any race between trigger execution and metadata propagation.
    const profileUpdate: Record<string, unknown> = {
      full_name: sanitizedName,
      role: parsed.data.role,
      domain: parsed.data.domain,
      job_title: sanitizedJobTitle || null,
    };

    if (parsed.data.department !== undefined) {
      profileUpdate.department = parsed.data.department ?? null;
    }
    if (parsed.data.reports_to !== undefined) {
      profileUpdate.reports_to = parsed.data.reports_to ?? null;
    }

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", newUserId);

    if (profileError) {
      // Auth user was created but profile update failed.
      // Return partial success — user exists but profile data may be incomplete.
      return {
        success: false,
        error: `User auth created but profile update failed: ${profileError.message}. Contact support with user ID: ${newUserId}`,
      };
    }

    revalidatePath("/admin");

    return { success: true, data: { id: newUserId } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: mapAuthError(message) };
  }
}

// ── Update user profile ────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  updates: {
    full_name?: string;
    job_title?: string | null;
    role?: UserRole;
    domain?: IndulgeDomain;
    department?: EmployeeDepartment | null;
    reports_to?: string | null;
    is_active?: boolean;
  },
): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: "Invalid user ID" };

    const validated = updateUserProfileSchema.safeParse(updates);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { serviceClient, user } = await requireAdminOnly();

    if (
      user.id === userId &&
      validated.data.is_active === false
    ) {
      return {
        success: false,
        error: "You cannot deactivate your own account.",
      };
    }

    if (validated.data.reports_to && validated.data.reports_to === userId) {
      return { success: false, error: "A user cannot report to themselves." };
    }

    if (
      typeof validated.data.role === "string" &&
      validated.data.role === "founder"
    ) {
      const { data: targetProfile, error: targetErr } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (targetErr) return { success: false, error: targetErr.message };
      if ((targetProfile as { role?: string } | null)?.role !== "founder") {
        return {
          success: false,
          error:
            "Founder role cannot be assigned through user updates. Contact the platform administrator.",
        };
      }
    }

    // Sanitize text fields before update.
    const updatePayload: Record<string, unknown> = { ...validated.data };
    if (typeof updatePayload.full_name === "string") {
      updatePayload.full_name = sanitizeText(updatePayload.full_name as string);
    }
    if (typeof updatePayload.job_title === "string") {
      updatePayload.job_title =
        sanitizeText(updatePayload.job_title as string) || null;
    }

    const { error } = await serviceClient
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId);

    if (error) return { success: false, error: error.message };

    const needsUserMetaSync =
      typeof validated.data.full_name === "string" ||
      typeof validated.data.job_title === "string" ||
      validated.data.job_title === null;

    const needsAppMetaSync =
      typeof validated.data.role === "string" ||
      typeof validated.data.domain === "string" ||
      typeof validated.data.department === "string" ||
      validated.data.department === null;

    if (needsUserMetaSync || needsAppMetaSync) {
      const { data: existingAuth, error: getUserError } =
        await serviceClient.auth.admin.getUserById(userId);
      if (getUserError) return { success: false, error: getUserError.message };

      const u = existingAuth.user;
      const payload: {
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
      } = {};

      if (needsUserMetaSync) {
        payload.user_metadata = { ...(u?.user_metadata ?? {}) };
        if (typeof validated.data.full_name === "string") {
          payload.user_metadata.full_name = sanitizeText(
            validated.data.full_name,
          );
        }
        if ("job_title" in validated.data) {
          if (validated.data.job_title === null) {
            payload.user_metadata.job_title = null;
          } else if (typeof validated.data.job_title === "string") {
            payload.user_metadata.job_title =
              sanitizeText(validated.data.job_title) || null;
          }
        }
      }

      if (needsAppMetaSync) {
        payload.app_metadata = { ...(u?.app_metadata ?? {}) };
        if (typeof validated.data.role === "string")
          payload.app_metadata.role = validated.data.role;
        if (typeof validated.data.domain === "string")
          payload.app_metadata.domain = validated.data.domain;
        if ("department" in validated.data)
          payload.app_metadata.department = validated.data.department ?? null;
      }

      const { error: authUpdErr } =
        await serviceClient.auth.admin.updateUserById(userId, payload);
      if (authUpdErr) return { success: false, error: authUpdErr.message };
    }

    // Ban/unban on active status change.
    if (validated.data.is_active === false) {
      await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: "876600h",
      });
    }
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

// ── Send password reset email ──────────────────────────────────────────────

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  try {
    let siteUrl: string;
    try {
      siteUrl = getPublicSiteUrl();
    } catch (e) {
      return {
        success: false,
        error: mapAuthError(e instanceof Error ? e.message : null),
      };
    }

    const { supabase } = await requireAdminOrManager();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/update-password&flow=reset`,
    });

    if (error) {
      const low = error.message.toLowerCase();
      if (
        low.includes("rate") ||
        low.includes("too many") ||
        error.status === 429
      ) {
        return { success: false, error: mapAuthError(error.message) };
      }
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: mapAuthError(message) };
  }
}

// ── Delete a user (hard delete — prefer deactivating) ──────────────────────

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: "Invalid user ID" };

    const { serviceClient, user } = await requireAdminOnly();

    if (user.id === userId) {
      return { success: false, error: "You cannot delete your own account." };
    }

    const { error } = await serviceClient.auth.admin.deleteUser(userId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}
