/**
 * Export Freshdesk AGENTS + GROUPS (read-only) for import into Atlas.
 *
 * - GET /agents  (paginated, per_page=100) → { fd_id, name, email, active }
 * - GET /groups  (paginated)               → { fd_group_id, name }
 * - Filters OUT non-staff/external accounts: only keeps emails ending in
 *   `@indulge.global` (drops @freshworks.com, @researchify.io, @shahdoshi.com, …).
 * - Cross-checks Atlas `public.profiles` by email (case-insensitive) to flag
 *   likely duplicates that already exist and would be SKIPPED by the importer.
 * - Honours rate limits: 429 backoff using the Retry-After header; ~1.5s between pages.
 *
 * Writes (unless --dry-run):
 *   exports/freshdesk-agents-<date>/agents.json   (kept @indulge.global agents)
 *   exports/freshdesk-agents-<date>/groups.json   (all FD groups)
 *   exports/freshdesk-agents-<date>/_summary.json
 *
 * Usage:
 *   npx tsx scripts/export-freshdesk-agents.ts --dry-run
 *   npx tsx scripts/export-freshdesk-agents.ts
 *   npx tsx scripts/export-freshdesk-agents.ts --output=exports/my-run
 */

import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";

const FRESHDESK_BASE = "https://indulge.freshdesk.com/api/v2";
const STAFF_DOMAIN = "@indulge.global";
const PAGE_DELAY_MS = 1500;
const MAX_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 5000;

type CliOptions = {
  dryRun: boolean;
  output: string | null;
};

type AgentRecord = {
  fd_id: number;
  name: string;
  email: string;
  active: boolean;
  /** True when an Atlas profile already has this email — importer will skip it. */
  existsInAtlas: boolean;
};

type GroupRecord = {
  fd_group_id: number;
  name: string;
};

type ExcludedRecord = {
  fd_id: number;
  name: string;
  email: string;
};

// ── env loading (same pattern as other freshdesk scripts) ───────────────────

function applyEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseCli(): CliOptions {
  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  return {
    dryRun: process.argv.includes("--dry-run"),
    output: outputArg ? outputArg.slice("--output=".length) : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basicAuthHeader(): string {
  const key = process.env.FRESHDESK_API_KEY?.trim();
  if (!key) throw new Error("FRESHDESK_API_KEY is not configured in .env.local");
  return `Basic ${Buffer.from(`${key}:X`, "utf8").toString("base64")}`;
}

// ── Freshdesk GET with Retry-After-aware 429 backoff ────────────────────────

async function freshdeskGet(
  pathname: string,
  query: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = new URL(`${FRESHDESK_BASE}${pathname}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: basicAuthHeader(), Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : DEFAULT_BACKOFF_MS * (attempt + 1);
      console.warn(
        `  Rate limited on ${pathname} (page ${query.page ?? "?"}) — waiting ${Math.round(
          waitMs / 1000,
        )}s (retry ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  }

  throw new Error(`Freshdesk GET ${pathname} exhausted retries (429).`);
}

async function paginate(
  pathname: string,
  label: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const { ok, status, json } = await freshdeskGet(pathname, {
      per_page: String(perPage),
      page: String(page),
    });
    if (!ok) {
      throw new Error(`Freshdesk ${label} fetch failed (status ${status})`);
    }
    if (!Array.isArray(json) || json.length === 0) break;

    for (const item of json) {
      if (item && typeof item === "object") all.push(item as Record<string, unknown>);
    }

    if (json.length < perPage) break;
    page += 1;
    await sleep(PAGE_DELAY_MS);
  }

  return all;
}

// ── parsers ─────────────────────────────────────────────────────────────────

function parseAgent(raw: Record<string, unknown>): {
  fd_id: number;
  name: string;
  email: string;
  active: boolean;
} | null {
  const fd_id = raw.id;
  if (typeof fd_id !== "number" || !Number.isFinite(fd_id)) return null;

  const contact =
    raw.contact && typeof raw.contact === "object"
      ? (raw.contact as Record<string, unknown>)
      : {};

  const name =
    typeof contact.name === "string" && contact.name.trim()
      ? contact.name.trim()
      : "";
  const email =
    typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
  // `active` lives on the contact for agents; default true when absent.
  const active =
    typeof contact.active === "boolean" ? contact.active : Boolean(raw.available);

  return { fd_id, name, email, active };
}

function parseGroup(raw: Record<string, unknown>): GroupRecord | null {
  const fd_group_id = raw.id;
  if (typeof fd_group_id !== "number" || !Number.isFinite(fd_group_id)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  return { fd_group_id, name };
}

// ── Atlas cross-check (read-only) ───────────────────────────────────────────

async function loadAtlasEmails(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.warn(
      "  (skipping Atlas dedupe cross-check — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)",
    );
    return new Set();
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.from("profiles").select("email");
  if (error) {
    console.warn(`  (Atlas dedupe cross-check failed: ${error.message})`);
    return new Set();
  }
  const set = new Set<string>();
  for (const row of data ?? []) {
    const email = (row as { email: string | null }).email;
    if (email) set.add(email.trim().toLowerCase());
  }
  return set;
}

// ── main ─────────────────────────────────────────────────────────────────────

function defaultOutputRoot(): string {
  const date = format(new Date(), "yyyy-MM-dd");
  return path.join(process.cwd(), "exports", `freshdesk-agents-${date}`);
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  if (!process.env.FRESHDESK_API_KEY?.trim()) {
    throw new Error("FRESHDESK_API_KEY is not configured in .env.local");
  }

  const opts = parseCli();
  const startedAt = new Date();
  const outputRoot = path.resolve(process.cwd(), opts.output ?? defaultOutputRoot());

  console.log("Fetching Freshdesk agents…");
  const rawAgents = await paginate("/agents", "agents");
  console.log(`  ${rawAgents.length} agent record(s) returned.`);

  await sleep(PAGE_DELAY_MS);

  console.log("Fetching Freshdesk groups…");
  const rawGroups = await paginate("/groups", "groups");
  console.log(`  ${rawGroups.length} group record(s) returned.`);

  console.log("Cross-checking Atlas profiles by email…");
  const atlasEmails = await loadAtlasEmails();
  console.log(`  ${atlasEmails.size} existing Atlas email(s) indexed.`);

  const kept: AgentRecord[] = [];
  const excluded: ExcludedRecord[] = [];
  const noEmail: ExcludedRecord[] = [];
  const seenEmails = new Set<string>();

  for (const raw of rawAgents) {
    const parsed = parseAgent(raw);
    if (!parsed) continue;

    if (!parsed.email) {
      noEmail.push({ fd_id: parsed.fd_id, name: parsed.name, email: "" });
      continue;
    }
    if (!parsed.email.endsWith(STAFF_DOMAIN)) {
      excluded.push({ fd_id: parsed.fd_id, name: parsed.name, email: parsed.email });
      continue;
    }
    if (seenEmails.has(parsed.email)) continue; // de-dupe within FD itself
    seenEmails.add(parsed.email);

    kept.push({
      fd_id: parsed.fd_id,
      name: parsed.name,
      email: parsed.email,
      active: parsed.active,
      existsInAtlas: atlasEmails.has(parsed.email),
    });
  }

  const groups: GroupRecord[] = [];
  for (const raw of rawGroups) {
    const g = parseGroup(raw);
    if (g) groups.push(g);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  kept.sort((a, b) => a.name.localeCompare(b.name));

  const likelyDuplicates = kept.filter((a) => a.existsInAtlas);
  const toCreate = kept.filter((a) => !a.existsInAtlas);

  const finishedAt = new Date();
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    dryRun: opts.dryRun,
    outputRoot,
    fdAgentsReturned: rawAgents.length,
    fdGroupsReturned: rawGroups.length,
    staffKept: kept.length,
    toCreate: toCreate.length,
    likelyDuplicates: likelyDuplicates.length,
    excludedExternal: excluded.length,
    excludedNoEmail: noEmail.length,
    excludedEmails: excluded.map((e) => e.email),
    excludedNoEmailIds: noEmail.map((e) => e.fd_id),
    likelyDuplicateEmails: likelyDuplicates.map((a) => a.email),
    groups: groups.map((g) => g.name),
  };

  // ── report ─────────────────────────────────────────────────────────────
  console.log("");
  console.log("── Summary ─────────────────────────────────────────────");
  console.log(`  FD agents returned:     ${rawAgents.length}`);
  console.log(`  Staff (@indulge.global): ${kept.length}`);
  console.log(`    → new (to create):    ${toCreate.length}`);
  console.log(`    → already in Atlas:   ${likelyDuplicates.length}`);
  console.log(`  Excluded (external):    ${excluded.length}`);
  if (excluded.length) {
    for (const e of excluded) console.log(`      - ${e.email} (${e.name || "?"})`);
  }
  if (noEmail.length) {
    console.log(`  Excluded (no email):    ${noEmail.length}`);
  }
  console.log(`  Groups:                 ${groups.length}`);
  for (const g of groups) console.log(`      - ${g.name} (#${g.fd_group_id})`);
  if (likelyDuplicates.length) {
    console.log(`  Likely duplicates (will be skipped on import):`);
    for (const a of likelyDuplicates) console.log(`      - ${a.email}`);
  }
  console.log("────────────────────────────────────────────────────────");

  if (opts.dryRun) {
    console.log(`\nDry run — nothing written. Would write to ${outputRoot}`);
    return;
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, "agents.json"),
    JSON.stringify(kept, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "groups.json"),
    JSON.stringify(groups, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "_summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nWrote:`);
  console.log(`  ${path.join(outputRoot, "agents.json")}`);
  console.log(`  ${path.join(outputRoot, "groups.json")}`);
  console.log(`  ${path.join(outputRoot, "_summary.json")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
