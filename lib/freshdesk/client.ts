import type {
  FreshdeskAttachment,
  FreshdeskContact,
  FreshdeskConversation,
  FreshdeskTicket,
} from "@/lib/freshdesk/types";

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

/** Filter contacts by phone field (Freshdesk `?phone=` param). */
async function filterByPhone(phone: string): Promise<FreshdeskContact[]> {
  const { ok, json } = await freshdeskGet("/contacts", { phone, per_page: "10" });
  if (!ok) return [];
  return parseContactList(json);
}

/** Filter contacts by mobile field (Freshdesk `?mobile=` param). */
async function filterByMobile(mobile: string): Promise<FreshdeskContact[]> {
  const { ok, json } = await freshdeskGet("/contacts", { mobile, per_page: "10" });
  if (!ok) return [];
  return parseContactList(json);
}

/**
 * Search contacts via the beta search API (`/api/v2/search/contacts`).
 * Supports `phone:'value'` and `mobile:'value'` query syntax.
 * This handles special characters like `+` better than the filter params.
 */
async function searchByPhoneQuery(phone: string): Promise<FreshdeskContact[]> {
  const safe = phone.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  // Try phone field first, then mobile field — both in one OR query
  const query = `(phone:'${safe}' OR mobile:'${safe}')`;
  const url = new URL(`${FRESHDESK_BASE}/search/contacts`);
  url.searchParams.set("query", `"${query}"`);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: getBasicAuthHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  let json: unknown = null;
  try { json = await res.json(); } catch { return []; }
  // Search API returns { total: number, results: [...] }
  const results = (json as Record<string, unknown>)?.results;
  return parseContactList(results);
}

/** Name search via Freshdesk contacts query string. */
export async function searchContactsByName(
  fullName: string,
): Promise<FreshdeskContact[]> {
  const safe = fullName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = `name:'${safe}'`;
  const { ok, json } = await freshdeskGet("/contacts", { query, per_page: "10" });
  if (!ok) return [];
  return parseContactList(json);
}

/** Build phone number variants to try (with and without +91 prefix). */
function phoneVariants(phone: string): string[] {
  const variants: string[] = [phone];
  if (phone.startsWith("+91") && phone.length > 3) {
    variants.push(phone.slice(3)); // national: 9876543210
    variants.push("0" + phone.slice(3)); // with leading 0: 09876543210
  } else if (/^\d{10}$/.test(phone)) {
    variants.push("+91" + phone); // add +91
    variants.push("0" + phone);   // add leading 0
  }
  return [...new Set(variants)];
}

export async function listTicketsForRequester(
  requesterId: number,
  options?: { includeRequester?: boolean },
): Promise<FreshdeskTicket[]> {
  const includeRequester = options?.includeRequester !== false;
  const allTickets: FreshdeskTicket[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { ok, json, status } = await freshdeskGet("/tickets", {
      requester_id: String(requesterId),
      per_page: String(perPage),
      page: String(page),
      include: includeRequester ? "requester,stats" : "stats",
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
    const variants = phoneVariants(phone);

    // 1. Try the beta search API first — handles `+` correctly and checks both phone + mobile fields
    for (const variant of variants) {
      const found = await searchByPhoneQuery(variant);
      if (found.length) return found[0]!;
    }

    // 2. Fall back to the simpler ?phone= and ?mobile= filter params for each variant
    for (const variant of variants) {
      const byPhone = await filterByPhone(variant);
      if (byPhone.length) return byPhone[0]!;
      const byMobile = await filterByMobile(variant);
      if (byMobile.length) return byMobile[0]!;
    }
  }

  // 3. Last resort: name lookup
  const fullName = [params.firstName, params.lastName]
    .filter((s) => s && String(s).trim() !== "")
    .map((s) => String(s).trim())
    .join(" ");
  if (fullName.trim()) {
    const byName = await searchContactsByName(fullName);
    if (byName.length) return byName[0]!;
  }

  return null;
}

function parseAttachment(raw: Record<string, unknown>): FreshdeskAttachment {
  return {
    id: typeof raw.id === "number" ? raw.id : 0,
    name: typeof raw.name === "string" ? raw.name : "",
    content_type:
      typeof raw.content_type === "string" ? raw.content_type : "",
    size: typeof raw.size === "number" ? raw.size : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    attachment_url:
      typeof raw.attachment_url === "string" ? raw.attachment_url : "",
    thumb_url:
      typeof raw.thumb_url === "string" ? raw.thumb_url : null,
  };
}

function parseConversation(
  raw: Record<string, unknown>,
): FreshdeskConversation | null {
  const id = raw.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;

  const attachments: FreshdeskAttachment[] = [];
  if (Array.isArray(raw.attachments)) {
    for (const a of raw.attachments) {
      if (a && typeof a === "object")
        attachments.push(parseAttachment(a as Record<string, unknown>));
    }
  }

  const toEmails: string[] = [];
  if (Array.isArray(raw.to_emails)) {
    for (const e of raw.to_emails) {
      if (typeof e === "string") toEmails.push(e);
    }
  }

  return {
    id,
    ticket_id:
      typeof raw.ticket_id === "number" ? raw.ticket_id : 0,
    body: typeof raw.body === "string" ? raw.body : "",
    body_text: typeof raw.body_text === "string" ? raw.body_text : "",
    incoming: Boolean(raw.incoming),
    private: Boolean(raw.private),
    source: typeof raw.source === "number" ? raw.source : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
    from_email:
      typeof raw.from_email === "string" ? raw.from_email : null,
    support_email:
      typeof raw.support_email === "string" ? raw.support_email : null,
    to_emails: toEmails,
    attachments,
    user_id: typeof raw.user_id === "number" ? raw.user_id : null,
    auto_response: Boolean(raw.auto_response),
  };
}

/** Fetch all conversations (replies + notes) for a ticket, oldest-first. */
export async function getTicketConversations(
  ticketId: number,
): Promise<FreshdeskConversation[]> {
  const allConversations: FreshdeskConversation[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { ok, json, status } = await freshdeskGet(
      `/tickets/${ticketId}/conversations`,
      { per_page: String(perPage), page: String(page) },
    );

    if (!ok) {
      throw new Error(
        `Freshdesk conversations fetch failed (status ${status})`,
      );
    }

    if (!Array.isArray(json)) break;

    for (const item of json) {
      if (!item || typeof item !== "object") continue;
      const c = parseConversation(item as Record<string, unknown>);
      if (c) allConversations.push(c);
    }

    if (json.length < perPage) break;
    page += 1;
  }

  return allConversations;
}
