"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function toggleAgentLeaveStatus(
  agentId: string,
  isOnLeave: boolean,
): Promise<ActionResult> {
  try {
    if (!agentId) return { success: false, error: "Agent id is required" };

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Unauthenticated" };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Could not verify permissions" };
    }

    if (profile.role !== "scout" && profile.role !== "admin") {
      return { success: false, error: "Only scouts and admins can update roster status" };
    }

    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", agentId)
      .eq("role", "agent")
      .single();

    if (targetError || !target) {
      return { success: false, error: "Target agent not found" };
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_on_leave: isOnLeave })
      .eq("id", agentId);

    if (updateError) {
      return { success: false, error: "Failed to update roster status" };
    }

    revalidatePath("/scout/roster");
    revalidatePath("/scout/team");

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error while updating roster" };
  }
}
