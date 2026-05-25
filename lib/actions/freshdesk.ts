"use server";

import { unstable_cache } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import {
  findFreshdeskContactForClient,
  getTicketConversations,
  listTicketsForRequester,
} from "@/lib/freshdesk/client";
import type {
  ClientFreshdeskTicketsData,
  ClientFreshdeskTicketStats,
  FreshdeskContact,
  FreshdeskConversation,
  FreshdeskTicket,
} from "@/lib/freshdesk/types";
import { mapPriority, mapStatus } from "@/lib/freshdesk/types";
import { canManageAnyClient } from "@/lib/types/database";

export type ClientFreshdeskMetricsData = {
  found: boolean;
  stats: ClientFreshdeskTicketStats;
};

type FreshdeskClientRow = {
  phone_number: string | null;
  first_name: string | null;
  last_name: string | null;
};

type FreshdeskLoadResult =
  | { found: false; tickets: [] }
  | {
      found: true;
      contact: FreshdeskContact;
      tickets: FreshdeskTicket[];
      stats: ClientFreshdeskTicketStats;
    };


function computeTicketStats(
  tickets: FreshdeskTicket[],
): ClientFreshdeskTicketStats {
  const open = tickets.filter((t) => ![4, 5].includes(t.status)).length;
  const resolved = tickets.filter((t) => [4, 5].includes(t.status)).length;
  const last = tickets.length ? tickets[0].created_at : null;
  return {
    total: tickets.length,
    open,
    resolved,
    last_ticket_date: last,
  };
}

const clientIdSchema = z.string().uuid();

function ticketRecordForPrompt(r: Record<string, unknown>): {
  id: number;
  subject: string;
  status: number;
  priority: number;
  type: string | null;
  created_at: string;
  cf_request: string | null;
  cf_events: string | null;
  cf_from_location: string | null;
  cf_to_location: string | null;
  cf_budget: string | null;
  cf_pax: string | null;
  cf_note: string | null;
} {
  const cf =
    r.custom_fields &&
    typeof r.custom_fields === "object" &&
    r.custom_fields !== null
      ? (r.custom_fields as Record<string, unknown>)
      : {};
  const str = (k: string) => {
    const v = cf[k];
    if (v == null) return null;
    return String(v);
  };
  return {
    id: typeof r.id === "number" ? r.id : Number(r.id) || 0,
    subject: typeof r.subject === "string" ? r.subject : "",
    status: typeof r.status === "number" ? r.status : 2,
    priority: typeof r.priority === "number" ? r.priority : 2,
    type: typeof r.type === "string" ? r.type : null,
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    cf_request: str("cf_request"),
    cf_events: str("cf_events"),
    cf_from_location: str("cf_from_location"),
    cf_to_location: str("cf_to_location"),
    cf_budget: str("cf_budget"),
    cf_pax: str("cf_pax"),
    cf_note: str("cf_note"),
  };
}

function buildTicketSummaryUserPrompt(
  clientName: string,
  rows: ReturnType<typeof ticketRecordForPrompt>[],
): string {
  const lines: string[] = [
    `Analyze these ${rows.length} service tickets for ${clientName}:`,
    "",
  ];
  for (const t of rows) {
    const status = mapStatus(t.status);
    const priority = mapPriority(t.priority);
    lines.push(`Ticket #${t.id} — ${t.subject}`);
    lines.push(
      `Status: ${status} | Priority: ${priority} | Date: ${t.created_at}`,
    );
    lines.push(`Category: ${t.type ?? "—"}`);
    lines.push(`Request: ${t.cf_request ?? "—"}`);
    lines.push(`Event/Service: ${t.cf_events ?? "—"}`);
    lines.push(
      `Location: ${t.cf_from_location ?? "—"} → ${t.cf_to_location ?? "—"}`,
    );
    lines.push(`Budget: ${t.cf_budget ?? "—"}`);
    lines.push(`Pax: ${t.cf_pax ?? "—"}`);
    lines.push(`Note: ${t.cf_note ?? "—"}`);
    lines.push("---");
    lines.push("");
  }
  lines.push(`Provide:
1. RECENT INTERESTS (2-3 sentences): What has this client been requesting? What experiences/services matter to them?
2. SERVICE PATTERNS (1-2 sentences): How often do they engage? Any patterns in timing, budget, or preferences?
3. OPEN ITEMS (bullet list): Any unresolved tickets that need attention?
4. AGENT RECOMMENDATION (1-2 sentences): What should the agent know before the next interaction with this client?`);
  return lines.join("\n");
}

async function loadFreshdeskFromRow(
  row: FreshdeskClientRow,
): Promise<
  | { ok: true; data: FreshdeskLoadResult }
  | { ok: false; error: string }
> {
  const phone =
    typeof row.phone_number === "string" ? row.phone_number : null;
  const firstName =
    typeof row.first_name === "string" ? row.first_name : null;
  const lastName = typeof row.last_name === "string" ? row.last_name : null;

  let contact;
  try {
    contact = await findFreshdeskContactForClient({
      phone,
      firstName,
      lastName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Freshdesk error";
    if (msg.includes("FRESHDESK_API_KEY")) {
      return {
        ok: false,
        error:
          "Freshdesk is not configured. Add FRESHDESK_API_KEY on the server.",
      };
    }
    return {
      ok: false,
      error: "Could not reach Freshdesk. Try again later.",
    };
  }

  if (!contact) {
    return { ok: true, data: { found: false, tickets: [] } };
  }

  let tickets: FreshdeskTicket[] = [];
  try {
    tickets = await listTicketsForRequester(contact.id, {
      includeRequester: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Freshdesk] tickets fetch failed:", msg);
    return {
      ok: false,
      error: `Could not load tickets from Freshdesk: ${msg}`,
    };
  }

  const stats = computeTicketStats(tickets);
  return {
    ok: true,
    data: { found: true, contact, tickets, stats },
  };
}

function getCachedFreshdeskLoad(clientId: string, row: FreshdeskClientRow) {
  return unstable_cache(
    async () => loadFreshdeskFromRow(row),
    ["freshdesk-client-v1", clientId],
    { revalidate: 120, tags: [`freshdesk-${clientId}`] },
  );
}

/** Force-bypass the cache and reload Freshdesk data for a client. */
export async function reloadFreshdeskForClient(clientId: string): Promise<{
  success: boolean;
  data?: ClientFreshdeskTicketsData;
  error?: string;
}> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) return { success: false, error: "Invalid client" };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    const auth = await getAuthUser();
    supabase = auth.supabase;
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  const rowRes = await getClientRowForFreshdesk(supabase, clientId);
  if (!rowRes.ok) return { success: false, error: rowRes.error };

  const loaded = await loadFreshdeskFromRow(rowRes.row);
  if (!loaded.ok) return { success: false, error: loaded.error };
  if (!loaded.data.found) return { success: true, data: { found: false, tickets: [] } };

  const { contact, tickets, stats } = loaded.data;
  return { success: true, data: { found: true, contact, tickets, stats } };
}

async function getClientRowForFreshdesk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
): Promise<
  | { ok: true; row: FreshdeskClientRow }
  | { ok: false; error: string }
> {
  const { data: row, error } = await supabase
    .from("clients")
    .select("phone_number, first_name, last_name")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "Client not found" };
  }
  return { ok: true, row: row as FreshdeskClientRow };
}

/** Lightweight metrics for Overview — cached 2 min per client. */
export async function getClientFreshdeskMetrics(clientId: string): Promise<{
  success: boolean;
  data?: ClientFreshdeskMetricsData;
  error?: string;
}> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { success: false, error: "Invalid client" };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    const auth = await getAuthUser();
    supabase = auth.supabase;
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const rowRes = await getClientRowForFreshdesk(supabase, clientId);
    if (!rowRes.ok) {
      return { success: false, error: rowRes.error };
    }

    const loaded = await getCachedFreshdeskLoad(clientId, rowRes.row)();
    if (!loaded.ok) {
      return { success: false, error: loaded.error };
    }
    if (!loaded.data.found) {
      return {
        success: true,
        data: {
          found: false,
          stats: {
            total: 0,
            open: 0,
            resolved: 0,
            last_ticket_date: null,
          },
        },
      };
    }
    return {
      success: true,
      data: { found: true, stats: loaded.data.stats },
    };
  } catch {
    return {
      success: false,
      error: "Something went wrong loading Freshdesk metrics.",
    };
  }
}

export async function getClientFreshdeskTickets(clientId: string): Promise<{
  success: boolean;
  data?: ClientFreshdeskTicketsData;
  error?: string;
}> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { success: false, error: "Invalid client" };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    const auth = await getAuthUser();
    supabase = auth.supabase;
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const rowRes = await getClientRowForFreshdesk(supabase, clientId);
    if (!rowRes.ok) {
      return { success: false, error: rowRes.error };
    }

    const loaded = await getCachedFreshdeskLoad(clientId, rowRes.row)();
    if (!loaded.ok) {
      return { success: false, error: loaded.error };
    }
    if (!loaded.data.found) {
      return {
        success: true,
        data: { found: false, tickets: [] },
      };
    }

    const { contact, tickets, stats } = loaded.data;
    return {
      success: true,
      data: {
        found: true,
        contact,
        tickets,
        stats,
      },
    };
  } catch {
    return {
      success: false,
      error: "Something went wrong loading Freshdesk data.",
    };
  }
}

const SYSTEM_PROMPT =
  "You are Elia, the concierge intelligence for Indulge — a luxury lifestyle membership company. Analyze these service tickets for a client and provide a structured summary. Be concise, insightful, and focus on patterns that help the team serve this client better.";

export async function getTicketAISummary(
  clientId: string,
  clientName: string,
  tickets: FreshdeskTicket[],
): Promise<{ success: boolean; data?: string; error?: string }> {
  const parsedId = clientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { success: false, error: "Invalid client" };
  }

  const name = clientName.trim() || "Client";
  if (!tickets.length) {
    return { success: false, error: "No tickets to analyse" };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    const auth = await getAuthUser();
    supabase = auth.supabase;
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  const { data: exists, error: exErr } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (exErr || !exists) {
    return { success: false, error: "Client not found" };
  }

  const slice = tickets
    .slice(0, 10)
    .filter(
      (t) =>
        t &&
        typeof t === "object" &&
        typeof (t as FreshdeskTicket).id === "number",
    )
    .map((t) => ticketRecordForPrompt(t as unknown as Record<string, unknown>));
  if (!slice.length) {
    return { success: false, error: "No tickets to analyse" };
  }

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return {
      success: false,
      error: "AI summary is not configured (missing ANTHROPIC_API_KEY).",
    };
  }

  const userMessage = buildTicketSummaryUserPrompt(name, slice);

  try {
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        stream: false,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!ar.ok) {
      return {
        success: false,
        error: "Elia could not reach the AI service. Try again later.",
      };
    }

    const result = (await ar.json()) as { content?: { text?: string }[] };
    const text = result.content?.[0]?.text ?? "No response received.";
    return { success: true, data: text };
  } catch {
    return {
      success: false,
      error: "Elia couldn't analyse these tickets right now.",
    };
  }
}

// ── Freshdesk unmapped clients ────────────────────────────────

export type FreshdeskClientCheckRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  queendom: string | null;
  membership_type: string | null;
  client_status: string;
};

const freshdeskPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(30).default(20),
  search: z.string().max(120).optional(),
});

/**
 * Returns a paginated list of clients that have a phone number but no
 * matching Freshdesk contact. Each call probes Freshdesk for the batch
 * of clients on the requested page.
 *
 * Restricted to admin / founder / super_admin / manager.
 */
export async function getFreshdeskUnmappedClients(
  raw: Partial<z.infer<typeof freshdeskPageSchema>> = {},
): Promise<{
  success: boolean;
  clients: FreshdeskClientCheckRow[];
  checkedCount: number;
  totalWithPhone: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  error?: string;
}> {
  const EMPTY = {
    success: false,
    clients: [],
    checkedCount: 0,
    totalWithPhone: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  };

  try {
    const parsed = freshdeskPageSchema.safeParse(raw);
    const f = parsed.success ? parsed.data : { page: 1, pageSize: 20 };
    const { page, pageSize } = f;

    let supabase: Awaited<ReturnType<typeof createClient>>;
    let role: string;
    try {
      const auth = await getAuthUser();
      supabase = auth.supabase;
      role = auth.role;
    } catch {
      return { ...EMPTY, error: "Unauthenticated" };
    }

    if (!canManageAnyClient(role)) {
      return { ...EMPTY, error: "Unauthorised" };
    }

    // Fetch clients that have a phone number (only these can be checked against Freshdesk)
    let query = supabase
      .from("clients")
      .select(
        "id, first_name, last_name, phone_number, queendom, membership_type, client_status",
        { count: "exact" },
      )
      .not("phone_number", "is", null)
      .neq("phone_number", "");

    if (f.search && f.search.trim() !== "") {
      const q = f.search.replace(/[(),'"%_]/g, "").trim();
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          `first_name.ilike.${like},last_name.ilike.${like},phone_number.ilike.${like}`,
        );
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("first_name", { ascending: true })
      .range(from, to);

    if (error) {
      return { ...EMPTY, error: "Failed to load clients" };
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const totalWithPhone = count ?? 0;

    // Probe Freshdesk for each client in this page batch (parallel, capped)
    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const clientRow: FreshdeskClientRow = {
          phone_number: (row.phone_number as string | null) ?? null,
          first_name: (row.first_name as string | null) ?? null,
          last_name: (row.last_name as string | null) ?? null,
        };
        const res = await loadFreshdeskFromRow(clientRow);
        return { row, found: res.ok && res.data.found };
      }),
    );

    const unmapped: FreshdeskClientCheckRow[] = [];
    for (const settled of results) {
      if (settled.status === "fulfilled" && !settled.value.found) {
        const row = settled.value.row;
        unmapped.push({
          id: String(row.id),
          first_name: String(row.first_name ?? ""),
          last_name: (row.last_name as string | null) ?? null,
          phone_number: (row.phone_number as string | null) ?? null,
          queendom: (row.queendom as string | null) ?? null,
          membership_type: (row.membership_type as string | null) ?? null,
          client_status: String(row.client_status ?? "unknown"),
        });
      }
    }

    return {
      success: true,
      clients: unmapped,
      checkedCount: rows.length,
      totalWithPhone,
      page,
      pageSize,
      hasMore: to < totalWithPhone - 1,
    };
  } catch (e) {
    console.error("getFreshdeskUnmappedClients", e);
    return { ...EMPTY, error: "Unexpected error" };
  }
}

const ticketIdSchema = z.number().int().positive();

export async function getTicketConversationsAction(
  clientId: string,
  ticketId: number,
): Promise<{ success: boolean; data?: FreshdeskConversation[]; error?: string }> {
  const parsedClientId = clientIdSchema.safeParse(clientId);
  if (!parsedClientId.success) {
    return { success: false, error: "Invalid client" };
  }
  const parsedTicketId = ticketIdSchema.safeParse(ticketId);
  if (!parsedTicketId.success) {
    return { success: false, error: "Invalid ticket ID" };
  }

  try {
    await getAuthUser();
  } catch {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const conversations = await getTicketConversations(ticketId);
    return { success: true, data: conversations };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Freshdesk error";
    if (msg.includes("FRESHDESK_API_KEY")) {
      return {
        success: false,
        error: "Freshdesk is not configured.",
      };
    }
    return {
      success: false,
      error: "Could not load conversations. Try again later.",
    };
  }
}
