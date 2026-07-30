/**
 * Plain-text builders for bulk client export (Freshdesk, profile, Chetto).
 * Mirrors formatting in components/clients/FreshdeskTab.tsx and ChettoTab.tsx.
 */

import { format, parseISO } from "date-fns";
import type { ChettoMessage } from "../../lib/actions/chetto";
import { getTicketConversations } from "../../lib/freshdesk/client";
import type {
  FreshdeskContact,
  FreshdeskConversation,
  FreshdeskTicket,
} from "../../lib/freshdesk/types";
import {
  mapConversationSource,
  mapPriority,
  mapStatus,
} from "../../lib/freshdesk/types";
import { formatIST } from "../../lib/utils/time";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

export function buildContactSection(contact: FreshdeskContact): string[] {
  const lines: string[] = [
    "================================================================",
    "CLIENT PROFILE",
    "================================================================",
    `Name:     ${contact.name || "—"}`,
    `Email:    ${contact.email || "—"}`,
    `Phone:    ${contact.phone || "—"}`,
    `Mobile:   ${contact.mobile || "—"}`,
    `Active:   ${contact.active ? "Yes" : "No"}`,
    `Created:  ${fmtDate(contact.created_at)}`,
    "",
    "— Personal —",
  ];
  const cf = contact.custom_fields;
  const personal: [string, string | null][] = [
    ["Birthday", cf.birthday],
    ["Anniversary", cf.anniversary],
    ["Marital Status", cf.marital_status],
    ["Blood Group", cf.blood_group],
    ["Category", cf.category],
  ];
  const prefs: [string, string | null][] = [
    ["Diet", cf.diet],
    ["Veg / Non-veg", cf.veg_non_veg],
    ["Allergies", cf.allergies],
    ["Drink", cf.drink],
    ["Food", cf.food],
    ["Restaurant", cf.restaurant],
    ["Cuisine", cf.cuisine],
    ["Flight Seat", cf.flight_seat],
    ["Stays", cf.stays],
    ["Sport", cf.sport],
    ["Favourite Brand", cf.favourite_brand],
    ["Watch", cf.watch],
    ["Car", cf.car],
    ["Country", cf.country],
  ];
  const work: [string, string | null][] = [
    ["Company / Designation", cf.company_and_designation],
    ["Instagram", cf.instagram],
    ["LinkedIn", cf.linkedin],
    ["Need Assistance With", cf.need_assistance_with],
  ];
  for (const [label, val] of personal) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  lines.push("", "— Preferences —");
  for (const [label, val] of prefs) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  lines.push("", "— Work & Social —");
  for (const [label, val] of work) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  const known = new Set([
    "category",
    "birthday",
    "marital_status",
    "anniversary",
    "sport",
    "favourite_brand",
    "watch",
    "stays",
    "flight_seat",
    "veg_non_veg",
    "allergies",
    "diet",
    "drink",
    "food",
    "restaurant",
    "cuisine",
    "country",
    "car",
    "blood_group",
    "need_assistance_with",
    "company_and_designation",
    "instagram",
    "linkedin",
    "periskope_chat_id",
  ]);
  const extras = Object.entries(cf).filter(([k, v]) => !known.has(k) && v);
  if (extras.length) {
    lines.push("", "— Other Fields —");
    for (const [k, v] of extras) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines;
}

export function buildConversationLine(c: FreshdeskConversation): string {
  const ts = fmtDate(c.created_at);
  const dir = c.incoming ? "CLIENT → Agent" : "AGENT  → Client";
  const type = c.private
    ? "NOTE (internal)"
    : mapConversationSource(c.source).toUpperCase();
  const body =
    c.body_text?.replace(/\s+/g, " ").trim() ||
    c.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
    "[no text]";
  const attachments = c.attachments.length
    ? ` [${c.attachments.length} attachment${c.attachments.length > 1 ? "s" : ""}: ${c.attachments.map((a) => a.name).join(", ")}]`
    : "";
  return `  [${ts}] ${c.private ? "NOTE (internal)" : dir} (${type}): ${body}${attachments}`;
}

export function buildTicketSection(
  ticket: FreshdeskTicket,
  conversations: FreshdeskConversation[],
  index: number,
): string[] {
  const cf = ticket.custom_fields;
  const lines: string[] = [
    "",
    "────────────────────────────────────────────────────────────────",
    `TICKET #${ticket.id} [${index + 1}] — ${ticket.subject}`,
    "────────────────────────────────────────────────────────────────",
    `Status:   ${mapStatus(ticket.status).toUpperCase()} | Priority: ${mapPriority(ticket.priority).toUpperCase()} | Type: ${ticket.type || "—"}`,
    `Created:  ${fmtDate(ticket.created_at)}`,
    `Updated:  ${fmtDate(ticket.updated_at)}`,
  ];
  if (ticket.stats?.resolved_at)
    lines.push(`Resolved: ${fmtDate(ticket.stats.resolved_at)}`);
  if (ticket.stats?.closed_at)
    lines.push(`Closed:   ${fmtDate(ticket.stats.closed_at)}`);
  if (ticket.is_escalated) lines.push("⚠ ESCALATED");
  if (ticket.tags.length) lines.push(`Tags:     ${ticket.tags.join(", ")}`);

  lines.push("", "— Request Details —");
  const fields: [string, string | null | undefined][] = [
    ["Request", cf.cf_request],
    ["Event / Service", cf.cf_events],
    ["From", cf.cf_from_location],
    ["To", cf.cf_to_location],
    ["Date", cf.cf_date],
    ["Time", cf.cf_time],
    ["Duration", cf.cf_duration],
    ["Budget", cf.cf_budget],
    ["Pax", cf.cf_pax],
    ["Location", cf.cf_location],
    ["Airport", cf.cf_airport],
    ["Luggage", cf.cf_luggage],
    ["Early Check-in", cf.cf_early_check_in],
    ["Assistance Required", cf.cf_assistance_required],
    ["Gift Specifications", cf.cf_gift_specifications],
    ["Product Details", cf.cf_product_details],
    ["POC", cf.cf_poc],
    ["Client Name (cf)", cf.cf_client_name],
    ["Queendom", cf.cf_queendom],
    ["Ticket Type", cf.cf_ticket_type],
    ["Note", cf.cf_note],
  ];
  for (const [label, val] of fields) {
    if (val) lines.push(`  ${label}: ${val}`);
  }

  if (ticket.description_text?.trim()) {
    lines.push("", "— Description —");
    lines.push(
      ticket.description_text.replace(/\s+/g, " ").trim().slice(0, 2000),
    );
  }

  if (conversations.length) {
    lines.push("", `— Conversation Thread (${conversations.length} messages) —`);
    for (const c of conversations) {
      lines.push(buildConversationLine(c));
    }
  } else {
    lines.push("", "  [No conversation thread]");
  }

  return lines;
}

export async function fetchAllConversationsForTickets(
  tickets: FreshdeskTicket[],
): Promise<Map<number, FreshdeskConversation[]>> {
  const result = new Map<number, FreshdeskConversation[]>();
  const batchSize = 10;
  const retryDelays = [1000, 2000, 4000];

  async function fetchWithRetry(
    ticketId: number,
  ): Promise<FreshdeskConversation[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        return await getTicketConversations(ticketId);
      } catch (e) {
        lastError = e;
        const status =
          e instanceof Error
            ? Number(e.message.match(/\(status (\d+)\)/)?.[1])
            : NaN;
        if (status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, retryDelays[attempt] ?? 4000));
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((t) => fetchWithRetry(t.id)),
    );
    for (let j = 0; j < batch.length; j++) {
      const ticket = batch[j]!;
      const res = settled[j]!;
      if (res.status === "fulfilled") {
        result.set(ticket.id, res.value);
      } else {
        result.set(ticket.id, []);
      }
    }
  }
  return result;
}

export async function buildFreshdeskExportText(params: {
  clientName: string;
  contact: FreshdeskContact;
  tickets: FreshdeskTicket[];
  skipConversations?: boolean;
}): Promise<string> {
  const { clientName, contact, tickets, skipConversations } = params;
  const conversationsMap = skipConversations
    ? new Map<number, FreshdeskConversation[]>()
    : await fetchAllConversationsForTickets(tickets);

  const lines: string[] = [
    `Freshdesk Export — ${clientName}`,
    `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
    `Tickets: ${tickets.length}`,
    "",
    ...buildContactSection(contact),
    "",
    "================================================================",
    `SERVICE HISTORY — ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`,
    "================================================================",
  ];

  tickets.forEach((ticket, i) => {
    const convos = conversationsMap.get(ticket.id) ?? [];
    lines.push(...buildTicketSection(ticket, convos, i));
  });

  return lines.join("\n");
}

export type ExportClientProfile = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  chetto_group_id: string | null;
  email: string | null;
  queendom: string | null;
  former_queendom: string | null;
  client_status: string;
  membership_type: string | null;
  membership_start: string | null;
  membership_end: string | null;
  membership_amount_paid: number | null;
  membership_interval: string | null;
  membership_status: string | null;
  external_id: string | null;
  assigned_agent_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profile: {
    personality_type: string | null;
    date_of_birth: string | null;
    blood_group: string | null;
    marital_status: string | null;
    wedding_anniversary: string | null;
    primary_city: string | null;
    company_designation: string | null;
    social_handles: string | null;
    travel: unknown;
    lifestyle: unknown;
    passions: unknown;
    elia_notes: unknown;
    elia_profile: unknown;
    elia_version: number | null;
    elia_analyzed_at: string | null;
    elia_messages_through: string | null;
    profile_completeness: number | null;
    last_enriched_at: string | null;
    updated_at: string | null;
  } | null;
};

function field(label: string, value: unknown): string {
  if (value == null || value === "") return `  ${label}: —`;
  return `  ${label}: ${String(value)}`;
}

function objectSection(title: string, obj: unknown): string[] {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return [];
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return [];
  const lines = [`— ${title} —`];
  for (const k of keys) {
    const v = rec[k];
    if (v == null || v === "") continue;
    if (typeof v === "object") {
      lines.push(`  ${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`  ${k}: ${String(v)}`);
    }
  }
  return lines;
}

export function buildProfileExportText(client: ExportClientProfile): string {
  const fullName = [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const p = client.profile;

  const lines: string[] = [
    `Atlas Profile Export — ${fullName || "Client"}`,
    `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
    `Client ID: ${client.id}`,
    "",
    "================================================================",
    "IDENTITY",
    "================================================================",
    field("Name", fullName),
    field("Phone", client.phone_number),
    field("Email", client.email),
    field("Queendom", client.queendom),
    field("Former Queendom", client.former_queendom),
    field("Status", client.client_status),
    field("Chetto Group ID", client.chetto_group_id),
    field("External ID", client.external_id),
    field("Assigned Agent ID", client.assigned_agent_id),
    field("Created", fmtDate(client.created_at)),
    field("Updated", fmtDate(client.updated_at)),
    "",
    "================================================================",
    "MEMBERSHIP",
    "================================================================",
    field("Type", client.membership_type),
    field("Status", client.membership_status),
    field("Interval", client.membership_interval),
    field("Start", client.membership_start),
    field("End", client.membership_end),
    field("Amount Paid", client.membership_amount_paid),
  ];

  if (client.notes?.trim()) {
    lines.push(
      "",
      "================================================================",
      "NOTES",
      "================================================================",
      client.notes.trim(),
    );
  }

  if (p) {
    lines.push(
      "",
      "================================================================",
      "CLIENT PROFILE",
      "================================================================",
      field("Personality Type", p.personality_type),
      field("Date of Birth", p.date_of_birth),
      field("Blood Group", p.blood_group),
      field("Marital Status", p.marital_status),
      field("Wedding Anniversary", p.wedding_anniversary),
      field("Primary City", p.primary_city),
      field("Company / Designation", p.company_designation),
      field("Social Handles", p.social_handles),
      field("Profile Completeness", p.profile_completeness),
      field("Last Enriched", fmtDate(p.last_enriched_at)),
      field("Profile Updated", fmtDate(p.updated_at)),
    );

    const travel = objectSection("Travel", p.travel);
    if (travel.length) lines.push("", ...travel);

    const lifestyle = objectSection("Lifestyle", p.lifestyle);
    if (lifestyle.length) lines.push("", ...lifestyle);

    const passions = objectSection("Passions", p.passions);
    if (passions.length) lines.push("", ...passions);

    const eliaNotes = objectSection("Elia Notes", p.elia_notes);
    if (eliaNotes.length) lines.push("", ...eliaNotes);

    if (p.elia_profile != null) {
      lines.push("", "— Elia Intelligence Profile —");
      lines.push(JSON.stringify(p.elia_profile, null, 2));
      lines.push(
        field("Elia Version", p.elia_version),
        field("Elia Analyzed At", fmtDate(p.elia_analyzed_at)),
        field("Elia Messages Through", p.elia_messages_through),
      );
    }
  } else {
    lines.push(
      "",
      "================================================================",
      "CLIENT PROFILE",
      "================================================================",
      "  No client_profiles row on file.",
    );
  }

  return lines.join("\n");
}

function normalizePhoneDigits(phone: string | null): string {
  return phone?.replace(/\D/g, "") ?? "";
}

function parseMessageDate(ts: string | null): Date | null {
  if (!ts) return null;
  const n = Number(ts);
  if (!Number.isNaN(n)) {
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  try {
    return parseISO(ts);
  } catch {
    return null;
  }
}

function sortMessages(list: ChettoMessage[]): ChettoMessage[] {
  return [...list].sort((a, b) => {
    const da = parseMessageDate(a.timestamp)?.getTime() ?? 0;
    const db = parseMessageDate(b.timestamp)?.getTime() ?? 0;
    return da - db;
  });
}

export function formatChettoMessagesText(
  messages: ChettoMessage[],
  meta?: { groupId: string; groupName?: string | null },
): string {
  const sorted = sortMessages(messages);
  const header = [
    "Chetto WhatsApp Export",
    meta?.groupName ? `Group: ${meta.groupName}` : null,
    meta?.groupId ? `Group ID: ${meta.groupId}` : null,
    `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
    `Messages: ${sorted.length}`,
    "",
  ].filter((l): l is string => l != null);

  const body = sorted.map((m) => {
    const d = parseMessageDate(m.timestamp);
    const ts = d ? formatIST(d, "yyyy-MM-dd HH:mm:ss") : "unknown";
    const sender = m.from_me
      ? "Agent"
      : m.sender_name?.trim() ||
        (m.phone_no ? `+${normalizePhoneDigits(m.phone_no)}` : "Unknown");
    const text = m.text?.trim() || "[Media]";
    return `[${ts}] ${sender}: ${text}`;
  });

  return [...header, ...body].join("\n");
}
