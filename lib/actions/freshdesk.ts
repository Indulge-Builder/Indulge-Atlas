"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  findFreshdeskContactForClient,
  listTicketsForRequester,
} from "@/lib/freshdesk/client";
import type {
  ClientFreshdeskTicketsData,
  ClientFreshdeskTicketStats,
  FreshdeskTicket,
} from "@/lib/freshdesk/types";
import { mapPriority, mapStatus } from "@/lib/freshdesk/types";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return { supabase, user };
}

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
    const { data: row, error } = await supabase
      .from("clients")
      .select("phone_number, first_name, last_name")
      .eq("id", clientId)
      .maybeSingle();

    if (error || !row) {
      return { success: false, error: "Client not found" };
    }

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
          success: false,
          error:
            "Freshdesk is not configured. Add FRESHDESK_API_KEY on the server.",
        };
      }
      return {
        success: false,
        error: "Could not reach Freshdesk. Try again later.",
      };
    }

    if (!contact) {
      return {
        success: true,
        data: { found: false, tickets: [] },
      };
    }

    let tickets: FreshdeskTicket[] = [];
    try {
      tickets = await listTicketsForRequester(contact.id);
    } catch {
      return {
        success: false,
        error: "Could not load tickets from Freshdesk. Try again later.",
      };
    }

    const stats = computeTicketStats(tickets);
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
