"use server";

import { getAuthUser } from "@/lib/auth/getAuthUser";
import {
  isPrivilegedRole,
  CONCIERGE_GROUP_LABELS,
  CONCIERGE_PRIORITY_LABELS,
  CONCIERGE_TICKET_PRIORITIES,
} from "@/lib/types/database";
import type {
  ConciergeGroup,
  ConciergeTicketPriority,
  ConciergeSlaReport,
  SlaReportFilters,
  SlaBucket,
  SlaBreakdownRow,
  SlaPriorityRow,
} from "@/lib/types/database";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// Access: admin/founder/super_admin + concierge managers + finance (read-only).
// RLS on concierge_tickets scopes concierge managers to their own queendom automatically.

type SlaState = "met" | "breached" | "pending";

interface TicketRow {
  id: string;
  org_group: ConciergeGroup;
  priority: ConciergeTicketPriority;
  category_id: string;
  assigned_to: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  is_overdue: boolean;
  category?: { name: string } | null;
  assignee?: { id: string; full_name: string } | null;
}

function firstResponseState(t: TicketRow, now: number): SlaState {
  if (!t.sla_first_response_due) return "pending";
  const due = new Date(t.sla_first_response_due).getTime();
  if (t.first_response_at) return new Date(t.first_response_at).getTime() <= due ? "met" : "breached";
  return now > due ? "breached" : "pending";
}

function resolutionState(t: TicketRow, now: number): SlaState {
  if (!t.sla_resolution_due) return "pending";
  const due = new Date(t.sla_resolution_due).getTime();
  if (t.resolved_at) return new Date(t.resolved_at).getTime() <= due ? "met" : "breached";
  return now > due ? "breached" : "pending";
}

interface Counts {
  met: number;
  breached: number;
  pending: number;
}
const emptyCounts = (): Counts => ({ met: 0, breached: 0, pending: 0 });
const bump = (c: Counts, s: SlaState) => {
  c[s] += 1;
};
function toBucket(c: Counts): SlaBucket {
  const determined = c.met + c.breached;
  return {
    total: determined + c.pending,
    met: c.met,
    breached: c.breached,
    pending: c.pending,
    pctMet: determined ? Math.round((c.met / determined) * 1000) / 10 : 0,
  };
}

export async function getConciergeSlaReport(
  filters: SlaReportFilters = {},
): Promise<ActionResult<ConciergeSlaReport>> {
  try {
    const { supabase, user, role, department } = await getAuthUser();
    const privileged = isPrivilegedRole(role);
    const isConciergeManager = role === "manager" && department === "concierge";
    const isFinance = department === "finance";
    if (!privileged && !isConciergeManager && !isFinance) {
      return { success: false, error: "You don't have access to SLA reports." };
    }

    const now = Date.now();
    const to = filters.to ? new Date(filters.to) : new Date();
    const from = filters.from ? new Date(filters.from) : new Date(now - 30 * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    let q = supabase
      .from("concierge_tickets")
      .select(
        "id, org_group, priority, category_id, assigned_to, status, created_at, resolved_at, first_response_at, sla_first_response_due, sla_resolution_due, is_overdue, " +
          "category:ticket_categories!category_id(name), assignee:profiles!assigned_to(id, full_name)",
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (privileged && filters.group && filters.group !== "all") q = q.eq("org_group", filters.group);

    const { data, error } = await q;
    if (error) {
      console.error("[getConciergeSlaReport]", error);
      return { success: false, error: "Could not load the report." };
    }
    const rows = (data as unknown as TicketRow[]) ?? [];

    // Default policy targets per priority (for the by-priority table).
    const { data: policies } = await supabase
      .from("sla_policies")
      .select("priority, first_response_minutes, resolution_minutes")
      .eq("is_default", true)
      .eq("is_active", true);
    const targetByPriority = new Map<string, { fr: number; res: number }>();
    for (const p of policies ?? []) {
      if (p.priority) {
        targetByPriority.set(p.priority as string, {
          fr: p.first_response_minutes as number,
          res: p.resolution_minutes as number,
        });
      }
    }

    const overallFr = emptyCounts();
    const overallRes = emptyCounts();
    const byPriority = new Map<string, { fr: Counts; res: Counts }>();
    const byQueendom = new Map<string, { fr: Counts; res: Counts }>();
    const byCategory = new Map<string, { label: string; fr: Counts; res: Counts }>();
    const byAssignee = new Map<string, { label: string; fr: Counts; res: Counts }>();

    let created = 0;
    let resolved = 0;
    let open = 0;
    let overdue = 0;

    const ensure = (m: Map<string, { fr: Counts; res: Counts }>, k: string) => {
      let e = m.get(k);
      if (!e) {
        e = { fr: emptyCounts(), res: emptyCounts() };
        m.set(k, e);
      }
      return e;
    };

    for (const t of rows) {
      created += 1;
      if (t.status === "resolved" || t.status === "closed") resolved += 1;
      else open += 1;
      if (t.is_overdue) overdue += 1;

      const fr = firstResponseState(t, now);
      const res = resolutionState(t, now);
      bump(overallFr, fr);
      bump(overallRes, res);

      const p = ensure(byPriority, t.priority);
      bump(p.fr, fr);
      bump(p.res, res);

      const g = ensure(byQueendom, t.org_group);
      bump(g.fr, fr);
      bump(g.res, res);

      let c = byCategory.get(t.category_id);
      if (!c) {
        c = { label: t.category?.name ?? "Uncategorized", fr: emptyCounts(), res: emptyCounts() };
        byCategory.set(t.category_id, c);
      }
      bump(c.fr, fr);
      bump(c.res, res);

      const aKey = t.assigned_to ?? "__unassigned__";
      let a = byAssignee.get(aKey);
      if (!a) {
        a = { label: t.assignee?.full_name ?? "Unassigned", fr: emptyCounts(), res: emptyCounts() };
        byAssignee.set(aKey, a);
      }
      bump(a.fr, fr);
      bump(a.res, res);
    }

    const byPriorityRows: SlaPriorityRow[] = CONCIERGE_TICKET_PRIORITIES.map((pr) => {
      const e = byPriority.get(pr) ?? { fr: emptyCounts(), res: emptyCounts() };
      const tgt = targetByPriority.get(pr);
      return {
        key: pr,
        label: CONCIERGE_PRIORITY_LABELS[pr],
        priority: pr,
        responseTargetMinutes: tgt?.fr ?? null,
        resolutionTargetMinutes: tgt?.res ?? null,
        firstResponse: toBucket(e.fr),
        resolution: toBucket(e.res),
      };
    });

    const byQueendomRows: SlaBreakdownRow[] = (Object.keys(CONCIERGE_GROUP_LABELS) as ConciergeGroup[]).map(
      (g) => {
        const e = byQueendom.get(g) ?? { fr: emptyCounts(), res: emptyCounts() };
        return { key: g, label: CONCIERGE_GROUP_LABELS[g], firstResponse: toBucket(e.fr), resolution: toBucket(e.res) };
      },
    );

    const byCategoryRows: SlaBreakdownRow[] = [...byCategory.entries()]
      .map(([k, e]) => ({ key: k, label: e.label, firstResponse: toBucket(e.fr), resolution: toBucket(e.res) }))
      .sort((a, b) => b.resolution.total - a.resolution.total);

    const byAssigneeRows: SlaBreakdownRow[] = [...byAssignee.entries()]
      .map(([k, e]) => ({ key: k, label: e.label, firstResponse: toBucket(e.fr), resolution: toBucket(e.res) }))
      .sort((a, b) => b.resolution.total - a.resolution.total);

    let scopedToQueendom: ConciergeGroup | null = null;
    if (isConciergeManager) {
      const { data: me } = await supabase
        .from("profiles")
        .select("concierge_group")
        .eq("id", user.id)
        .single();
      scopedToQueendom = (me?.concierge_group as ConciergeGroup | null) ?? null;
    }

    return {
      success: true,
      data: {
        range: { from: fromIso, to: toIso },
        totals: { created, resolved, open, overdue },
        firstResponse: toBucket(overallFr),
        resolution: toBucket(overallRes),
        byPriority: byPriorityRows,
        byQueendom: byQueendomRows,
        byCategory: byCategoryRows,
        byAssignee: byAssigneeRows,
        scopedToQueendom,
      },
    };
  } catch (err) {
    console.error("[getConciergeSlaReport]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
