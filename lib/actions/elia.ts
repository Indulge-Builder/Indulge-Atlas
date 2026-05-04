"use server";

import { format } from "date-fns";
import { z } from "zod";
import {
  findFreshdeskContactForClient,
  listTicketsForRequester,
} from "@/lib/freshdesk/client";
import { createClient } from "@/lib/supabase/server";
import type {
  ClientLifestyleProfile,
  ClientPassionsProfile,
  ClientTravelProfile,
} from "@/lib/types/database";

type ClientProfileRow = {
  personality_type: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: string | null;
  primary_city: string | null;
  company_designation: string | null;
  social_handles: string | null;
  travel: ClientTravelProfile;
  lifestyle: ClientLifestyleProfile;
  passions: ClientPassionsProfile;
  profile_completeness: number;
};

type ClientContextRow = {
  first_name: string;
  last_name: string | null;
  queendom: string | null;
  client_status: string;
  membership_type: string | null;
  membership_start: string | null;
  membership_end: string | null;
  membership_amount_paid: number | null;
  notes: string | null;
  client_profiles: ClientProfileRow | ClientProfileRow[] | null;
};

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return format(new Date(d), "yyyy-MM-dd");
  } catch {
    return d;
  }
}

function joinList(v: string[] | undefined): string | null {
  if (!v?.length) return null;
  const t = v.map((x) => x.trim()).filter(Boolean);
  return t.length ? t.join(", ") : null;
}

function profileFromRow(
  row: ClientContextRow,
): ClientProfileRow | null {
  const raw = row.client_profiles;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function serializeClient(row: ClientContextRow): string {
  const cp = profileFromRow(row);
  const completeness = cp?.profile_completeness ?? 0;
  const lines: string[] = [];

  const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ");
  lines.push(`CLIENT: ${fullName}`);

  const meta: string[] = [];
  if (isNonEmpty(row.queendom)) meta.push(`Queendom: ${row.queendom.trim()}`);
  if (isNonEmpty(row.client_status))
    meta.push(`Status: ${row.client_status}`);
  if (isNonEmpty(row.membership_type))
    meta.push(`Plan: ${row.membership_type}`);
  const until = fmtDate(row.membership_end);
  if (until) meta.push(`Until: ${until}`);
  const start = fmtDate(row.membership_start);
  if (start) meta.push(`Member since: ${start}`);
  if (meta.length) lines.push(meta.join(" | "));

  const paid = row.membership_amount_paid;
  if (paid != null && !Number.isNaN(paid) && paid > 0) {
    lines.push(
      `Membership paid: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paid)}`,
    );
  }

  if (isNonEmpty(row.notes)) {
    lines.push(`Notes: ${row.notes.trim()}`);
  }

  if (cp) {
    if (isNonEmpty(cp.primary_city)) lines.push(`City: ${cp.primary_city.trim()}`);
    if (isNonEmpty(cp.company_designation))
      lines.push(`Company: ${cp.company_designation.trim()}`);
    if (isNonEmpty(cp.personality_type))
      lines.push(`Personality: ${cp.personality_type.trim()}`);
    if (isNonEmpty(cp.marital_status))
      lines.push(`Marital: ${cp.marital_status.trim()}`);
    const dob = fmtDate(cp.date_of_birth);
    if (dob) lines.push(`DOB: ${dob}`);
    if (isNonEmpty(cp.blood_group)) lines.push(`Blood: ${cp.blood_group.trim()}`);
    if (isNonEmpty(cp.social_handles))
      lines.push(`Social: ${cp.social_handles.trim()}`);

    const life = cp.lifestyle ?? {};
    if (isNonEmpty(life.dietary_preference))
      lines.push(`Diet: ${life.dietary_preference!.trim()}`);
    const cuisines = joinList(life.favourite_cuisine);
    if (cuisines) lines.push(`Cuisines: ${cuisines}`);
    if (isNonEmpty(life.favourite_food))
      lines.push(`Favourite food: ${life.favourite_food!.trim()}`);
    if (isNonEmpty(life.favourite_drink))
      lines.push(`Drink: ${life.favourite_drink!.trim()}`);
    const restaurants = joinList(life.go_to_restaurant);
    if (restaurants) lines.push(`Restaurants: ${restaurants}`);
    const brands = joinList(life.favourite_brands);
    if (brands) lines.push(`Brands: ${brands}`);

    const pas = cp.passions ?? {};
    const sports = joinList(pas.favourite_sports);
    if (sports) lines.push(`Sports: ${sports}`);
    if (isNonEmpty(pas.favourite_car))
      lines.push(`Car: ${pas.favourite_car!.trim()}`);
    if (isNonEmpty(pas.favourite_watch))
      lines.push(`Watch: ${pas.favourite_watch!.trim()}`);

    const tr = cp.travel ?? {};
    if (isNonEmpty(tr.seat_preference))
      lines.push(`Travel: ${tr.seat_preference!.trim()}`);
    const stays = joinList(tr.stay_preferences);
    if (stays) lines.push(`Stay: ${stays}`);
    if (isNonEmpty(tr.go_to_country))
      lines.push(`Destination: ${tr.go_to_country!.trim()}`);
    if (isNonEmpty(tr.needs_assistance_with))
      lines.push(`Travel assistance: ${tr.needs_assistance_with!.trim()}`);

    lines.push(`Profile completeness: ${completeness}%`);
  }

  lines.push("---");
  return lines.join("\n");
}

const CLIENT_PROFILES_SUBSELECT = `
      client_profiles (
        personality_type,
        date_of_birth,
        blood_group,
        marital_status,
        primary_city,
        company_designation,
        social_handles,
        travel,
        lifestyle,
        passions,
        profile_completeness
      )
    `;

const CLIENT_SELECT_FOR_ELIA = `
      first_name,
      last_name,
      queendom,
      client_status,
      membership_type,
      membership_start,
      membership_end,
      membership_amount_paid,
      notes,
      ${CLIENT_PROFILES_SUBSELECT}
    `;

/** Same as global Elia context row shape, plus phone for Freshdesk match. */
const CLIENT_SELECT_FOR_SUMMARY = `
      first_name,
      last_name,
      phone_number,
      queendom,
      client_status,
      membership_type,
      membership_start,
      membership_end,
      membership_amount_paid,
      notes,
      ${CLIENT_PROFILES_SUBSELECT}
    `;

const OPEN_FD_STATUSES = new Set([2, 3, 6]);

function buildFreshdeskContextBlock(params: {
  linked: boolean;
  total: number;
  open: number;
  lastSubject: string | null;
  lastCreatedAt: string | null;
  fetchError: boolean;
}): string {
  if (params.fetchError) {
    return "Freshdesk: temporarily unavailable; assume no ticket data.";
  }
  if (!params.linked) {
    return "Freshdesk: no support contact matched for this member. Total tickets: 0.";
  }
  const last =
    params.lastSubject && params.lastCreatedAt
      ? `Last ticket: "${params.lastSubject}" (created ${params.lastCreatedAt})`
      : params.lastSubject
        ? `Last ticket subject: "${params.lastSubject}"`
        : "No ticket subjects on file.";
  return [
    `Freshdesk: linked contact found.`,
    `Total tickets: ${params.total}`,
    `Open tickets: ${params.open}`,
    last,
  ].join("\n");
}

async function loadFreshdeskTicketSnapshot(params: {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<{
  linked: boolean;
  total: number;
  open: number;
  lastSubject: string | null;
  lastCreatedAt: string | null;
  fetchError: boolean;
}> {
  try {
    const contact = await findFreshdeskContactForClient({
      phone: params.phone,
      firstName: params.firstName,
      lastName: params.lastName,
    });
    if (!contact) {
      return {
        linked: false,
        total: 0,
        open: 0,
        lastSubject: null,
        lastCreatedAt: null,
        fetchError: false,
      };
    }
    const tickets = await listTicketsForRequester(contact.id);
    const open = tickets.filter((t) => OPEN_FD_STATUSES.has(t.status)).length;
    const last = tickets[0];
    return {
      linked: true,
      total: tickets.length,
      open,
      lastSubject: last?.subject ?? null,
      lastCreatedAt: last?.created_at ?? null,
      fetchError: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("FRESHDESK_API_KEY")) {
      return {
        linked: false,
        total: 0,
        open: 0,
        lastSubject: null,
        lastCreatedAt: null,
        fetchError: true,
      };
    }
    return {
      linked: false,
      total: 0,
      open: 0,
      lastSubject: null,
      lastCreatedAt: null,
      fetchError: true,
    };
  }
}

const CLIENT_SUMMARY_SYSTEM_PROMPT =
  "You are Elia, concierge intelligence for Indulge. Write a 3-sentence executive summary of this member for their concierge agent. Sentence 1: who they are (personality, city, company, membership). Sentence 2: what they love (top preferences from lifestyle/travel/passions). Sentence 3: their service history (Freshdesk tickets — if none, note that). Be warm, specific, and use their first name. Never mention 'profile completeness' or technical terms. Max 3 sentences.";

/**
 * Single-member profile text for client-scoped Elia chat. Returns null if missing or unauthenticated.
 */
export async function getEliaSingleClientProfileText(
  clientId: string,
): Promise<string | null> {
  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: qErr } = await supabase
    .from("clients")
    .select(CLIENT_SELECT_FOR_ELIA)
    .eq("id", parsed.data)
    .maybeSingle();

  if (qErr || !data) return null;

  return serializeClient(data as ClientContextRow);
}

export async function getClientSummary(clientId: string): Promise<string> {
  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return "";

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return "";

    const { data, error: qErr } = await supabase
      .from("clients")
      .select(CLIENT_SELECT_FOR_SUMMARY)
      .eq("id", parsed.data)
      .maybeSingle();

    if (qErr || !data) return "";

    const row = data as ClientContextRow & { phone_number?: string | null };
    const phone =
      typeof row.phone_number === "string" ? row.phone_number : null;

    const fd = await loadFreshdeskTicketSnapshot({
      phone,
      firstName: row.first_name,
      lastName: row.last_name,
    });

    const base = serializeClient(row);
    const fdBlock = buildFreshdeskContextBlock(fd);
    const userContent = `${base}\n\n${fdBlock}`;

    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        stream: false,
        system: CLIENT_SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!ar.ok) return "";

    const result = (await ar.json()) as { content?: { text?: string }[] };
    const text = result.content?.[0]?.text?.trim() ?? "";
    return text;
  } catch {
    return "";
  }
}

/**
 * Serialized member database for Elia Preview (context stuffing).
 *
 * Not wrapped in `unstable_cache`: that API must not call `cookies()` / `createClient()`
 * inside the cached callback (Next.js restriction). This runs once per chat request.
 */
export async function getEliaClientContext(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthenticated");
  }

  const { data, error: qErr } = await supabase
    .from("clients")
    .select(CLIENT_SELECT_FOR_ELIA)
    .order("first_name", { ascending: true });

  if (qErr) {
    throw new Error(qErr.message);
  }

  const rows = (data ?? []) as ClientContextRow[];
  const blocks: string[] = [];

  for (const row of rows) {
    const cp = profileFromRow(row);
    const completeness = cp?.profile_completeness ?? 0;
    const notesTrim = (row.notes ?? "").trim();
    if (completeness === 0 && !notesTrim) {
      continue;
    }
    blocks.push(serializeClient(row));
  }

  return blocks.join("\n");
}

export async function getEliaActiveMemberCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthenticated");
  }

  const { count, error: qErr } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("client_status", "active");

  if (qErr) {
    throw new Error(qErr.message);
  }
  return count ?? 0;
}
