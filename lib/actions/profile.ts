"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateProfileSchema = z.object({
  phone: z.union([z.string().max(30), z.null()]).optional(),
  dob: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v || v === "" ? null : v)),
});

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function updateProfile(
  data: unknown
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { phone, dob } = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Unauthenticated" };

    const { error } = await supabase
      .from("profiles")
      .update({
        phone: phone?.trim() || null,
        dob:   dob   || null,
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
