"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import type { SupabaseServerClient } from "@/lib/auth/getAuthUser";
import { sanitizeText } from "@/lib/utils/sanitize";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { canManageAnyClient } from "@/lib/types/database";
import { SYSTEM_TIMEZONE } from "@/lib/utils/time";
import { z } from "zod";

const IST = SYSTEM_TIMEZONE;


// ── JSON shapes (client_profiles JSONB) ─────────────────────

export interface ClientTravelJson {
  seat_preference?: string;
  stay_preferences?: string[];
  go_to_country?: string;
  needs_assistance_with?: string;
}

export interface ClientLifestyleJson {
  dietary_preference?: string;
  favourite_cuisine?: string[];
  favourite_food?: string;
  favourite_drink?: string;
  go_to_restaurant?: string[];
  favourite_brands?: string[];
}

export interface ClientPassionsJson {
  favourite_sports?: string[];
  favourite_car?: string;
  favourite_watch?: string;
}

export interface ClientEliaNotesJson {
  summary?: string;
  hard_nos?: string[];
  special_dates?: string[];
  last_enriched_at?: string;
}

export interface ClientWithProfile {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  /** Chetto / Joule `group_id` when explicitly linked (see `/clients/chetto-mapping`). */
  chetto_group_id: string | null;
  email: string | null;
  queendom: string | null;
  client_status: string;
  membership_type: string | null;
  membership_start: string | null;
  membership_end: string | null;
  membership_amount_paid: number | null;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
  profile_completeness: number | null;
  personality_type: string | null;
  primary_city: string | null;
  company_designation: string | null;
  lifestyle: ClientLifestyleJson | null;
  travel: ClientTravelJson | null;
  passions: ClientPassionsJson | null;
}

/** Full row for detail sheet */
export interface ClientDetail extends ClientWithProfile {
  former_queendom: string | null;
  membership_interval: string | null;
  membership_status: string | null;
  external_id: string | null;
  assigned_agent_id: string | null;
  closed_by: string | null;
  lead_origin_id: string | null;
  updated_at: string;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: string | null;
  wedding_anniversary: string | null;
  social_handles: string | null;
  elia_notes: ClientEliaNotesJson | null;
  elia_profile: import("@/lib/types/database").EliaProfile | null;
  elia_version: number;
  elia_analyzed_at: string | null;
  elia_messages_through: string | null;
  profile_id: string | null;
  profile_last_enriched_at: string | null;
  profile_updated_at: string | null;
}

export interface ClientProfileUpdate {
  personality_type?: string | null;
  date_of_birth?: string | null;
  blood_group?: string | null;
  marital_status?: string | null;
  wedding_anniversary?: string | null;
  primary_city?: string | null;
  company_designation?: string | null;
  social_handles?: string | null;
  travel?: Partial<ClientTravelJson>;
  lifestyle?: Partial<ClientLifestyleJson>;
  passions?: Partial<ClientPassionsJson>;
  elia_notes?: Partial<ClientEliaNotesJson>;
}

const listFiltersSchema = z.object({
  queendom: z
    .enum(["Ananyshree Queendom", "Anishqa Queendom", "Unassigned", "all"])
    .optional(),
  client_status: z.enum(["active", "expired", "all"]).optional(),
  membership_type: z.string().optional(),
  search: z.string().optional(),
  /** `profile_data` = richest profiles first (uses clients.profile_completeness_cache). */
  sort: z.enum(["default", "profile_data"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  /**
   * `chetto` = no `chetto_group_id`.
   * `freshdesk` = no `phone_number` (phone is the Freshdesk lookup key).
   */
  unmapped: z.enum(["chetto", "freshdesk"]).optional(),
});

function hasText(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function isNonEmptyObject(o: unknown): boolean {
  if (o == null || typeof o !== "object" || Array.isArray(o)) return false;
  const rec = o as Record<string, unknown>;
  return Object.keys(rec).some((k) => {
    const v = rec[k];
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return true;
  });
}

function computeProfileCompleteness(input: {
  personality_type?: string | null;
  date_of_birth?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  primary_city?: string | null;
  company_designation?: string | null;
  travel?: unknown;
  lifestyle?: unknown;
  passions?: unknown;
  social_handles?: string | null;
  wedding_anniversary?: string | null;
}): number {
  let filled = 0;
  if (hasText(input.personality_type)) filled++;
  if (input.date_of_birth != null && String(input.date_of_birth).trim() !== "")
    filled++;
  if (hasText(input.marital_status)) filled++;
  if (hasText(input.blood_group)) filled++;
  if (hasText(input.primary_city)) filled++;
  if (hasText(input.company_designation)) filled++;
  if (isNonEmptyObject(input.travel)) filled++;
  if (isNonEmptyObject(input.lifestyle)) filled++;
  if (isNonEmptyObject(input.passions)) filled++;
  if (hasText(input.social_handles)) filled++;
  if (
    input.wedding_anniversary != null &&
    String(input.wedding_anniversary).trim() !== ""
  )
    filled++;
  return Math.round((filled / 11) * 100);
}

function mergeJson<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T> | undefined,
): T {
  if (!patch) return base;
  return { ...base, ...patch } as T;
}

function mapJoinedRow(row: Record<string, unknown>): ClientWithProfile {
  const prof = row.client_profiles as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null
    | undefined;
  const p = Array.isArray(prof) ? prof[0] : prof;
  const cachedCompleteness = row.profile_completeness_cache;

  return {
    id: String(row.id),
    first_name: String(row.first_name ?? ""),
    last_name: (row.last_name as string | null) ?? null,
    phone_number: String(row.phone_number ?? ""),
    chetto_group_id: (row.chetto_group_id as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    queendom: (row.queendom as string | null) ?? null,
    client_status: String(row.client_status ?? "unknown"),
    membership_type: (row.membership_type as string | null) ?? null,
    membership_start: (row.membership_start as string | null) ?? null,
    membership_end: (row.membership_end as string | null) ?? null,
    membership_amount_paid:
      row.membership_amount_paid != null
        ? Number(row.membership_amount_paid)
        : null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    profile_completeness:
      cachedCompleteness != null
        ? Number(cachedCompleteness)
        : p && (p.profile_completeness as number | undefined) != null
          ? Number(p.profile_completeness)
          : null,
    personality_type: (p?.personality_type as string | null) ?? null,
    primary_city: (p?.primary_city as string | null) ?? null,
    company_designation: (p?.company_designation as string | null) ?? null,
    lifestyle: (p?.lifestyle as ClientLifestyleJson | null) ?? null,
    travel: (p?.travel as ClientTravelJson | null) ?? null,
    passions: (p?.passions as ClientPassionsJson | null) ?? null,
  };
}

export interface ClientListFilters {
  queendom?: z.infer<typeof listFiltersSchema>["queendom"];
  client_status?: z.infer<typeof listFiltersSchema>["client_status"];
  membership_type?: string;
  search?: string;
  sort?: z.infer<typeof listFiltersSchema>["sort"];
  page?: number;
  pageSize?: number;
  unmapped?: z.infer<typeof listFiltersSchema>["unmapped"];
}

async function fetchClientsList(
  supabase: SupabaseServerClient,
  filters: ClientListFilters = {},
) {
  const parsed = listFiltersSchema.safeParse(filters);
  const f = parsed.success ? parsed.data : {};
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 24;

  let query = supabase.from("clients").select(
    `
        id,
        first_name,
        last_name,
        phone_number,
        chetto_group_id,
        email,
        queendom,
        client_status,
        membership_type,
        membership_start,
        membership_end,
        membership_amount_paid,
        avatar_url,
        notes,
        created_at,
        profile_completeness_cache,
        client_profiles (
          personality_type,
          primary_city,
          company_designation,
          lifestyle,
          travel
        )
      `,
    { count: "exact" },
  );

    if (f.queendom && f.queendom !== "all") {
      if (f.queendom === "Unassigned") {
        query = query.is("queendom", null);
      } else {
        query = query.eq("queendom", f.queendom);
      }
    }

    if (f.client_status && f.client_status !== "all") {
      query = query.eq("client_status", f.client_status);
    }

    if (f.membership_type && f.membership_type !== "" && f.membership_type !== "all") {
      query = query.eq("membership_type", f.membership_type);
    }

    if (f.unmapped === "chetto") {
      query = query.is("chetto_group_id", null);
    } else if (f.unmapped === "freshdesk") {
      query = query.or("phone_number.is.null,phone_number.eq.");
    }

    if (f.search && f.search.trim() !== "") {
      const q = f.search.replace(/[(),'"%_]/g, "").trim();
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone_number.ilike.${like}`,
        );
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const sortMode = f.sort ?? "default";
    if (sortMode === "profile_data") {
      query = query
        .order("profile_completeness_cache", {
          ascending: false,
          nullsFirst: false,
        })
        .order("first_name", { ascending: true });
    } else {
      query = query
        .order("client_status", { ascending: true })
        .order("first_name", { ascending: true });
    }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("getClients", error);
    return { clients: [] as ClientWithProfile[], total: 0, page };
  }

  const clients = (data ?? []).map((row) =>
    mapJoinedRow(row as Record<string, unknown>),
  );
  return { clients, total: count ?? 0, page };
}

export async function getClients(filters: ClientListFilters = {}) {
  try {
    const { supabase } = await getAuthUser();
    return await fetchClientsList(supabase, filters);
  } catch (e) {
    console.error(e);
    return { clients: [] as ClientWithProfile[], total: 0, page: 1 };
  }
}

/** Single auth round-trip for the clients directory RSC (list + stats + role). */
export async function getClientsDirectoryPageData(
  filters: ClientListFilters = {},
): Promise<{
  clients: ClientWithProfile[];
  total: number;
  page: number;
  stats: ClientDirectoryStats;
  role: string;
}> {
  try {
    const { supabase, role } = await getAuthUser();
    const [list, stats] = await Promise.all([
      fetchClientsList(supabase, filters),
      fetchClientDirectoryStats(supabase),
    ]);
    return { ...list, stats, role };
  } catch (e) {
    console.error(e);
    return {
      clients: [],
      total: 0,
      page: 1,
      stats: {
        totalMembers: 0,
        activeCount: 0,
        expiredCount: 0,
        newThisMonthCount: 0,
      },
      role: "agent",
    };
  }
}

export interface ClientDirectoryStats {
  totalMembers: number;
  activeCount: number;
  expiredCount: number;
  newThisMonthCount: number;
}

function startOfMonthISTUtc(): string {
  const y = formatInTimeZone(new Date(), IST, "yyyy");
  const m = formatInTimeZone(new Date(), IST, "MM");
  return fromZonedTime(`${y}-${m}-01T00:00:00.000`, IST).toISOString();
}

async function fetchClientDirectoryStats(
  supabase: SupabaseServerClient,
): Promise<ClientDirectoryStats> {
  const monthStart = startOfMonthISTUtc();

  // Two queries instead of four: one for status breakdown, one for month count.
  const [statusRes, monthRes] = await Promise.all([
    supabase.from("clients").select("client_status"),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
  ]);

  const rows = (statusRes.data ?? []) as { client_status: string }[];
  let activeCount = 0;
  let expiredCount = 0;
  for (const r of rows) {
    if (r.client_status === "active") activeCount++;
    else if (r.client_status === "expired") expiredCount++;
  }

  return {
    totalMembers: rows.length,
    activeCount,
    expiredCount,
    newThisMonthCount: monthRes.count ?? 0,
  };
}

export async function getClientDirectoryStats(): Promise<ClientDirectoryStats> {
  try {
    const { supabase } = await getAuthUser();
    return await fetchClientDirectoryStats(supabase);
  } catch {
    return {
      totalMembers: 0,
      activeCount: 0,
      expiredCount: 0,
      newThisMonthCount: 0,
    };
  }
}

export type GetClientByIdOptions = {
  /** Omit large Elia JSON until Profile tab (faster dossier first paint). */
  includeEliaProfile?: boolean;
};

const CLIENT_DETAIL_SELECT = `
  id,
  first_name,
  last_name,
  phone_number,
  chetto_group_id,
  email,
  queendom,
  former_queendom,
  client_status,
  membership_type,
  membership_start,
  membership_end,
  membership_amount_paid,
  membership_interval,
  membership_status,
  external_id,
  assigned_agent_id,
  closed_by,
  lead_origin_id,
  avatar_url,
  notes,
  created_at,
  updated_at,
  client_profiles (
    id,
    personality_type,
    date_of_birth,
    blood_group,
    marital_status,
    wedding_anniversary,
    primary_city,
    company_designation,
    social_handles,
    travel,
    lifestyle,
    passions,
    elia_notes,
    elia_version,
    elia_analyzed_at,
    elia_messages_through,
    profile_completeness,
    last_enriched_at,
    updated_at
  )
`;

const CLIENT_DETAIL_SELECT_WITH_ELIA = `
  id,
  first_name,
  last_name,
  phone_number,
  chetto_group_id,
  email,
  queendom,
  former_queendom,
  client_status,
  membership_type,
  membership_start,
  membership_end,
  membership_amount_paid,
  membership_interval,
  membership_status,
  external_id,
  assigned_agent_id,
  closed_by,
  lead_origin_id,
  avatar_url,
  notes,
  created_at,
  updated_at,
  client_profiles (
    id,
    personality_type,
    date_of_birth,
    blood_group,
    marital_status,
    wedding_anniversary,
    primary_city,
    company_designation,
    social_handles,
    travel,
    lifestyle,
    passions,
    elia_notes,
    elia_profile,
    elia_version,
    elia_analyzed_at,
    elia_messages_through,
    profile_completeness,
    last_enriched_at,
    updated_at
  )
`;

export async function getClientById(
  id: string,
  options: GetClientByIdOptions = {},
): Promise<{ success: boolean; data?: ClientDetail; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(id);
    if (!uuid.success) return { success: false, error: "Invalid id" };

    const { supabase } = await getAuthUser();
    const selectQuery =
      options.includeEliaProfile === true
        ? CLIENT_DETAIL_SELECT_WITH_ELIA
        : CLIENT_DETAIL_SELECT;

    const { data, error } = await supabase
      .from("clients")
      .select(selectQuery)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Client not found" };
    }

    const row = data as Record<string, unknown>;
    const prof = row.client_profiles as Record<string, unknown> | null;
    const p = Array.isArray(prof) ? prof[0] : prof;

    const detail: ClientDetail = {
      ...mapJoinedRow(row),
      former_queendom: (row.former_queendom as string | null) ?? null,
      membership_interval: (row.membership_interval as string | null) ?? null,
      membership_status: (row.membership_status as string | null) ?? null,
      external_id: (row.external_id as string | null) ?? null,
      assigned_agent_id: (row.assigned_agent_id as string | null) ?? null,
      closed_by: (row.closed_by as string | null) ?? null,
      lead_origin_id: (row.lead_origin_id as string | null) ?? null,
      updated_at: String(row.updated_at ?? row.created_at ?? ""),
      date_of_birth: (p?.date_of_birth as string | null) ?? null,
      blood_group: (p?.blood_group as string | null) ?? null,
      marital_status: (p?.marital_status as string | null) ?? null,
      wedding_anniversary: (p?.wedding_anniversary as string | null) ?? null,
      company_designation: (p?.company_designation as string | null) ?? null,
      social_handles: (p?.social_handles as string | null) ?? null,
      elia_notes: (p?.elia_notes as ClientEliaNotesJson | null) ?? null,
      elia_profile: (p?.elia_profile as import("@/lib/types/database").EliaProfile | null) ?? null,
      elia_version: typeof p?.elia_version === "number" ? p.elia_version : 0,
      elia_analyzed_at: (p?.elia_analyzed_at as string | null) ?? null,
      elia_messages_through: (p?.elia_messages_through as string | null) ?? null,
      profile_id: p ? String(p.id) : null,
      profile_last_enriched_at:
        (p?.last_enriched_at as string | null) ?? null,
      profile_updated_at: (p?.updated_at as string | null) ?? null,
    };

    if (p) {
      detail.personality_type = (p.personality_type as string | null) ?? null;
      detail.primary_city = (p.primary_city as string | null) ?? null;
      detail.lifestyle = (p.lifestyle as ClientLifestyleJson | null) ?? null;
      detail.travel = (p.travel as ClientTravelJson | null) ?? null;
      detail.passions = (p.passions as ClientPassionsJson | null) ?? null;
      detail.profile_completeness =
        p.profile_completeness != null ? Number(p.profile_completeness) : null;
    }

    return { success: true, data: detail };
  } catch {
    return { success: false, error: "Failed to load client" };
  }
}

export type ClientEliaProfileData = {
  elia_profile: import("@/lib/types/database").EliaProfile | null;
  elia_version: number;
  elia_analyzed_at: string | null;
  elia_messages_through: string | null;
};

/** Fetches only the Elia profile columns — much cheaper than a full getClientById. */
export async function getClientEliaProfile(
  clientId: string,
): Promise<{ success: boolean; data?: ClientEliaProfileData; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(clientId);
    if (!uuid.success) return { success: false, error: "Invalid id" };

    const { supabase } = await getAuthUser();
    const { data, error } = await supabase
      .from("client_profiles")
      .select("elia_profile, elia_version, elia_analyzed_at, elia_messages_through")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) return { success: false, error: "Failed to load Elia profile" };

    return {
      success: true,
      data: {
        elia_profile: (data?.elia_profile as import("@/lib/types/database").EliaProfile | null) ?? null,
        elia_version: typeof data?.elia_version === "number" ? data.elia_version : 0,
        elia_analyzed_at: (data?.elia_analyzed_at as string | null) ?? null,
        elia_messages_through: (data?.elia_messages_through as string | null) ?? null,
      },
    };
  } catch {
    return { success: false, error: "Failed to load Elia profile" };
  }
}

async function assertCanEditClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (canManageAnyClient(role)) return { ok: true };

  const { data: row, error } = await supabase
    .from("clients")
    .select("assigned_agent_id, closed_by")
    .eq("id", clientId)
    .single();

  if (error || !row) return { ok: false, error: "Client not found" };

  const assigned = (row as { assigned_agent_id?: string | null }).assigned_agent_id;
  const closedBy = (row as { closed_by?: string | null }).closed_by;

  if (assigned === userId || closedBy === userId) return { ok: true };
  return { ok: false, error: "Unauthorised" };
}

export async function updateClientNotes(clientId: string, notes: string) {
  try {
    const { supabase, user, role } = await getAuthUser();
    const gate = await assertCanEditClient(supabase, user.id, role, clientId);
    if (!gate.ok) return { success: false, error: gate.error ?? "Unauthorised" };

    const clean = sanitizeText(notes);
    const { error } = await supabase
      .from("clients")
      .update({ notes: clean })
      .eq("id", clientId);

    if (error) return { success: false, error: "Failed to save notes" };

    revalidatePath("/clients");
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

const profileUpdateSchema = z
  .object({
    personality_type: z.string().nullable().optional(),
    date_of_birth: z.string().nullable().optional(),
    blood_group: z.string().nullable().optional(),
    marital_status: z.string().nullable().optional(),
    wedding_anniversary: z.string().nullable().optional(),
    primary_city: z.string().nullable().optional(),
    company_designation: z.string().nullable().optional(),
    social_handles: z.string().nullable().optional(),
    travel: z.record(z.string(), z.unknown()).optional(),
    lifestyle: z.record(z.string(), z.unknown()).optional(),
    passions: z.record(z.string(), z.unknown()).optional(),
    elia_notes: z.record(z.string(), z.unknown()).optional(),
  })
  .partial();

export async function updateClientProfile(
  clientId: string,
  profileData: Partial<ClientProfileUpdate>,
) {
  try {
    const { supabase, user, role } = await getAuthUser();
    const gate = await assertCanEditClient(supabase, user.id, role, clientId);
    if (!gate.ok) return { success: false, error: gate.error ?? "Unauthorised" };

    const parsed = profileUpdateSchema.safeParse(profileData);
    if (!parsed.success)
      return { success: false, error: "Invalid profile payload" };

    const { data: existingProf, error: fetchProfErr } = await supabase
      .from("client_profiles")
      .select(
        "id, personality_type, date_of_birth, blood_group, marital_status, wedding_anniversary, primary_city, company_designation, social_handles, travel, lifestyle, passions, elia_notes",
      )
      .eq("client_id", clientId)
      .maybeSingle();

    if (fetchProfErr)
      return { success: false, error: "Failed to load profile" };

    const payload = parsed.data;
    const travelMerged = mergeJson(
      (existingProf?.travel as Record<string, unknown>) ?? {},
      payload.travel as Record<string, unknown> | undefined,
    );
    const lifestyleMerged = mergeJson(
      (existingProf?.lifestyle as Record<string, unknown>) ?? {},
      payload.lifestyle as Record<string, unknown> | undefined,
    );
    const passionsMerged = mergeJson(
      (existingProf?.passions as Record<string, unknown>) ?? {},
      payload.passions as Record<string, unknown> | undefined,
    );
    const eliaMerged = mergeJson(
      (existingProf?.elia_notes as Record<string, unknown>) ?? {},
      payload.elia_notes as Record<string, unknown> | undefined,
    );

    const nextRow = {
      personality_type:
        payload.personality_type !== undefined
          ? payload.personality_type
          : existingProf?.personality_type ?? null,
      date_of_birth:
        payload.date_of_birth !== undefined
          ? payload.date_of_birth
          : existingProf?.date_of_birth ?? null,
      blood_group:
        payload.blood_group !== undefined
          ? payload.blood_group
          : existingProf?.blood_group ?? null,
      marital_status:
        payload.marital_status !== undefined
          ? payload.marital_status
          : existingProf?.marital_status ?? null,
      wedding_anniversary:
        payload.wedding_anniversary !== undefined
          ? payload.wedding_anniversary
          : existingProf?.wedding_anniversary ?? null,
      primary_city:
        payload.primary_city !== undefined
          ? payload.primary_city
          : existingProf?.primary_city ?? null,
      company_designation:
        payload.company_designation !== undefined
          ? payload.company_designation
          : existingProf?.company_designation ?? null,
      social_handles:
        payload.social_handles !== undefined
          ? payload.social_handles
          : existingProf?.social_handles ?? null,
      travel: travelMerged,
      lifestyle: lifestyleMerged,
      passions: passionsMerged,
      elia_notes: eliaMerged,
    };

    const profile_completeness = computeProfileCompleteness({
      personality_type: nextRow.personality_type,
      date_of_birth: nextRow.date_of_birth,
      marital_status: nextRow.marital_status,
      blood_group: nextRow.blood_group,
      primary_city: nextRow.primary_city,
      company_designation: nextRow.company_designation,
      travel: nextRow.travel,
      lifestyle: nextRow.lifestyle,
      passions: nextRow.passions,
      social_handles: nextRow.social_handles,
      wedding_anniversary: nextRow.wedding_anniversary,
    });

    if (existingProf?.id) {
      const { error: updErr } = await supabase
        .from("client_profiles")
        .update({
          ...nextRow,
          profile_completeness,
        })
        .eq("id", existingProf.id);

      if (updErr) return { success: false, error: "Failed to update profile" };
    } else {
      const { error: insErr } = await supabase.from("client_profiles").insert({
        client_id: clientId,
        ...nextRow,
        profile_completeness,
      });

      if (insErr) return { success: false, error: "Failed to create profile" };
    }

    revalidatePath("/clients");
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

const chettoMappingListSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  search: z.string().optional(),
  onlyUnmapped: z.boolean().optional(),
});

export type ChettoMappingRow = Pick<
  ClientWithProfile,
  "id" | "first_name" | "last_name" | "phone_number" | "queendom" | "chetto_group_id"
>;

/**
 * Paginated client list for the Chetto group mapping tool.
 * Restricted to admin / founder / super_admin / manager.
 */
export async function getClientsChettoMappingPage(
  raw: z.infer<typeof chettoMappingListSchema>,
): Promise<{
  success: boolean;
  clients: ChettoMappingRow[];
  total: number;
  page: number;
  error?: string;
}> {
  try {
    const parsed = chettoMappingListSchema.safeParse(raw);
    const f = parsed.success ? parsed.data : {};
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 50;

    const { supabase, role } = await getAuthUser();
    if (!canManageAnyClient(role)) {
      return {
        success: false,
        error: "Unauthorised",
        clients: [],
        total: 0,
        page: 1,
      };
    }

    let query = supabase
      .from("clients")
      .select(
        "id, first_name, last_name, phone_number, queendom, chetto_group_id",
        { count: "exact" },
      );

    if (f.onlyUnmapped) {
      query = query.is("chetto_group_id", null);
    }

    if (f.search && f.search.trim() !== "") {
      const q = f.search.replace(/[(),'"%_]/g, "").trim();
      if (q) {
        const like = `%${q}%`;
        query = query.or(
          `first_name.ilike.${like},last_name.ilike.${like},phone_number.ilike.${like},chetto_group_id.ilike.${like}`,
        );
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("first_name", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("getClientsChettoMappingPage", error);
      return {
        success: false,
        error: "Failed to load clients",
        clients: [],
        total: 0,
        page,
      };
    }

    const clients = (data ?? []) as ChettoMappingRow[];
    return { success: true, clients, total: count ?? 0, page };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      error: "Unexpected error",
      clients: [],
      total: 0,
      page: 1,
    };
  }
}

const chettoGroupIdValueSchema = z
  .string()
  .max(120)
  .regex(/^[0-9A-Za-z_-]+$/, "Use letters, digits, hyphen, underscore only");

/**
 * Update `clients.phone_number` — used to fix Freshdesk-unmapped clients.
 * Phone is validated as a non-empty string; caller should pass normalised E.164 when possible.
 */
export async function updateClientPhone(
  clientId: string,
  rawPhone: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(clientId);
    if (!uuid.success) return { success: false, error: "Invalid client id" };

    const phone = sanitizeText(rawPhone.trim());
    if (!phone) return { success: false, error: "Phone number is required" };
    if (phone.length > 20) return { success: false, error: "Phone number too long" };

    const { supabase, user, role } = await getAuthUser();
    const gate = await assertCanEditClient(supabase, user.id, role, clientId);
    if (!gate.ok) return { success: false, error: gate.error ?? "Unauthorised" };

    const { error } = await supabase
      .from("clients")
      .update({ phone_number: phone })
      .eq("id", clientId);

    if (error) return { success: false, error: "Failed to save phone number" };

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

// ── Unmapped clients tool ──────────────────────────────────────────────────

const unmappedListSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  search: z.string().optional(),
  /** `"all"` = any missing mapping, `"chetto"` = no group id, `"freshdesk"` = no phone */
  filter: z.enum(["all", "chetto", "freshdesk"]).optional(),
});

export type UnmappedRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  queendom: string | null;
  chetto_group_id: string | null;
  membership_type: string | null;
  client_status: string;
  /** Which mappings are incomplete */
  missing: ("phone" | "chetto")[];
};

/**
 * Paginated list of clients that are missing at least one integration mapping.
 * `"all"` (default) = no phone OR no chetto_group_id.
 * Restricted to admin / founder / super_admin / manager.
 */
export async function getClientsUnmappedPage(
  raw: z.infer<typeof unmappedListSchema> = {},
): Promise<{
  success: boolean;
  clients: UnmappedRow[];
  total: number;
  page: number;
  counts: { phone: number; chetto: number };
  error?: string;
}> {
  const EMPTY = { success: false, clients: [], total: 0, page: 1, counts: { phone: 0, chetto: 0 } };
  try {
    const parsed = unmappedListSchema.safeParse(raw);
    const f = parsed.success ? parsed.data : {};
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 50;
    const filterMode = f.filter ?? "all";

    const { supabase, role } = await getAuthUser();
    if (!canManageAnyClient(role)) {
      return { ...EMPTY, error: "Unauthorised" };
    }

    let query = supabase
      .from("clients")
      .select(
        "id, first_name, last_name, phone_number, queendom, chetto_group_id, membership_type, client_status",
        { count: "exact" },
      );

    if (filterMode === "all") {
      query = query.or("phone_number.is.null,phone_number.eq.,chetto_group_id.is.null");
    } else if (filterMode === "chetto") {
      query = query.is("chetto_group_id", null);
    } else {
      query = query.or("phone_number.is.null,phone_number.eq.");
    }

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
      console.error("getClientsUnmappedPage", error);
      return { ...EMPTY, error: "Failed to load clients" };
    }

    // Parallel count queries for stat tiles
    const [phoneCountRes, chettoCountRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .or("phone_number.is.null,phone_number.eq."),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("chetto_group_id", null),
    ]);

    const clients: UnmappedRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const phone = (row.phone_number as string | null) ?? null;
      const chetto = (row.chetto_group_id as string | null) ?? null;
      const missing: ("phone" | "chetto")[] = [];
      if (!phone || phone.trim() === "") missing.push("phone");
      if (!chetto) missing.push("chetto");
      return {
        id: String(row.id),
        first_name: String(row.first_name ?? ""),
        last_name: (row.last_name as string | null) ?? null,
        phone_number: phone,
        queendom: (row.queendom as string | null) ?? null,
        chetto_group_id: chetto,
        membership_type: (row.membership_type as string | null) ?? null,
        client_status: String(row.client_status ?? "unknown"),
        missing,
      };
    });

    return {
      success: true,
      clients,
      total: count ?? 0,
      page,
      counts: {
        phone: phoneCountRes.count ?? 0,
        chetto: chettoCountRes.count ?? 0,
      },
    };
  } catch (e) {
    console.error(e);
    return { ...EMPTY, error: "Unexpected error" };
  }
}

/**
 * Set or clear `clients.chetto_group_id` for a client (authorisation: same as profile / notes).
 * Pass `null` to clear the link.
 */
export async function updateClientChettoGroupId(
  clientId: string,
  rawGroupId: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(clientId);
    if (!uuid.success) return { success: false, error: "Invalid client id" };

    let chetto_group_id: string | null = null;
    if (rawGroupId !== null) {
      const t = rawGroupId.trim();
      if (t !== "") {
        const g = chettoGroupIdValueSchema.safeParse(t);
        if (!g.success)
          return {
            success: false,
            error: g.error.flatten().formErrors[0] ?? "Invalid group id",
          };
        chetto_group_id = g.data;
      }
    }

    const { supabase, user, role } = await getAuthUser();
    const gate = await assertCanEditClient(supabase, user.id, role, clientId);
    if (!gate.ok) return { success: false, error: gate.error ?? "Unauthorised" };

    const { error } = await supabase
      .from("clients")
      .update({ chetto_group_id })
      .eq("id", clientId);

    if (error) return { success: false, error: "Failed to save Chetto group id" };

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}
