/**
 * One-off local seed: clients-data.csv → clients + client_profiles;
 * Phase 2: Typeform rows matched to existing clients by exact normalized name only;
 *   non-members are SKIPPED_NOT_A_CLIENT (no new clients, no profile_sources).
 *
 * Run: npx tsx scripts/seed-clients.ts
 *
 * Place CSVs in scripts/data/:
 *   - clients-data.csv
 *   - typeform-data.csv  (copy from "Cleaned Typeform Databse - Sheet1.csv" if needed)
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { parseISO, isValid as isValidDate } from "date-fns";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("Warning: .env.local not found. Using existing process.env only.");
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load .env.local first).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// CSV (no csv-parse in package.json — minimal RFC-style parser)
// ---------------------------------------------------------------------------

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0] !== "") || row.some((c) => c.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  while (i < content.length) {
    const c = content[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      pushField();
      if (content[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  pushField();
  if (row.length) pushRow();
  return rows;
}

function csvToObjects(content: string): Record<string, string>[] {
  const grid = parseCsv(content);
  if (grid.length < 2) return [];
  const headers = grid[0]!.map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]!] = (cells[c] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}

// ---------------------------------------------------------------------------
// string / phone / name
// ---------------------------------------------------------------------------

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function normalizeForCompare(s: string): string {
  return collapseWs(s).toLowerCase();
}

function splitFullName(full: string): { first_name: string; last_name: string | null } {
  const t = collapseWs(full);
  if (!t) return { first_name: "Unknown", last_name: null };
  const sp = t.indexOf(" ");
  if (sp === -1) return { first_name: t, last_name: null };
  return {
    first_name: t.slice(0, sp),
    last_name: t.slice(sp + 1) || null,
  };
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = parsePhoneNumberFromString(trimmed, "IN");
    if (parsed?.isValid()) return parsed.format("E.164");
  } catch {
    /* use raw */
  }
  return trimmed;
}

function parseOptionalDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = parseISO(t.length === 10 ? `${t}T00:00:00.000Z` : t);
  return isValidDate(d) ? t.slice(0, 10) : null;
}

function parseOptionalDateLoose(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseOptionalNumber(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function mapClientStatus(raw: string): string {
  const t = raw.trim();
  if (t === "Active") return "active";
  if (t === "Expired") return "expired";
  return "unknown";
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function splitSemicolonList(s: string): string[] {
  return s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// JSONB merge (shallow keys; nested objects merged one level)
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeJsonObjects(
  existing: JsonObject,
  incoming: JsonObject,
): JsonObject {
  const out: JsonObject = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (isPlainObject(v)) {
      const prev = isPlainObject(out[k]) ? (out[k] as JsonObject) : {};
      out[k] = mergeJsonObjects(prev, v);
      if (Object.keys(out[k] as JsonObject).length === 0) delete out[k];
    } else {
      out[k] = v;
    }
  }
  return out;
}

function jsonNonEmpty(o: unknown): boolean {
  return isPlainObject(o) && Object.keys(o).length > 0;
}

// ---------------------------------------------------------------------------
// profile_completeness
// ---------------------------------------------------------------------------

type ProfileRow = {
  personality_type: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  blood_group: string | null;
  primary_city: string | null;
  company_designation: string | null;
  social_handles: string | null;
  wedding_anniversary: string | null;
  travel: JsonObject;
  lifestyle: JsonObject;
  passions: JsonObject;
};

function computeProfileCompleteness(p: ProfileRow): number {
  let filled = 0;
  const checks: boolean[] = [
    !!p.personality_type?.trim(),
    !!p.date_of_birth,
    !!p.marital_status?.trim(),
    !!p.blood_group?.trim(),
    !!p.primary_city?.trim(),
    !!p.company_designation?.trim(),
    jsonNonEmpty(p.travel),
    jsonNonEmpty(p.lifestyle),
    jsonNonEmpty(p.passions),
    !!p.social_handles?.trim(),
    !!p.wedding_anniversary,
  ];
  for (const c of checks) if (c) filled += 1;
  return Math.round((filled / 11) * 100);
}

// ---------------------------------------------------------------------------
// resolve typeform CSV path
// ---------------------------------------------------------------------------

function resolveTypeformPath(): string {
  const candidates = [
    path.join(process.cwd(), "scripts", "data", "typeform-data.csv"),
    path.join(
      process.cwd(),
      "scripts",
      "data",
      "Cleaned Typeform Databse - Sheet1.csv",
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
}

// ---------------------------------------------------------------------------
// types for Supabase rows (minimal — avoids importing generated DB types)
// ---------------------------------------------------------------------------

type ClientInsert = {
  external_id: string | null;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  email: string | null;
  queendom: string | null;
  former_queendom: string | null;
  client_status: string;
  membership_status: string;
  membership_type: string | null;
  membership_start: string | null;
  membership_end: string | null;
  membership_amount_paid: number | null;
  membership_interval: string | null;
  notes: string | null;
  created_at: string;
  lead_origin_id: string | null;
  closed_by: string | null;
};

type ClientProfileUpsert = {
  client_id: string;
  personality_type?: string | null;
  date_of_birth?: string | null;
  marital_status?: string | null;
  wedding_anniversary?: string | null;
  blood_group?: string | null;
  primary_city?: string | null;
  company_designation?: string | null;
  social_handles?: string | null;
  travel?: JsonObject;
  lifestyle?: JsonObject;
  passions?: JsonObject;
  profile_completeness?: number;
  updated_at?: string;
};

// ---------------------------------------------------------------------------
// Phase 1
// ---------------------------------------------------------------------------

async function ensureBlankProfile(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { error } = await supabase.from("client_profiles").upsert(
    { client_id: clientId },
    { onConflict: "client_id", ignoreDuplicates: false },
  );
  if (error) throw error;
}

async function phase1ImportClients(
  supabase: SupabaseClient,
  csvPath: string,
  stats: {
    p1Total: number;
    p1Ok: number;
    p1Fail: number;
    p1ProfileFail: number;
  },
): Promise<void> {
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = csvToObjects(content);
  stats.p1Total = rows.length;
  console.log(`\n--- Phase 1: clients-data (${rows.length} rows) ---\n`);

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]!;
    try {
      const externalId = (r["id"] ?? "").trim();
      if (!externalId) {
        console.log(`[${idx + 1}] SKIP: empty external id`);
        stats.p1Fail += 1;
        continue;
      }

      const { first_name, last_name } = splitFullName(r["name"] ?? "");
      const phoneRaw = r["phone"] ?? "";
      const phone_number = normalizePhone(phoneRaw);
      if (!phone_number) {
        console.log(`[${idx + 1}] SKIP: empty phone after parse (${externalId})`);
        stats.p1Fail += 1;
        continue;
      }

      const createdRaw = (r["created_at"] ?? "").trim();
      const created_at = createdRaw
        ? new Date(createdRaw).toISOString()
        : new Date().toISOString();

      const row: ClientInsert = {
        external_id: externalId,
        first_name,
        last_name,
        phone_number,
        email: null,
        queendom: emptyToNull(r["group"] ?? ""),
        former_queendom: emptyToNull(r["former_queendom"] ?? ""),
        client_status: mapClientStatus(r["latest_subscription_status"] ?? ""),
        membership_status: "active",
        membership_type: emptyToNull(r["latest_subscription_membership_type"] ?? ""),
        membership_start: parseOptionalDate(r["latest_subscription_start"] ?? ""),
        membership_end: parseOptionalDate(r["latest_subscription_end"] ?? ""),
        membership_amount_paid: parseOptionalNumber(
          r["latest_subscription_amount_paid"] ?? "",
        ),
        membership_interval: emptyToNull(r["latest_subscription_plan_interval"] ?? ""),
        notes: emptyToNull(r["notes"] ?? ""),
        created_at,
        lead_origin_id: null,
        closed_by: null,
      };

      const { data: upserted, error } = await supabase
        .from("clients")
        .upsert(row, { onConflict: "external_id" })
        .select("id")
        .single();

      if (error) throw error;
      const clientId = upserted?.id as string | undefined;
      if (!clientId) throw new Error("upsert returned no id");

      try {
        await ensureBlankProfile(supabase, clientId);
      } catch (pe) {
        stats.p1ProfileFail += 1;
        console.log(
          `[${idx + 1}] WARN: client ok but profile upsert failed (${externalId}): ${String(pe)}`,
        );
      }

      stats.p1Ok += 1;
      if ((idx + 1) % 50 === 0) console.log(`  … ${idx + 1} / ${rows.length} rows processed`);
    } catch (e) {
      stats.p1Fail += 1;
      console.log(`[${idx + 1}] FAIL: ${String(e)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2
// ---------------------------------------------------------------------------

type DbClientLite = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

function displayName(c: DbClientLite): string {
  return collapseWs(`${c.first_name} ${c.last_name ?? ""}`);
}

async function loadAllClients(supabase: SupabaseClient): Promise<DbClientLite[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email");
  if (error) throw error;
  return (data ?? []) as DbClientLite[];
}

/** Lowercase, whitespace-collapsed full name → all clients with that key (usually one). */
function buildClientNameMap(clients: DbClientLite[]): Map<string, DbClientLite[]> {
  const map = new Map<string, DbClientLite[]>();
  for (const c of clients) {
    const key = normalizeForCompare(displayName(c));
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  return map;
}

function buildTypeformProfilePayload(row: Record<string, string>): {
  payload: ClientProfileUpsert;
  mappedFields: JsonObject;
  travel: JsonObject;
  lifestyle: JsonObject;
  passions: JsonObject;
} {
  const personality_type = emptyToNull(row["Personality Type"] ?? "");
  const date_of_birth = parseOptionalDate(row["Date of Birth"] ?? "");
  const marital_status = emptyToNull(row["Marital Status"] ?? "");
  const wedding_anniversary = parseOptionalDateLoose(row["Wedding Anniversary"] ?? "");
  const blood_group = emptyToNull(row["Blood Group"] ?? "");
  const primary_city = emptyToNull(row["Primary City"] ?? "");
  const company_designation = emptyToNull(row["Company & Designation"] ?? "");
  const social_handles = emptyToNull(row["Social"] ?? "");

  const travel: JsonObject = {};
  const sp = emptyToNull(row["Seat Preference"] ?? "");
  if (sp) travel.seat_preference = sp;
  const stay = splitSemicolonList(row["Stay Preferences"] ?? "");
  if (stay.length) travel.stay_preferences = stay;
  const gtc = emptyToNull(row["Go-ToCountry"] ?? "");
  if (gtc) travel.go_to_country = gtc;
  const assist = emptyToNull(row["Needs Assistance With"] ?? "");
  if (assist) travel.needs_assistance_with = assist;

  const lifestyle: JsonObject = {};
  const diet = emptyToNull(row["Dietary Preference"] ?? "");
  if (diet) lifestyle.dietary_preference = diet;
  const cuisines = splitSemicolonList(row["Favourite Cuisine"] ?? "");
  if (cuisines.length) lifestyle.favourite_cuisine = cuisines;
  const ff = emptyToNull(row["Favourite Food"] ?? "");
  if (ff) lifestyle.favourite_food = ff;
  const fd = emptyToNull(row["Favourite Drink"] ?? "");
  if (fd) lifestyle.favourite_drink = fd;
  const rests = splitSemicolonList(row["Go-To Restaurant"] ?? "");
  if (rests.length) lifestyle.go_to_restaurant = rests;
  const brands = splitSemicolonList(row["Favourite Brands"] ?? "");
  if (brands.length) lifestyle.favourite_brands = brands;

  const passions: JsonObject = {};
  const sports = splitSemicolonList(row["Favourite Sports"] ?? "");
  if (sports.length) passions.favourite_sports = sports;
  const car = emptyToNull(row["Favourite Car"] ?? "");
  if (car) passions.favourite_car = car;
  const watch = emptyToNull(row["Favourite Watch"] ?? "");
  if (watch) passions.favourite_watch = watch;

  const mappedFields: JsonObject = {};
  if (personality_type) mappedFields.personality_type = personality_type;
  if (date_of_birth) mappedFields.date_of_birth = date_of_birth;
  if (marital_status) mappedFields.marital_status = marital_status;
  if (wedding_anniversary) mappedFields.wedding_anniversary = wedding_anniversary;
  if (blood_group) mappedFields.blood_group = blood_group;
  if (primary_city) mappedFields.primary_city = primary_city;
  if (company_designation) mappedFields.company_designation = company_designation;
  if (social_handles) mappedFields.social_handles = social_handles;
  if (Object.keys(travel).length) mappedFields.travel = travel;
  if (Object.keys(lifestyle).length) mappedFields.lifestyle = lifestyle;
  if (Object.keys(passions).length) mappedFields.passions = passions;

  const payload: ClientProfileUpsert = {
    client_id: "",
    personality_type,
    date_of_birth,
    marital_status,
    wedding_anniversary,
    blood_group,
    primary_city,
    company_designation,
    social_handles,
    travel: Object.keys(travel).length ? travel : undefined,
    lifestyle: Object.keys(lifestyle).length ? lifestyle : undefined,
    passions: Object.keys(passions).length ? passions : undefined,
    updated_at: new Date().toISOString(),
  };

  return { payload, mappedFields, travel, lifestyle, passions };
}

async function phase2Typeform(
  supabase: SupabaseClient,
  csvPath: string,
  stats: {
    p2Total: number;
    p2Matched: number;
    p2SkippedNotAClient: number;
    p2Err: number;
  },
): Promise<void> {
  if (!fs.existsSync(csvPath)) {
    console.log(`\n--- Phase 2: SKIPPED (file not found: ${csvPath}) ---`);
    console.log(
      "  Copy your cleaned Typeform export to scripts/data/typeform-data.csv\n",
    );
    return;
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const rows = csvToObjects(content);
  stats.p2Total = rows.length;
  console.log(`\n--- Phase 2: typeform (${rows.length} rows) ---\n`);

  const clientsList = await loadAllClients(supabase);
  const clientByNormName = buildClientNameMap(clientsList);

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]!;
    const nameRaw = (row["Name"] ?? "").trim();
    const email = emptyToNull(row["Email"] ?? "");

    if (!nameRaw) {
      stats.p2SkippedNotAClient += 1;
      console.log(`[TF ${idx + 1}] SKIPPED_NOT_A_CLIENT: empty Name`);
      continue;
    }

    const norm = normalizeForCompare(nameRaw);
    const candidates = clientByNormName.get(norm) ?? [];

    if (candidates.length === 0) {
      stats.p2SkippedNotAClient += 1;
      console.log(
        `[TF ${idx + 1}] SKIPPED_NOT_A_CLIENT: "${nameRaw}" (no client with matching name)`,
      );
      continue;
    }

    if (candidates.length > 1) {
      stats.p2SkippedNotAClient += 1;
      console.log(
        `[TF ${idx + 1}] SKIPPED_NOT_A_CLIENT: "${nameRaw}" (${candidates.length} clients share this normalized name)`,
      );
      continue;
    }

    const match = candidates[0]!;

    try {
      const clientId = match.id;
      const { data: existingProf, error: exErr } = await supabase
        .from("client_profiles")
        .select(
          "client_id, personality_type, date_of_birth, marital_status, wedding_anniversary, blood_group, primary_city, company_designation, social_handles, travel, lifestyle, passions",
        )
        .eq("client_id", clientId)
        .maybeSingle();
      if (exErr) throw exErr;

      const built = buildTypeformProfilePayload(row);
      built.payload.client_id = clientId;

      const exTravel = isPlainObject(existingProf?.travel)
        ? (existingProf!.travel as JsonObject)
        : {};
      const exLife = isPlainObject(existingProf?.lifestyle)
        ? (existingProf!.lifestyle as JsonObject)
        : {};
      const exPass = isPlainObject(existingProf?.passions)
        ? (existingProf!.passions as JsonObject)
        : {};

      const mergedTravel = mergeJsonObjects(exTravel, built.travel);
      const mergedLife = mergeJsonObjects(exLife, built.lifestyle);
      const mergedPass = mergeJsonObjects(exPass, built.passions);

      const mergedRow: ProfileRow = {
        personality_type:
          built.payload.personality_type ??
          (existingProf?.personality_type as string | null) ??
          null,
        date_of_birth:
          built.payload.date_of_birth ??
          (existingProf?.date_of_birth as string | null) ??
          null,
        marital_status:
          built.payload.marital_status ??
          (existingProf?.marital_status as string | null) ??
          null,
        blood_group:
          built.payload.blood_group ?? (existingProf?.blood_group as string | null) ?? null,
        primary_city:
          built.payload.primary_city ?? (existingProf?.primary_city as string | null) ?? null,
        company_designation:
          built.payload.company_designation ??
          (existingProf?.company_designation as string | null) ??
          null,
        social_handles:
          built.payload.social_handles ??
          (existingProf?.social_handles as string | null) ??
          null,
        wedding_anniversary:
          built.payload.wedding_anniversary ??
          (existingProf?.wedding_anniversary as string | null) ??
          null,
        travel: mergedTravel,
        lifestyle: mergedLife,
        passions: mergedPass,
      };

      const profile_completeness = computeProfileCompleteness(mergedRow);

      const upsertBody: ClientProfileUpsert = {
        client_id: clientId,
        personality_type: mergedRow.personality_type,
        date_of_birth: mergedRow.date_of_birth,
        marital_status: mergedRow.marital_status,
        wedding_anniversary: mergedRow.wedding_anniversary,
        blood_group: mergedRow.blood_group,
        primary_city: mergedRow.primary_city,
        company_designation: mergedRow.company_designation,
        social_handles: mergedRow.social_handles,
        travel: mergedRow.travel,
        lifestyle: mergedRow.lifestyle,
        passions: mergedRow.passions,
        profile_completeness,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from("client_profiles")
        .upsert(upsertBody, { onConflict: "client_id" });
      if (upErr) throw upErr;

      const raw_data: JsonObject = { ...row };
      const source_ref = `${nameRaw}${email ?? ""}`.slice(0, 500);

      const { count: existingSrc, error: cntErr } = await supabase
        .from("profile_sources")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("source_type", "typeform")
        .eq("source_ref", source_ref);
      if (cntErr) throw cntErr;
      if ((existingSrc ?? 0) > 0) {
        console.log(
          `[TF ${idx + 1}] profile_sources already present for this client + source_ref (profile updated)`,
        );
      } else {
        const { error: psErr } = await supabase.from("profile_sources").insert({
          client_id: clientId,
          source_type: "typeform",
          source_ref,
          raw_data,
          mapped_fields: built.mappedFields,
          confidence: 1.0,
          ingested_by: null,
        });
        if (psErr) throw psErr;
      }

      stats.p2Matched += 1;
      console.log(`[TF ${idx + 1}] MATCHED: "${nameRaw}" → client ${clientId}`);
    } catch (e) {
      stats.p2Err += 1;
      console.log(`[TF ${idx + 1}] ERROR: ${String(e)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvLocal();
  const supabase = getServiceClient();

  const clientsCsv = path.join(process.cwd(), "scripts", "data", "clients-data.csv");
  const typeformCsv = resolveTypeformPath();

  if (!fs.existsSync(clientsCsv)) {
    throw new Error(`Missing ${clientsCsv}\nPlace clients-data.csv under scripts/data/.`);
  }

  const stats = {
    p1Total: 0,
    p1Ok: 0,
    p1Fail: 0,
    p1ProfileFail: 0,
    p2Total: 0,
    p2Matched: 0,
    p2SkippedNotAClient: 0,
    p2Err: 0,
  };

  console.log("Indulge Atlas — seed-clients.ts");
  console.log("Using service role (RLS bypass).");
  console.log(`Clients CSV: ${clientsCsv}`);
  console.log(`Typeform CSV: ${typeformCsv}${fs.existsSync(typeformCsv) ? "" : " (missing)"}`);
  console.log("");
  console.log(
    "Ensure CSVs live under scripts/data/: clients-data.csv and typeform-data.csv",
  );
  console.log(
    "  (optional: use Cleaned Typeform Databse - Sheet1.csv — script auto-detects that name)\n",
  );

  await phase1ImportClients(supabase, clientsCsv, stats);
  await phase2Typeform(supabase, typeformCsv, stats);

  console.log("\n========== SUMMARY ==========\n");
  console.log(`  Phase 1 total rows:     ${stats.p1Total}`);
  console.log(`  Phase 1 clients OK:     ${stats.p1Ok}`);
  console.log(`  Phase 1 clients FAIL:   ${stats.p1Fail}`);
  console.log(`  Phase 1 profile WARN:   ${stats.p1ProfileFail}`);
  console.log("");
  console.log(`  Phase 2 total rows:               ${stats.p2Total}`);
  console.log(`  Phase 2 MATCHED:                  ${stats.p2Matched}`);
  console.log(`  Phase 2 SKIPPED_NOT_A_CLIENT:       ${stats.p2SkippedNotAClient}`);
  console.log(`  Phase 2 errors (exceptions):       ${stats.p2Err}`);
  console.log("\n=============================\n");
  console.log("Seed complete. Run `supabase gen types typescript` to refresh database types.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
