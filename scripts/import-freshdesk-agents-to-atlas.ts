/**
 * Import exported Freshdesk agents into Atlas (auth.users + public.profiles).
 *
 * Reads agents.json produced by scripts/export-freshdesk-agents.ts and, for each
 * @indulge.global agent that does NOT already exist in Atlas, creates the user
 * with the SAME conventions as lib/actions/admin.ts `createUser`:
 *   - service-role auth.admin.createUser (email_confirm: true, temp password)
 *   - app_metadata: { role, domain }   (department left NULL — assign in the UI)
 *   - user_metadata: { full_name }
 *   - profiles row reconciled after the handle_new_user trigger fires
 *
 * Defaults (no CLI flags needed):
 *   role   = 'agent'
 *   domain = 'indulge_concierge'
 *   dept   = NULL
 *   onboarding = temp password + email_confirm, NO invite emails sent
 *   existing emails = SKIPPED (never recreated)
 *
 * Idempotent + resumable: safe to re-run. Never creates a duplicate auth user
 * (dedupes by email against profiles first, and treats an "already registered"
 * error from Supabase as a skip).
 *
 * Usage:
 *   npx tsx scripts/import-freshdesk-agents-to-atlas.ts --dry-run
 *   npx tsx scripts/import-freshdesk-agents-to-atlas.ts
 *   npx tsx scripts/import-freshdesk-agents-to-atlas.ts --input=exports/freshdesk-agents-2026-07-10/agents.json
 *   npx tsx scripts/import-freshdesk-agents-to-atlas.ts --limit=5
 *   npx tsx scripts/import-freshdesk-agents-to-atlas.ts --emit-passwords   (writes a creds CSV for out-of-band sharing)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { webcrypto } from "node:crypto";
import * as fs from "fs";
import * as path from "path";
import { generateTempPassword } from "../lib/utils/generate-password";

// generate-password.ts uses the Web Crypto global; guarantee it under Node.
if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

const DEFAULT_ROLE = "agent";
const DEFAULT_DOMAIN = "indulge_concierge";
const STAFF_DOMAIN = "@indulge.global";
const CREATE_DELAY_MS = 250;

type ExportedAgent = {
  fd_id: number;
  name: string;
  email: string;
  active: boolean;
  existsInAtlas?: boolean;
};

type CliOptions = {
  dryRun: boolean;
  input: string | null;
  limit: number | null;
  emitPasswords: boolean;
};

type Outcome =
  | { fd_id: number; email: string; status: "created"; profile_id: string }
  | { fd_id: number; email: string; status: "skipped_existing"; profile_id: string | null }
  | { fd_id: number; email: string; status: "failed"; error: string };

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
  const inputArg = process.argv.find((a) => a.startsWith("--input="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limitRaw = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
  if (limitRaw != null && (!Number.isFinite(limitRaw) || limitRaw <= 0)) {
    throw new Error(`Invalid --limit=${limitArg?.slice("--limit=".length)}`);
  }
  return {
    dryRun: process.argv.includes("--dry-run"),
    input: inputArg ? inputArg.slice("--input=".length) : null,
    limit: limitRaw,
    emitPasswords: process.argv.includes("--emit-passwords"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve agents.json: explicit --input, else newest exports/freshdesk-agents-* dir. */
function resolveInputFile(input: string | null): string {
  if (input) {
    const p = path.resolve(process.cwd(), input);
    if (!fs.existsSync(p)) throw new Error(`Input file not found: ${p}`);
    // Allow passing either the dir or the agents.json file directly.
    return fs.statSync(p).isDirectory() ? path.join(p, "agents.json") : p;
  }
  const exportsDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(exportsDir)) {
    throw new Error("No exports/ directory. Run export-freshdesk-agents.ts first.");
  }
  const candidates = fs
    .readdirSync(exportsDir)
    .filter((d) => d.startsWith("freshdesk-agents-"))
    .sort()
    .reverse();
  for (const dir of candidates) {
    const file = path.join(exportsDir, dir, "agents.json");
    if (fs.existsSync(file)) return file;
  }
  throw new Error("No freshdesk-agents-*/agents.json found. Run the export first.");
}

function loadAgents(file: string): ExportedAgent[] {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${file} is not a JSON array`);
  return raw
    .filter(
      (a): a is ExportedAgent =>
        a &&
        typeof a.email === "string" &&
        typeof a.fd_id === "number" &&
        a.email.toLowerCase().endsWith(STAFF_DOMAIN),
    )
    .map((a) => ({
      fd_id: a.fd_id,
      name: typeof a.name === "string" ? a.name : "",
      email: a.email.trim().toLowerCase(),
      active: a.active !== false,
    }));
}

/** Existing Atlas profiles keyed by lower(email) → id. */
async function loadExistingProfiles(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("id, email");
  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { id: string; email: string | null };
    if (r.email) map.set(r.email.trim().toLowerCase(), r.id);
  }
  return map;
}

function isAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("duplicate")
  );
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const supabase = getServiceClient();

  const inputFile = resolveInputFile(opts.input);
  let agents = loadAgents(inputFile);
  if (opts.limit != null) agents = agents.slice(0, opts.limit);

  console.log(`Input:  ${inputFile}`);
  console.log(`Agents: ${agents.length} (@indulge.global)`);
  console.log(
    `Mode:   ${opts.dryRun ? "DRY RUN (no writes)" : "LIVE"} · role=${DEFAULT_ROLE} · domain=${DEFAULT_DOMAIN} · dept=NULL · no invite emails`,
  );

  const existing = await loadExistingProfiles(supabase);
  console.log(`Existing Atlas profiles: ${existing.size}\n`);

  const outcomes: Outcome[] = [];
  const creds: Array<{ email: string; name: string; password: string }> = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]!;
    const prefix = `[${i + 1}/${agents.length}] ${agent.email}`;

    // 1. Dedupe by email — never recreate an existing Atlas user.
    const existingId = existing.get(agent.email);
    if (existingId) {
      console.log(`${prefix} — skip (already in Atlas)`);
      outcomes.push({
        fd_id: agent.fd_id,
        email: agent.email,
        status: "skipped_existing",
        profile_id: existingId,
      });
      continue;
    }

    if (opts.dryRun) {
      console.log(`${prefix} — would CREATE (${agent.name || "no name"}${agent.active ? "" : ", inactive"})`);
      outcomes.push({ fd_id: agent.fd_id, email: agent.email, status: "created", profile_id: "(dry-run)" });
      continue;
    }

    // 2. Create the auth user (temp password, email confirmed, NO email sent).
    const password = generateTempPassword(16);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: agent.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: agent.name },
      app_metadata: { role: DEFAULT_ROLE, domain: DEFAULT_DOMAIN },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "no user returned";
      if (createErr && isAlreadyRegistered(msg)) {
        // Race / stale export — resolve the id and record as skipped.
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", agent.email)
          .maybeSingle();
        console.log(`${prefix} — skip (already registered in auth)`);
        outcomes.push({
          fd_id: agent.fd_id,
          email: agent.email,
          status: "skipped_existing",
          profile_id: (prof as { id: string } | null)?.id ?? null,
        });
        continue;
      }
      console.error(`${prefix} — FAILED: ${msg}`);
      outcomes.push({ fd_id: agent.fd_id, email: agent.email, status: "failed", error: msg });
      continue;
    }

    const userId = created.user.id;

    // 3. Reconcile the profiles row (the trigger creates it; we guarantee fields).
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        full_name: agent.name || agent.email,
        role: DEFAULT_ROLE,
        domain: DEFAULT_DOMAIN,
        is_active: agent.active,
      })
      .eq("id", userId);

    if (profErr) {
      console.error(`${prefix} — created auth ${userId} but profile update failed: ${profErr.message}`);
      outcomes.push({
        fd_id: agent.fd_id,
        email: agent.email,
        status: "failed",
        error: `profile update: ${profErr.message}`,
      });
      continue;
    }

    // 4. Inactive FD agents: ban the auth user so is_active stays consistent.
    if (!agent.active) {
      await supabase.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
    }

    console.log(`${prefix} — created ${userId}${agent.active ? "" : " (inactive/banned)"}`);
    outcomes.push({ fd_id: agent.fd_id, email: agent.email, status: "created", profile_id: userId });
    existing.set(agent.email, userId); // keep dedupe map fresh for resumes
    if (opts.emitPasswords) creds.push({ email: agent.email, name: agent.name, password });

    await sleep(CREATE_DELAY_MS);
  }

  // ── report ──────────────────────────────────────────────────────────────
  const created = outcomes.filter((o) => o.status === "created");
  const skipped = outcomes.filter((o) => o.status === "skipped_existing");
  const failed = outcomes.filter((o) => o.status === "failed");

  console.log("");
  console.log("── Import summary ──────────────────────────────────────");
  console.log(`  Created:          ${created.length}`);
  console.log(`  Skipped (exists): ${skipped.length}`);
  console.log(`  Failed:           ${failed.length}`);
  if (failed.length) {
    for (const f of failed) {
      if (f.status === "failed") console.log(`      ✗ ${f.email}: ${f.error}`);
    }
  }
  console.log("────────────────────────────────────────────────────────");

  if (opts.dryRun) {
    console.log("\nDry run — no users created, no files written.");
    return;
  }

  // fd_id → profile_id mapping (created + skipped) for later group assignment.
  const outDir = path.dirname(inputFile);
  const mapping = outcomes
    .filter((o) => o.status !== "failed")
    .map((o) => ({
      fd_id: o.fd_id,
      email: o.email,
      profile_id: o.status === "created" ? o.profile_id : (o as { profile_id: string | null }).profile_id,
    }));
  const reportPath = path.join(outDir, "import-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        input: inputFile,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
        mapping,
        outcomes,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\nWrote mapping report: ${reportPath}`);

  if (opts.emitPasswords && creds.length) {
    const csv =
      "email,name,temp_password\n" +
      creds
        .map(
          (c) =>
            `${c.email},"${(c.name || "").replace(/"/g, '""')}",${c.password}`,
        )
        .join("\n") +
      "\n";
    const credsPath = path.join(outDir, "temp-passwords.csv");
    fs.writeFileSync(credsPath, csv, "utf8");
    console.log(`Wrote temp passwords (share out-of-band, then delete): ${credsPath}`);
  } else if (created.length) {
    console.log(
      "No passwords emitted. New users have a confirmed email and can set a password via the app's forgot-password flow (or re-run with --emit-passwords).",
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
