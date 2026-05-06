import type { FreshdeskContact, FreshdeskTicket } from "@/lib/freshdesk/types";

const FRESHDESK_BASE = "https://indulge.freshdesk.com/api/v2";

function getBasicAuthHeader(): string {
  const key = process.env.FRESHDESK_API_KEY?.trim();
  if (!key) {
    throw new Error("FRESHDESK_API_KEY is not configured");
  }
  const token = Buffer.from(`${key}:X`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function emptyContactCustomFields(): FreshdeskContact["custom_fields"] {
  return {
    category: null,
    birthday: null,
    marital_status: null,
    anniversary: null,
    sport: null,
    favourite_brand: null,
    watch: null,
    stays: null,
    flight_seat: null,
    veg_non_veg: null,
    allergies: null,
    diet: null,
    drink: null,
    food: null,
    restaurant: null,
    cuisine: null,
    country: null,
    car: null,
    blood_group: null,
    need_assistance_with: null,
    company_and_designation: null,
    instagram: null,
    linkedin: null,
    periskope_chat_id: null,
  };
}

function parseContact(raw: Record<string, unknown>): FreshdeskContact | null {
  const id = raw.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  const cfRaw = raw.custom_fields;
  const mergedCf: FreshdeskContact["custom_fields"] = {
    ...emptyContactCustomFields(),
  };
  if (cfRaw && typeof cfRaw === "object" && cfRaw !== null) {
    for (const [k, v] of Object.entries(cfRaw as Record<string, unknown>)) {
      mergedCf[k] = v == null ? null : String(v);
    }
  }
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : "",
    first_name: typeof raw.first_name === "string" ? raw.first_name : null,
    last_name: typeof raw.last_name === "string" ? raw.last_name : null,
    email: typeof raw.email === "string" ? raw.email : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
    mobile: typeof raw.mobile === "string" ? raw.mobile : null,
    active: Boolean(raw.active),
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    custom_fields: mergedCf,
  };
}

function parseTicketStats(raw: unknown): FreshdeskTicket["stats"] {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    agent_responded_at:
      typeof o.agent_responded_at === "string" ? o.agent_responded_at : null,
    requester_responded_at:
      typeof o.requester_responded_at === "string"
        ? o.requester_responded_at
        : null,
    first_responded_at:
      typeof o.first_responded_at === "string" ? o.first_responded_at : null,
    resolved_at: typeof o.resolved_at === "string" ? o.resolved_at : null,
    closed_at: typeof o.closed_at === "string" ? o.closed_at : null,
  };
}

function parseTicketCustomFields(
  raw: unknown,
): FreshdeskTicket["custom_fields"] {
  const out: FreshdeskTicket["custom_fields"] = {};
  if (!raw || typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v == null ? null : String(v);
  }
  return out;
}

function parseTicket(raw: Record<string, unknown>): FreshdeskTicket | null {
  const id = raw.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : [];
  let requester: FreshdeskContact | undefined;
  if (raw.requester && typeof raw.requester === "object") {
    const c = parseContact(raw.requester as Record<string, unknown>);
    if (c) requester = c;
  }
  return {
    id,
    subject: typeof raw.subject === "string" ? raw.subject : "(No subject)",
    description: typeof raw.description === "string" ? raw.description : null,
    description_text:
      typeof raw.description_text === "string" ? raw.description_text : null,
    status: typeof raw.status === "number" ? raw.status : 2,
    priority: typeof raw.priority === "number" ? raw.priority : 2,
    type: typeof raw.type === "string" ? raw.type : null,
    source: typeof raw.source === "number" ? raw.source : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    due_by: typeof raw.due_by === "string" ? raw.due_by : null,
    fr_due_by: typeof raw.fr_due_by === "string" ? raw.fr_due_by : null,
    is_escalated: Boolean(raw.is_escalated),
    requester_id: typeof raw.requester_id === "number" ? raw.requester_id : 0,
    responder_id:
      typeof raw.responder_id === "number" ? raw.responder_id : null,
    group_id: typeof raw.group_id === "number" ? raw.group_id : null,
    tags,
    stats: parseTicketStats(raw.stats),
    custom_fields: parseTicketCustomFields(raw.custom_fields),
    requester,
  };
}

function parseContactList(payload: unknown): FreshdeskContact[] {
  if (!Array.isArray(payload)) return [];
  const out: FreshdeskContact[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const c = parseContact(item as Record<string, unknown>);
    if (c) out.push(c);
  }
  return out;
}

function parseTicketList(payload: unknown): FreshdeskTicket[] {
  if (!Array.isArray(payload)) return [];
  const out: FreshdeskTicket[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const t = parseTicket(item as Record<string, unknown>);
    if (t) out.push(t);
  }
  return out;
}

async function freshdeskGet(path: string, query: Record<string, string>) {
  const url = new URL(`${FRESHDESK_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

/** List contacts filtered by phone (Freshdesk `phone` field). */
export async function searchContactsByPhone(
  phone: string,
): Promise<FreshdeskContact[]> {
  const { ok, json } = await freshdeskGet("/contacts", {
    phone,
    per_page: "10",
  });
  if (!ok) return [];
  return parseContactList(json);
}

/** List contacts filtered by mobile. */
export async function searchContactsByMobile(
  mobile: string,
): Promise<FreshdeskContact[]> {
  const { ok, json } = await freshdeskGet("/contacts", {
    mobile,
    per_page: "10",
  });
  if (!ok) return [];
  return parseContactList(json);
}

/**
 * Name search via Freshdesk contacts query string.
 */
export async function searchContactsByName(
  fullName: string,
): Promise<FreshdeskContact[]> {
  const safe = fullName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = `name:'${safe}'`;
  const { ok, json } = await freshdeskGet("/contacts", {
    query,
    per_page: "10",
  });
  if (!ok) return [];
  return parseContactList(json);
}

export async function listTicketsForRequester(
  requesterId: number,
): Promise<FreshdeskTicket[]> {
  const allTickets: FreshdeskTicket[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { ok, json, status } = await freshdeskGet("/tickets", {
      requester_id: String(requesterId),
      per_page: String(perPage),
      page: String(page),
      include: "requester,stats",
      order_by: "created_at",
      order_type: "desc",
    });

    if (!ok) {
      throw new Error(`Freshdesk tickets fetch failed (status ${status})`);
    }

    const pageTickets = parseTicketList(json);
    if (!pageTickets.length) {
      break;
    }

    allTickets.push(...pageTickets);
    if (pageTickets.length < perPage) {
      break;
    }

    page += 1;
  }

  return allTickets;
}

export async function findFreshdeskContactForClient(params: {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<FreshdeskContact | null> {
  const phone = params.phone?.trim() ?? "";
  if (phone) {
    const byPhone = await searchContactsByPhone(phone);
    if (byPhone.length) return byPhone[0];
    const byMobile = await searchContactsByMobile(phone);
    if (byMobile.length) return byMobile[0];
  }
  const fullName = [params.firstName, params.lastName]
    .filter((s) => s && String(s).trim() !== "")
    .map((s) => String(s).trim())
    .join(" ");
  if (fullName.trim()) {
    const byName = await searchContactsByName(fullName);
    if (byName.length) return byName[0];
  }
  return null;
}
