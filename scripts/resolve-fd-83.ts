/**
 * Resolve + write freshdesk.txt for an allow-list of EXISTING folders whose FD
 * contact was previously mis-reported as "unresolved". Root cause: the Freshdesk
 * contact-search helpers swallow HTTP 429 (rate limit) as an empty result, so a
 * real contact looks absent under load. Fix here: retry a null resolution with
 * backoff (a genuine no-match stays null across retries; a rate-limited false-null
 * eventually resolves), pacing requests as the SOLE Freshdesk consumer.
 *
 * Never creates/renames folders. Writes freshdesk.txt only (full service history
 * WITH conversation threads, matching sibling files). Skips folders that already
 * have a freshdesk.txt. Attachments are handled separately.
 *
 * Usage:
 *   npx tsx scripts/resolve-fd-83.ts --folders-file=exports/member-data-2026-07-03/_list-chetto-no-fd.txt
 */

import * as fs from "fs";
import * as path from "path";
import {
  findFreshdeskContactForClient,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import type { FreshdeskContact, FreshdeskTicket } from "../lib/freshdesk/types";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const OUTPUT = "exports/member-data-2026-07-03";
const CLIENT_DELAY_MS = 2500;
const CALL_RETRY_BACKOFF_MS = [5000, 15000, 30000, 60000, 90000]; // retry a thrown 429/network error

function applyEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let logStream: fs.WriteStream | null = null;
function log(msg: string): void {
  console.log(msg);
  logStream?.write(msg + "\n");
}

function isRetriable(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = `${e.message} ${((e as { cause?: { code?: string } }).cause?.code) ?? ""}`.toLowerCase();
  return /429|status 429|fetch failed|econnreset|etimedout|enotfound|eai_again|socket|network|timeout|und_err|terminated/.test(m);
}

async function callWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let a = 0; a <= CALL_RETRY_BACKOFF_MS.length; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isRetriable(e) && a < CALL_RETRY_BACKOFF_MS.length) {
        log(`    retry ${label} ${a + 1} in ${CALL_RETRY_BACKOFF_MS[a]}ms`);
        await sleep(CALL_RETRY_BACKOFF_MS[a]!);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

/**
 * Resolve a contact. The search helpers now THROW on 429/5xx (instead of
 * swallowing as empty), so callWithRetry backs off on transient errors and a
 * returned null reliably means genuine absence — no null-retry guessing needed.
 */
async function resolveContactRobust(
  name: string,
  phone: string | null,
): Promise<FreshdeskContact | null> {
  return callWithRetry("resolve", () =>
    findFreshdeskContactForClient({ phone, firstName: name, lastName: null }),
  );
}

function readProfile(outDir: string): { name: string | null; phone: string | null } {
  const p = path.join(outDir, "profile.txt");
  if (!fs.existsSync(p)) return { name: null, phone: null };
  const t = fs.readFileSync(p, "utf8");
  const name =
    t.match(/^Atlas Profile Export — (.+)$/m)?.[1]?.trim() ??
    t.match(/^\s*Name:\s*(.+)$/m)?.[1]?.trim() ??
    null;
  const raw = t.match(/^\s*Phone:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const phone = raw && raw !== "—" && /\d/.test(raw) ? raw.replace(/[‪‬‎‏]/g, "").trim() : null;
  return { name, phone };
}

function readFoldersAllowList(filePath: string): string[] {
  const resolved = path.resolve(process.cwd(), filePath);
  const out: string[] = [];
  for (const raw of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("=")) continue;
    if (/\s/.test(line)) continue;
    out.push(line);
  }
  return out;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const output = path.resolve(process.cwd(), OUTPUT);
  const foldersFile = argValue("--folders-file=");
  if (!foldersFile) {
    console.log("Missing --folders-file=<path>");
    process.exit(1);
  }
  logStream = fs.createWriteStream(path.join(output, "_fd-resolve-83-run.log"), { flags: "a" });

  const all = readFoldersAllowList(foldersFile);
  const folders = all.filter((f) => !fs.existsSync(path.join(output, f, "freshdesk.txt")));
  log(`\n=== resolve-fd-83 :: ${all.length} listed, ${folders.length} still need freshdesk.txt ===`);

  const resolved: { folder: string; id: number; name: string; tickets: number }[] = [];
  const unresolved: string[] = [];
  const failed: { folder: string; error: string }[] = [];

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]!;
    const outDir = path.join(output, folder);
    const { name, phone } = readProfile(outDir);
    log(`[${i + 1}/${folders.length}] ${folder} — "${name}" phone:${phone ?? "—"}`);

    if (!name) {
      unresolved.push(folder);
      log("  no name in profile — skip");
      continue;
    }

    let contact: FreshdeskContact | null;
    try {
      contact = await resolveContactRobust(name, phone);
    } catch (e) {
      failed.push({ folder, error: e instanceof Error ? e.message : String(e) });
      log(`  resolve error: ${e instanceof Error ? e.message : String(e)}`);
      await sleep(CLIENT_DELAY_MS);
      continue;
    }

    if (!contact) {
      unresolved.push(folder);
      log("  unresolved (no FD contact after retries)");
      await sleep(CLIENT_DELAY_MS);
      continue;
    }

    let tickets: FreshdeskTicket[];
    try {
      tickets = await callWithRetry(`tickets ${contact.id}`, () => listTicketsForRequester(contact!.id));
    } catch (e) {
      failed.push({ folder, error: `tickets: ${e instanceof Error ? e.message : String(e)}` });
      log(`  tickets error: ${e instanceof Error ? e.message : String(e)}`);
      await sleep(CLIENT_DELAY_MS);
      continue;
    }

    try {
      const text = await buildFreshdeskExportText({
        clientName: contact.name || name,
        contact,
        tickets,
        skipConversations: process.argv.includes("--skip-conversations"),
      });
      fs.writeFileSync(path.join(outDir, "freshdesk.txt"), text, "utf8");
      resolved.push({ folder, id: contact.id, name: contact.name || name, tickets: tickets.length });
      log(`  ✓ resolved #${contact.id} "${contact.name}" — ${tickets.length} tickets → freshdesk.txt`);
    } catch (e) {
      failed.push({ folder, error: `build/write: ${e instanceof Error ? e.message : String(e)}` });
      log(`  build/write error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // checkpoint summary each iteration
    fs.writeFileSync(
      path.join(output, "_fd-resolve-83-summary.json"),
      JSON.stringify({ processed: i + 1, total: folders.length, resolved, unresolved, failed }, null, 2) + "\n",
      "utf8",
    );
    await sleep(CLIENT_DELAY_MS);
  }

  log(`\nDone. resolved:${resolved.length} unresolved:${unresolved.length} failed:${failed.length}`);
  log("Resolved:");
  for (const r of resolved) log(`  ${r.folder} — #${r.id} "${r.name}" (${r.tickets} tickets)`);
  log("Unresolved (no FD contact):");
  for (const u of unresolved) log(`  ${u}`);
  if (failed.length) {
    log("Failed (needs retry):");
    for (const f of failed) log(`  ${f.folder} — ${f.error}`);
  }
  logStream?.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
