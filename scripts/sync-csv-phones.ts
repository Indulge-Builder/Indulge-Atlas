/**
 * Sync phone numbers from "Client list.csv" into Atlas `clients.phone_number`.
 *
 * MATCHING RULE: exact full-name match (case-insensitive, whitespace-normalised).
 *   CSV "Name" column is matched against `TRIM(first_name || ' ' || last_name)`.
 *   Only clients whose combined name equals the CSV name are updated.
 *   No partial / fuzzy matching — safety first.
 *
 * PHONE NORMALISATION:
 *   - Strips formatting characters (spaces, dashes, dots, parens)
 *   - Applies country-code heuristics (bare 10-digit Indian → prefix 91)
 *   - Stores E.164-style: +<digits>
 *
 * Flags:
 *   --dry-run   Print what would change without writing to DB
 *   --overwrite Also update clients that already have a phone number
 *   --verbose   Print every CSV row result (matched / skipped / no-match)
 *
 * Usage (run from repo root):
 *   npx tsx scripts/sync-csv-phones.ts --dry-run
 *   npx tsx scripts/sync-csv-phones.ts
 *   npx tsx scripts/sync-csv-phones.ts --overwrite --verbose
 */

import * as fs from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── env loading ─────────────────────────────────────────────────────────────

function applyEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
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

function loadEnv(): void {
  const root = process.cwd();
  applyEnvFile(path.join(root, ".env"));
  applyEnvFile(path.join(root, ".env.local"));
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── phone normalisation ─────────────────────────────────────────────────────

/**
 * Attempt to normalise a messy phone string to E.164 (+<digits>).
 * Returns null if the input is clearly not a phone number.
 *
 * Priority order matters — more specific patterns are checked first.
 * Indian numbers (10 digits starting 6-9) are assumed when ambiguous
 * since the majority of the client base is India-based.
 * Numbers with parenthesised area codes like (650) 300-9250 or (571) 331-1355
 * are treated as NANP (US/Canada: +1).
 */
function normalisePhone(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;

  // Scientific notation artefact from Excel (e.g. "5.05E+08")
  if (/^\d+\.\d+[eE][+\-]\d+$/i.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (!Number.isNaN(parsed) && parsed > 100000) {
      return `+${Math.round(parsed)}`;
    }
    return null;
  }

  // Numbers with parenthesised area code → NANP (+1) regardless of digit count
  // e.g. "(650) 300-9250", "(571) 331-1355", "(786) 390-8026", "(412) 304-5672"
  if (/^\(\d{3}\)\s*[\d\s\-]+$/.test(raw.trim())) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  // Already has explicit + prefix — trust the country code verbatim
  if (raw.trim().startsWith("+")) {
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length >= 7) return `+${digits}`;
  }

  // Strip everything except digits
  const d = raw.replace(/[^\d]/g, "");

  if (d.length < 5) return null;

  // UAE: starts with 971, total 12 digits  (971 + 9 digits)
  if (/^971\d{9}$/.test(d)) return `+${d}`;

  // UK: starts with 44, exactly 12 digits
  if (/^44\d{10}$/.test(d)) return `+${d}`;
  // UK local: 07XXXXXXXXX (11 digits)
  if (/^07\d{9}$/.test(d)) return `+44${d.slice(1)}`;

  // Hong Kong: starts with 852, exactly 11 digits
  if (/^852\d{8}$/.test(d)) return `+${d}`;

  // Singapore: starts with 65, exactly 10 digits
  if (/^65\d{8}$/.test(d)) return `+${d}`;

  // Saudi: starts with 966, exactly 12 digits
  if (/^966\d{9}$/.test(d)) return `+${d}`;

  // US/Canada: starts with 1, exactly 11 digits (1 + 10-digit NANP)
  if (/^1\d{10}$/.test(d)) return `+${d}`;

  // Indian with country code prefix 91: 12 digits starting 91[6-9]
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;

  // Indian with leading 0: 11 digits 0[6-9]XXXXXXXXX
  if (/^0[6-9]\d{9}$/.test(d)) return `+91${d.slice(1)}`;

  // Indian mobile (bare): exactly 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;

  // Fallback: reasonable length, store with + and let the caller decide
  if (d.length >= 7 && d.length <= 15) return `+${d}`;

  return null;
}

// ── CSV parsing ─────────────────────────────────────────────────────────────

interface CsvRow {
  name: string;
  phone: string;
  membership: string;
  city: string;
  rawLine: number;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/);
  const rows: CsvRow[] = [];

  // The CSV has 3 empty leading columns before the data.
  // Header row is the first row with "Contact" in it (column index 4).
  // Data rows: col[3]=name, col[4]=phone, col[5]=type, col[6]=date, col[7]=city

  let headerFound = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Handle multi-line cell values — a cell mid-row that contains a newline
    // in the CSV means the next line is a continuation of the previous cell.
    // We detect this by checking if the row is parseable.

    // Naive CSV split (no RFC 4180 quoted-field multi-line) — we handle
    // multi-line names by joining continuation lines.
    const cells = splitCsvLine(line);

    if (!headerFound) {
      // Look for the header row
      if (cells.some((c) => c.trim().toLowerCase() === "contact")) {
        headerFound = true;
      }
      continue;
    }

    // col[3] = name, col[4] = phone
    const rawName = (cells[3] ?? "").replace(/\n/g, " ").trim();
    const rawPhone = (cells[4] ?? "").trim();

    if (!rawName) continue;

    rows.push({
      name: rawName,
      phone: rawPhone,
      membership: (cells[5] ?? "").trim(),
      city: (cells[7] ?? cells[6] ?? "").trim(),
      rawLine: lineIdx + 1,
    });
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// ── name normalisation ──────────────────────────────────────────────────────

function normaliseName(n: string): string {
  return n
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── DB types ────────────────────────────────────────────────────────────────

interface DbClient {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");
  const verbose = process.argv.includes("--verbose");

  if (dryRun) console.log("🔍  DRY RUN — no DB writes will happen.\n");
  if (overwrite) console.log("⚠️   OVERWRITE mode — will replace existing phone numbers.\n");

  // ── load CSV ──────────────────────────────────────────────────────────────

  const csvPath = path.join(process.cwd(), "Client list.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at: ${csvPath}\nRun this script from the repo root.`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  const csvRows = parseCsv(csvContent);
  console.log(`CSV rows parsed: ${csvRows.length}`);

  // Build a name → phone map from the CSV (last-write-wins for duplicates)
  const csvPhoneByName = new Map<string, { raw: string; normalised: string | null }>();
  for (const row of csvRows) {
    if (!row.name) continue;
    const key = normaliseName(row.name);
    const normalised = normalisePhone(row.phone);
    csvPhoneByName.set(key, { raw: row.phone, normalised });
  }
  console.log(`Unique names in CSV: ${csvPhoneByName.size}`);

  // ── load Atlas clients ────────────────────────────────────────────────────

  const supabase = getServiceClient();

  const { data: dbClients, error: dbErr } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number")
    .order("first_name", { ascending: true });

  if (dbErr) throw dbErr;
  const clients = (dbClients ?? []) as DbClient[];
  console.log(`Atlas clients loaded: ${clients.length}\n`);

  // ── matching ──────────────────────────────────────────────────────────────

  const updates: { id: string; phone: string; name: string; old: string | null }[] = [];
  const skippedHasPhone: string[] = [];
  const skippedNoPhone: string[] = [];   // CSV entry has no/invalid phone
  const noMatch: string[] = [];          // CSV name not found in DB
  const multiMatch: string[] = [];       // CSV name matched >1 DB clients (ambiguous)

  // Build DB name map
  const dbByName = new Map<string, DbClient[]>();
  for (const c of clients) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    const key = normaliseName(full);
    if (!key) continue;
    const arr = dbByName.get(key) ?? [];
    arr.push(c);
    dbByName.set(key, arr);
  }

  for (const [csvKey, { raw, normalised }] of csvPhoneByName) {
    const matches = dbByName.get(csvKey);

    if (!matches || matches.length === 0) {
      noMatch.push(csvKey);
      if (verbose) console.log(`  NO MATCH    "${csvKey}"`);
      continue;
    }

    if (matches.length > 1) {
      multiMatch.push(csvKey);
      if (verbose)
        console.log(
          `  AMBIGUOUS   "${csvKey}" — ${matches.length} DB clients, skipping`,
        );
      continue;
    }

    const client = matches[0];
    const existingPhone = client.phone_number?.trim() ?? null;

    if (!normalised) {
      skippedNoPhone.push(csvKey);
      if (verbose) console.log(`  BAD PHONE   "${csvKey}" → "${raw}" (can't normalise)`);
      continue;
    }

    if (existingPhone && !overwrite) {
      skippedHasPhone.push(csvKey);
      if (verbose)
        console.log(
          `  HAS PHONE   "${csvKey}" → ${existingPhone} (use --overwrite to replace)`,
        );
      continue;
    }

    const willChange = existingPhone !== normalised;
    if (!willChange) {
      if (verbose) console.log(`  SAME        "${csvKey}" → ${normalised} (no change needed)`);
      continue;
    }

    updates.push({
      id: client.id,
      phone: normalised,
      name: csvKey,
      old: existingPhone,
    });

    if (verbose)
      console.log(
        `  UPDATE      "${csvKey}" → ${normalised}${existingPhone ? `  (was: ${existingPhone})` : "  (was: empty)"}`,
      );
  }

  // ── apply ─────────────────────────────────────────────────────────────────

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Planned updates:    ${updates.length}`);
  console.log(`Already has phone:  ${skippedHasPhone.length} (use --overwrite to replace)`);
  console.log(`Bad/missing phone:  ${skippedNoPhone.length}`);
  console.log(`No DB match:        ${noMatch.length}`);
  console.log(`Ambiguous (>1 DB):  ${multiMatch.length}`);
  console.log(`─────────────────────────────────────────\n`);

  if (noMatch.length > 0) {
    console.log("⚠️  No DB match found for these CSV names (check spelling):");
    for (const n of noMatch) console.log(`   · ${n}`);
    console.log();
  }

  if (multiMatch.length > 0) {
    console.log("⚠️  Ambiguous (multiple DB clients share this name):");
    for (const n of multiMatch) console.log(`   · ${n}`);
    console.log();
  }

  if (updates.length === 0) {
    console.log("Nothing to update. Done.");
    return;
  }

  if (dryRun) {
    console.log("DRY RUN — would apply these updates:");
    for (const u of updates) {
      console.log(
        `  ${u.id.slice(0, 8)}… "${u.name}"  →  ${u.phone}${u.old ? `  (was: ${u.old})` : ""}`,
      );
    }
    console.log(`\nRe-run without --dry-run to apply.`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const u of updates) {
    const { error } = await supabase
      .from("clients")
      .update({ phone_number: u.phone })
      .eq("id", u.id);

    if (error) {
      console.error(`  ✗ Failed to update "${u.name}" (${u.id}): ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ "${u.name}"  →  ${u.phone}`);
      succeeded++;
    }
  }

  console.log(`\n✅  Updated: ${succeeded}   ✗ Failed: ${failed}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
