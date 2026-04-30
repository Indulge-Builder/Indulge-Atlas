"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { LeadCollaborator, UserRole } from "@/lib/types/database";

const uuidSchema = z.string().uuid();

export interface LeadCollaboratorActionResult {
  success: boolean;
  error?: string;
}

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const role = ((profile as { role: string } | null)?.role ?? "agent") as UserRole;
  const domain =
    (profile as { domain?: string } | null)?.domain ?? "indulge_concierge";
  return { supabase, user, role, domain };
}

function canManageCollaboratorsOnLead(params: {
  role: UserRole;
  userDomain: string;
  userId: string;
  lead: { domain: string; assigned_to: string | null };
}): boolean {
  const { role, userDomain, userId, lead } = params;
  if (role === "admin" || role === "founder") return true;
  if (role === "manager" && lead.domain === userDomain) return true;
  if (role === "agent" && lead.assigned_to === userId && lead.domain === userDomain)
    return true;
  return false;
}

export async function listLeadCollaborators(leadId: string): Promise<LeadCollaborator[]> {
  const parsed = uuidSchema.safeParse(leadId);
  if (!parsed.success) return [];

  const { supabase } = await getAuthUser();
  const { data, error } = await supabase
    .from("lead_collaborators")
    .select(
      "id, lead_id, user_id, added_by, created_at, profile:profiles!lead_collaborators_user_id_fkey(id, full_name, email, department, domain, job_title)",
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as LeadCollaborator[];
}

export async function searchProfilesForCollaboration(params: {
  query: string;
  excludeUserIds?: string[];
}): Promise<
  Array<{
    id: string;
    full_name: string;
    email: string | null;
    department: string | null;
    domain: string | null;
    job_title: string | null;
  }>
> {
  const raw = params.query.trim().replace(/[()%]/g, "");
  if (raw.length < 2) return [];

  const { supabase, user } = await getAuthUser();
  const exclude = new Set([user.id, ...(params.excludeUserIds ?? [])]);
  const pattern = `%${raw}%`;

  const [byName, byEmail] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, department, domain, job_title")
      .eq("is_active", true)
      .ilike("full_name", pattern)
      .limit(16),
    supabase
      .from("profiles")
      .select("id, full_name, email, department, domain, job_title")
      .eq("is_active", true)
      .ilike("email", pattern)
      .limit(16),
  ]);

  const merged = new Map<
    string,
    {
      id: string;
      full_name: string;
      email: string | null;
      department: string | null;
      domain: string | null;
      job_title: string | null;
    }
  >();
  for (const row of [...(byName.data ?? []), ...(byEmail.data ?? [])]) {
    if (!exclude.has(row.id)) merged.set(row.id, row as never);
  }
  return Array.from(merged.values()).slice(0, 24);
}

export async function addLeadCollaborator(
  leadId: string,
  targetUserId: string,
): Promise<LeadCollaboratorActionResult> {
  try {
    const leadParse = uuidSchema.safeParse(leadId);
    const userParse = uuidSchema.safeParse(targetUserId);
    if (!leadParse.success || !userParse.success) {
      return { success: false, error: "Invalid id" };
    }

    const { supabase, user, role, domain } = await getAuthUser();

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, domain, assigned_to")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) return { success: false, error: "Lead not found" };

    if (
      !canManageCollaboratorsOnLead({
        role,
        userDomain: domain,
        userId: user.id,
        lead: {
          domain: (lead as { domain: string }).domain,
          assigned_to: (lead as { assigned_to: string | null }).assigned_to,
        },
      })
    ) {
      return { success: false, error: "You cannot add collaborators on this lead" };
    }

    if (targetUserId === (lead as { assigned_to: string | null }).assigned_to) {
      return { success: false, error: "Assigned agent already has full access" };
    }

    const { error: insertErr } = await supabase.from("lead_collaborators").insert({
      lead_id: leadId,
      user_id: targetUserId,
      added_by: user.id,
    });

    if (insertErr) {
      if (insertErr.code === "23505") {
        return { success: false, error: "This person already collaborates on this lead" };
      }
      return { success: false, error: "Could not add collaborator" };
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function removeLeadCollaborator(
  leadId: string,
  targetUserId: string,
): Promise<LeadCollaboratorActionResult> {
  try {
    const leadParse = uuidSchema.safeParse(leadId);
    const userParse = uuidSchema.safeParse(targetUserId);
    if (!leadParse.success || !userParse.success) {
      return { success: false, error: "Invalid id" };
    }

    const { supabase, user, role, domain } = await getAuthUser();

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, domain, assigned_to")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) return { success: false, error: "Lead not found" };

    if (
      !canManageCollaboratorsOnLead({
        role,
        userDomain: domain,
        userId: user.id,
        lead: {
          domain: (lead as { domain: string }).domain,
          assigned_to: (lead as { assigned_to: string | null }).assigned_to,
        },
      })
    ) {
      return { success: false, error: "You cannot remove collaborators on this lead" };
    }

    const { error: delErr } = await supabase
      .from("lead_collaborators")
      .delete()
      .eq("lead_id", leadId)
      .eq("user_id", targetUserId);

    if (delErr) return { success: false, error: "Could not remove collaborator" };

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}
