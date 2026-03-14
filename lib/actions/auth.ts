"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { passwordSchema } from "@/lib/schemas/password";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type AuthActionResult = { success: boolean; error?: string };

export async function resetPasswordForEmail(email: string): Promise<AuthActionResult> {
  return requestPasswordReset(email);
}

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${BASE_URL}/auth/callback?next=/update-password`,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthActionResult> {
  try {
    const validation = passwordSchema.safeParse(newPassword);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message ?? "Invalid password" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) return { success: false, error: error.message };

    // Sign out after password change so user logs in with new password (security best practice)
    await supabase.auth.signOut();
    revalidatePath("/profile");
    revalidatePath("/login");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { success: false, error: message };
  }
}
