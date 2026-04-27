"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";

export type OmniSearchLeadItem = {
  type: "lead";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type OmniSearchTaskItem = {
  type: "task";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type OmniSearchTeamItem = {
  type: "team";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type GlobalOmniSearchResult = {
  leads: OmniSearchLeadItem[];
  tasks: OmniSearchTaskItem[];
  team: OmniSearchTeamItem[];
};

function sanitizeQuery(raw: string): string {
  return raw.trim().replace(/[%_,]/g, "").slice(0, 80);
}

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as UserRole | undefined) ?? "agent";
  return { supabase, userId: user.id, role };
}

export async function globalOmniSearch(
  query: string,
): Promise<GlobalOmniSearchResult> {
  const safe = sanitizeQuery(query);
  if (safe.length < 2) {
    return { leads: [], tasks: [], team: [] };
  }

  const { supabase, userId, role } = await getSessionContext();
  const pattern = `%${safe}%`;
  const canSearchTeam = role === "admin" || role === "founder" || role === "manager";

  const leadsPromise = supabase
    .from("leads")
    .select("id, first_name, last_name, email, phone_number, status")
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone_number.ilike.${pattern},secondary_phone.ilike.${pattern}`,
    )
    .limit(5);

  const tasksPromise = supabase
    .from("tasks")
    .select(
      "id, title, due_date, lead:leads!lead_id(first_name, last_name)",
    )
    .contains("assigned_to_users", [userId])
    .ilike("title", pattern)
    .order("due_date", { ascending: true })
    .limit(3);

  const teamPromise = canSearchTeam
    ? supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .ilike("full_name", pattern)
        .limit(3)
    : Promise.resolve({ data: null, error: null } as const);

  const [leadsRes, tasksRes, teamRes] = await Promise.all([
    leadsPromise,
    tasksPromise,
    teamPromise,
  ]);

  const leads: OmniSearchLeadItem[] = (leadsRes.error ? [] : leadsRes.data ?? []).map(
    (row) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      const subtitle =
        [row.email, row.phone_number].filter(Boolean).join(" · ") || row.status;
      return {
        type: "lead" as const,
        id: row.id,
        title: name || "Lead",
        subtitle: subtitle || null,
        href: `/leads/${row.id}`,
      };
    },
  );

  const tasks: OmniSearchTaskItem[] = (tasksRes.error ? [] : tasksRes.data ?? []).map(
    (row) => {
      const lead = row.lead as unknown as
        | { first_name: string; last_name: string | null }
        | null;
      const leadBit = lead
        ? [lead.first_name, lead.last_name].filter(Boolean).join(" ")
        : null;
      return {
        type: "task" as const,
        id: row.id,
        title: row.title,
        subtitle: leadBit,
        href: "/tasks",
      };
    },
  );

  let team: OmniSearchTeamItem[] = [];
  if (canSearchTeam && !teamRes.error && teamRes.data) {
    team = teamRes.data.map((row) => ({
      type: "team" as const,
      id: row.id,
      title: row.full_name,
      subtitle: row.email ?? row.role,
      href: "/manager/team",
    }));
  }

  return { leads, tasks, team };
}
