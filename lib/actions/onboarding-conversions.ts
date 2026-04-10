"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  insertOnboardingConversion,
  parseOnboardingConversionForm,
} from "@/lib/onboarding/onboardingConversion";

export interface RecordConversionResult {
  success: boolean;
  error?: string;
}

export async function recordOnboardingConversionFromAdmin(
  _prev: RecordConversionResult | undefined,
  formData: FormData,
): Promise<RecordConversionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (rawProfile as { role: string } | null)?.role;
  if (role !== "admin") {
    return { success: false, error: "Only admins can record conversions." };
  }

  const parsed = parseOnboardingConversionForm(formData);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const service = await createServiceClient();
  const { error } = await insertOnboardingConversion(service, parsed.data);
  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/conversions");
  revalidatePath("/tv/conversions");
  return { success: true };
}
