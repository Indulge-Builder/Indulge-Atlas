"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Permanently dismisses an SLA alert for a lead.
 * Sets sla_alert_dismissed = true so the alert never fetches or shows again.
 */
export async function dismissSlaAlert(leadId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: "Unauthenticated" };

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    // Only the assigned agent (or privileged roles) can dismiss
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = (profile as { role: string } | null)?.role ?? "agent";
    const isPrivileged = role === "admin" || role === "scout";
    if (!isPrivileged && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const { error } = await supabase
      .from("leads")
      .update({ sla_alert_dismissed: true })
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to dismiss alert" };

    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}
