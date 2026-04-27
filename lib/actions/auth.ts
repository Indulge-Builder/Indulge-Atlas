"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { passwordSchema } from "@/lib/schemas/password";
import { getPublicSiteUrl } from "@/lib/utils/site-url";
import { mapAuthError } from "@/lib/utils/auth-errors";

export type AuthActionResult = { success: boolean; error?: string };

export async function resetPasswordForEmail(email: string): Promise<AuthActionResult> {
  return requestPasswordReset(email);
}

/**
 * Sends a password reset email. `redirectTo` must use `NEXT_PUBLIC_SITE_URL` (see `getPublicSiteUrl`).
 * Always returns the same success shape for unknown emails (enumeration-safe), except rate limits and misconfiguration.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  let siteUrl: string;
  try {
    siteUrl = getPublicSiteUrl();
  } catch (e) {
    return {
      success: false,
      error: mapAuthError(e instanceof Error ? e.message : null),
    };
  }

  try {
    const supabase = await createClient();
    const redirectTo = `${siteUrl}/auth/callback?next=/update-password&flow=reset`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
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
    const message = e instanceof Error ? e.message : "";
    if (message.includes("NEXT_PUBLIC_SITE_URL") || message.includes("not set")) {
      return { success: false, error: mapAuthError(message) };
    }
    return { success: true };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthActionResult> {
  try {
    const validation = passwordSchema.safeParse(newPassword);
    if (!validation.success) {
      return {
        success: false,
        error:
          validation.error.issues[0]?.message ??
          mapAuthError("Invalid password"),
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: mapAuthError("Not authenticated") };

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) return { success: false, error: mapAuthError(error.message) };

    const { error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      return { success: false, error: mapAuthError(sessionError.message) };
    }

    revalidatePath("/", "layout");
    revalidatePath("/login");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { success: false, error: mapAuthError(message) };
  }
}
