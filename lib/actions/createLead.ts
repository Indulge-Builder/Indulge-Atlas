"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { addLeadSchema, type AddLeadFormValues } from "@/lib/schemas/lead";

interface ActionResult {
  success: boolean;
  error?: string;
  leadId?: string;
}

// Maps UI-friendly domain labels → DB enum values
const DOMAIN_MAP: Record<string, string> = {
  "Indulge Global":     "indulge_global",
  "Indulge Shop":       "indulge_shop",
  "The Indulge House":  "the_indulge_house",
  "Indulge Legacy":     "indulge_legacy",
};

async function getCallerProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  const role = (profile as { id: string; role: string; full_name: string } | null)
    ?.role as string | undefined;

  return {
    supabase,
    serviceClient: await createServiceClient(),
    user,
    role: role ?? "agent",
    full_name: (profile as { full_name?: string } | null)?.full_name ?? "",
  };
}

export async function getCurrentUserProfile(): Promise<{
  id: string;
  role: string;
  full_name: string;
}> {
  try {
    const { user, role, full_name } = await getCallerProfile();
    return { id: user.id, role, full_name };
  } catch {
    return { id: "", role: "agent", full_name: "" };
  }
}

export async function createLead(input: AddLeadFormValues): Promise<ActionResult> {
  try {
    const validation = addLeadSchema.safeParse(input);
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message ?? "Invalid input" };
    }

    const { serviceClient, user, role } = await getCallerProfile();

    const trimmed  = input.full_name.trim();
    const spaceIdx = trimmed.indexOf(" ");
    const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const lastName  = spaceIdx === -1 ? null : trimmed.slice(spaceIdx + 1).trim() || null;

    // Agents: force self-assignment. Scouts/Admins: use dropdown value or default to self.
    const assignedTo =
      role === "agent" ? user.id : (input.assigned_to?.trim() || user.id);

    const domainRaw = input.domain ?? "Indulge Global";
    const domainDb  = DOMAIN_MAP[domainRaw] ?? "indulge_global";

    // Map form source to utm_source + utm_medium for attribution
    const SOURCE_TO_UTM: Record<string, { source: string; medium?: string }> = {
      "Meta Ads":       { source: "meta", medium: "facebook" },
      "Google Ads":     { source: "google", medium: "search" },
      "Website Form":   { source: "website", medium: "organic" },
      "Referral":       { source: "referral" },
      "Direct/WhatsApp": { source: "whatsapp" },
    };
    const utmMapping = input.source ? SOURCE_TO_UTM[input.source] : null;
    const utmSource = utmMapping?.source ?? (input.source ? input.source.toLowerCase().replace(/\s+/g, "_") : null);
    const utmMedium = utmMapping?.medium ?? null;
    const campaignName = input.campaign_name?.trim() || null;

    const { data: lead, error: leadError } = await serviceClient
      .from("leads")
      .insert({
        first_name:   firstName,
        last_name:    lastName,
        phone_number: input.phone.trim(),
        email:        input.email?.trim() || null,
        city:         input.city?.trim() || null,
        utm_source:   utmSource,
        utm_medium:   utmMedium,
        utm_campaign: campaignName,
        campaign_id:  campaignName,
        domain:       domainDb,
        status:       "new",
        assigned_to:  assignedTo,
        notes:        input.initial_notes?.trim() || null,
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      return {
        success: false,
        error: leadError?.message ?? "Failed to create lead. Please try again.",
      };
    }

    await serviceClient.from("lead_activities").insert({
      lead_id:      lead.id,
      performed_by: user.id,
      type:         "note",
      payload: {
        text:      "Lead created manually",
        utm_source: utmSource ?? "manual",
        timestamp: new Date().toISOString(),
      },
    });

    if (input.initial_notes?.trim()) {
      const taskAgentId = assignedTo ?? user.id;
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);

      const { error: taskError } = await serviceClient.from("tasks").insert({
        lead_id:     lead.id,
        assigned_to: taskAgentId,
        title:       input.initial_notes.trim(),
        due_date:    dueAt.toISOString(),
        task_type:   "general_follow_up",
        status:      "pending",
      });

      if (!taskError) {
        await serviceClient.from("lead_activities").insert({
          lead_id:      lead.id,
          performed_by: user.id,
          type:         "task_created",
          payload: {
            task_type: "general_follow_up",
            due_date:  dueAt.toISOString(),
            note:      "Initial follow-up task created from lead creation",
          },
        });
      }
    }

    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true, leadId: lead.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}

export async function getAgentsForLeadForm(): Promise<
  { id: string; full_name: string }[]
> {
  try {
    const { supabase, user, role } = await getCallerProfile();

    if (role === "agent") return [];

    const { data: agents, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "agent")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) return [];

    const list = (agents ?? []) as { id: string; full_name: string }[];

    const callerAlreadyInList = list.some((a) => a.id === user.id);
    if (!callerAlreadyInList && (role === "scout" || role === "admin")) {
      const { data: self } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", user.id)
        .single();
      if (self) list.unshift(self as { id: string; full_name: string });
    }

    return list;
  } catch {
    return [];
  }
}
