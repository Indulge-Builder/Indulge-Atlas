"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface UpdateProfileInput {
  phone: string | null;
  dob: string | null;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function updateProfile(
  data: UpdateProfileInput
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Unauthenticated" };

    const { error } = await supabase
      .from("profiles")
      .update({
        phone: data.phone?.trim() || null,
        dob:   data.dob   || null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[profile/update] Supabase error:", error.message);
      return { success: false, error: "Could not save changes. Try again." };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (err) {
    console.error("[profile/update] Unexpected error:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
