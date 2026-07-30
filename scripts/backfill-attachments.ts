/**
 * Download attachments IN PLACE for member-data folders that already have a
 * freshdesk.txt with tickets > 0 but no (non-empty) attachments/ folder.
 *
 * Resolves the Freshdesk contact from the folder's trailing FD id when present,
 * else by name (autocomplete) using the display name in freshdesk.txt.
 * Never creates a new folder; never touches profile.txt / chetto.txt /
 * freshdesk.txt.
 *
 * Usage:
 *   npx tsx scripts/backfill-attachments.ts --dry-run
 *   npx tsx scripts/backfill-attachments.ts --resume
 *   npx tsx scripts/backfill-attachments.ts --resume --limit=10
 *   npx tsx scripts/backfill-attachments.ts --resume --only=madhvi
 */

import * as fs from "fs";
import * as path from "path";
import {
  getContactById,
  getTicketConversations,
  listTicketsForRequester,
  searchContactsByName,
} from "../lib/freshdesk/client";
import type {
  FreshdeskAttachment,
  FreshdeskContact,
  FreshdeskTicket,
} from "../lib/freshdesk/types";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const CLIENT_DELAY_MS = 1500;
const ATTACHMENT_DELAY_MS = 500;
const TICKET_DELAY_MS = 350;
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 90000];
const MAX_RETRIES = 5;

type CliOptions = {
  output: string;
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
  only: string | null;
  requireChetto: boolean;
};

type FolderResult = {
  folder: string;
  displayName: string;
  resolvedFdId: string | null;
  tickets: number | null;
  downloaded: number;
  skipped: number;
  failed: number;
  status: "done" | "unresolved" | "no-tickets" | "failed" | "dry-run";
  detail?: string;
};

let logStream: fs.WriteStream | null = null;

function log(msg: string): void {
  console.log(msg);
  logStream?.write(msg + "\n");
}

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
    process.env[key] = val;
  }
}

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

function parseCli(): CliOptions {
  const limitRaw = argValue("--limit=");
  const limit = limitRaw != null ? Number(limitRaw) : null;
  return {
    output: path.resolve(process.cwd(), argValue("--output=") ?? DEFAULT_OUTPUT),
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    limit: limit != null && Number.isFinite(limit) ? limit : null,
    only: argValue("--only="),
    requireChetto: process.argv.includes("--require-chetto"),
  };
}

function extractFdId(folderName: string): string | null {
  const match = folderName.match(/_(\d{10,})$/);
  return match ? match[1]! : null;
}

function parseTickets(text: string | null): number {
  if (!text) return -1;
  if (text.includes("No Freshdesk contact found")) return 0;
  const m = text.match(/^Tickets:\s*(\d+)/m);
  if (m) return Number(m[1]);
  return 0;
}

/** Parse the concrete ticket ids already recorded in freshdesk.txt. */
function parseTicketIds(text: string | null): number[] {
  if (!text) return [];
  const ids = new Set<number>();
  const re = /^TICKET #(\d+)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.add(id);
  }
  return [...ids];
}

function readDisplayName(dir: string, folder: string): string {
  for (const f of ["freshdesk.txt", "profile.txt"]) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, "utf8");
    const m =
      t.match(/^Freshdesk Export — (.+)$/m) ?? t.match(/^\s*Name:\s*(.+)$/m);
    const n = m?.[1]?.trim();
    if (n && n !== "—" && n !== "-") return n;
  }
  return folder.replace(/_[a-f0-9]{8}$/i, "").replace(/_/g, " ");
}

function folderCompleteMarker(dir: string): string {
  return path.join(dir, "attachments", ".complete");
}

function isFolderComplete(dir: string): boolean {
  return fs.existsSync(folderCompleteMarker(dir));
}

function ticketDoneMarker(dir: string, ticketId: number): string {
  return path.join(dir, "attachments", `ticket_${ticketId}`, ".done");
}

/** Non-empty attachments folder check (shallow: ticket dir then file). */
function hasAttachments(dir: string): boolean {
  const d = path.join(dir, "attachments");
  if (!fs.existsSync(d)) return false;
  try {
    for (const t of fs.readdirSync(d, { withFileTypes: true })) {
      if (t.isFile()) return true;
      if (t.isDirectory()) {
        const sub = path.join(d, t.name);
        for (const f of fs.readdirSync(sub, { withFileTypes: true })) {
          if (f.isFile()) return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
}

/** Rate limit OR transient network failure — both worth retrying with backoff. */
function isRetriable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isRateLimited(error)) return true;
  const m = `${error.message} ${((error as { cause?: { code?: string } }).cause?.code) ?? ""}`.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("enotfound") ||
    m.includes("eai_again") ||
    m.includes("econnrefused") ||
    m.includes("epipe") ||
    m.includes("socket") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("und_err") ||
    m.includes("terminated")
  );
}

async function withRateLimitRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (isRetriable(e) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 8000;
        const kind = isRateLimited(e) ? "rate limited" : "network error";
        log(
          `    ${kind} on ${label} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

function getFreshdeskAuthHeader(): string {
  const key = process.env.FRESHDESK_API_KEY?.trim();
  if (!key) throw new Error("FRESHDESK_API_KEY is not configured");
  const token = Buffer.from(`${key}:X`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 180) || "file";
}

/** Resolve contact by folder FD id, else best name match by ticket count. */
async function resolveContact(
  fdId: string | null,
  displayName: string,
): Promise<{ contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null> {
  const candidateIds = new Set<string>();
  if (fdId) candidateIds.add(fdId);

  if (!fdId) {
    try {
      const found = await withRateLimitRetry(`name "${displayName}"`, () =>
        searchContactsByName(displayName),
      );
      for (const c of found) candidateIds.add(String(c.id));
    } catch (e) {
      log(`    name search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let best: { contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null =
    null;
  for (const id of [...candidateIds].slice(0, 6)) {
    let contact: FreshdeskContact | null = null;
    try {
      contact = await withRateLimitRetry(`contact ${id}`, () =>
        getContactById(Number(id)),
      );
    } catch {
      continue;
    }
    if (!contact) continue;
    let tickets: FreshdeskTicket[] = [];
    try {
      tickets = await withRateLimitRetry(`tickets ${id}`, () =>
        listTicketsForRequester(contact!.id),
      );
    } catch {
      continue;
    }
    if (!best || tickets.length > best.tickets.length) {
      best = { contact, tickets };
    }
  }
  return best;
}

async function downloadAttachment(
  attachment: FreshdeskAttachment,
  destPath: string,
  authHeader: string,
): Promise<void> {
  const url = attachment.attachment_url?.trim();
  if (!url) throw new Error(`No attachment_url for ${attachment.name}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid attachment URL for ${attachment.name}`);
  }
  const isS3 =
    parsed.hostname.endsWith(".amazonaws.com") ||
    parsed.hostname.endsWith(".freshworksapi.com");

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: isS3 ? {} : { Authorization: authHeader },
        cache: "no-store",
      });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 8000);
        continue;
      }
      if (!res.ok) throw new Error(`Download failed (status ${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buf);
      return;
    } catch (e) {
      lastError = e;
      if (isRetriable(e) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 8000);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  if (!fs.existsSync(opts.output)) {
    console.log(`Output folder not found: ${opts.output}`);
    return;
  }

  if (!opts.dryRun) {
    logStream = fs.createWriteStream(
      path.join(opts.output, "_attachments-backfill-run.log"),
      { flags: "a" },
    );
  }

  // Classify: freshdesk.txt tickets > 0 AND no attachments.
  const targets: { folder: string; dir: string; displayName: string; fdId: string | null; tickets: number; ticketIds: number[] }[] = [];
  for (const e of fs.readdirSync(opts.output, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith("_")) continue;
    if (opts.only && !e.name.toLowerCase().includes(opts.only.toLowerCase())) continue;
    const dir = path.join(opts.output, e.name);
    if (opts.requireChetto && !fs.existsSync(path.join(dir, "chetto.txt"))) continue;
    const fdPath = path.join(dir, "freshdesk.txt");
    if (!fs.existsSync(fdPath)) continue;
    const fdText = fs.readFileSync(fdPath, "utf8");
    const tickets = parseTickets(fdText);
    if (tickets <= 0) continue;
    // A folder is "done" only once fully processed with zero failures.
    // (Legacy folders with files but no marker get re-verified once, then marked.)
    if (isFolderComplete(dir)) continue;
    targets.push({
      folder: e.name,
      dir,
      displayName: readDisplayName(dir, e.name),
      fdId: extractFdId(e.name),
      tickets,
      ticketIds: parseTicketIds(fdText),
    });
  }

  targets.sort((a, b) => a.folder.localeCompare(b.folder));
  let work = targets;
  if (opts.limit != null && opts.limit > 0) work = work.slice(0, opts.limit);

  log(
    `${opts.dryRun ? "Dry run" : "Attachments backfill"} — ${targets.length} folder(s) need attachments, processing ${work.length} → ${opts.output}`,
  );

  const summary = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    processed: 0,
    totalDownloaded: 0,
    totalFailed: 0,
    unresolved: 0,
    results: [] as FolderResult[],
  };

  for (let i = 0; i < work.length; i++) {
    const t = work[i]!;
    log(`[${i + 1}/${work.length}] ${t.folder} — "${t.displayName}" (${t.tickets} tickets in txt)`);

    const result: FolderResult = {
      folder: t.folder,
      displayName: t.displayName,
      resolvedFdId: null,
      tickets: null,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      status: "dry-run",
    };

    if (opts.dryRun) {
      result.status = "dry-run";
      summary.results.push(result);
      summary.processed++;
      continue;
    }

    // Primary strategy: use ticket ids already recorded in freshdesk.txt.
    // This skips fragile contact re-resolution (name search) entirely.
    let ticketIds = t.ticketIds;

    if (ticketIds.length === 0) {
      // Fallback: resolve the contact by FD id / name to discover tickets.
      let resolved: { contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null;
      try {
        resolved = await resolveContact(t.fdId, t.displayName);
      } catch (e) {
        result.status = "failed";
        result.detail = e instanceof Error ? e.message : String(e);
        summary.results.push(result);
        summary.processed++;
        log(`  resolve failed — ${result.detail}`);
        continue;
      }
      if (!resolved) {
        result.status = "unresolved";
        summary.unresolved++;
        summary.results.push(result);
        log("  unresolved — no ticket ids in txt and no Freshdesk contact");
        summary.processed++;
        await sleep(CLIENT_DELAY_MS);
        continue;
      }
      result.resolvedFdId = String(resolved.contact.id);
      ticketIds = resolved.tickets.map((tk) => tk.id);
    }

    result.tickets = ticketIds.length;

    if (ticketIds.length === 0) {
      result.status = "no-tickets";
      summary.results.push(result);
      log("  no tickets to fetch");
      summary.processed++;
      await sleep(CLIENT_DELAY_MS);
      continue;
    }

    const authHeader = getFreshdeskAuthHeader();
    for (const ticketId of ticketIds) {
      // Resume: skip tickets already fully processed in a prior pass.
      if (opts.resume && fs.existsSync(ticketDoneMarker(t.dir, ticketId))) {
        continue;
      }

      let conversations;
      try {
        conversations = await withRateLimitRetry(`conversations ${ticketId}`, () =>
          getTicketConversations(ticketId),
        );
      } catch (e) {
        result.failed++;
        log(`    conversations ticket ${ticketId} failed: ${e instanceof Error ? e.message : String(e)}`);
        await sleep(TICKET_DELAY_MS);
        continue;
      }

      let ticketFailed = 0;
      for (const conv of conversations) {
        for (const att of conv.attachments) {
          const dest = path.join(
            t.dir,
            "attachments",
            `ticket_${ticketId}`,
            `conv_${conv.id}_${sanitizeFilename(att.name || `attachment_${att.id}`)}`,
          );
          if (fs.existsSync(dest)) {
            result.skipped++;
            continue;
          }
          try {
            await downloadAttachment(att, dest, authHeader);
            result.downloaded++;
            await sleep(ATTACHMENT_DELAY_MS);
          } catch (e) {
            result.failed++;
            ticketFailed++;
            log(`    attachment "${att.name}" (ticket ${ticketId}) failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Mark the ticket done only when it had no failures, so a resume pass
      // retries just the failed tickets rather than the whole folder.
      if (ticketFailed === 0) {
        const marker = ticketDoneMarker(t.dir, ticketId);
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, "");
      }
      await sleep(TICKET_DELAY_MS);
    }

    // Folder fully processed with no failures → mark complete so future
    // resume passes skip it entirely.
    if (result.failed === 0) {
      const marker = folderCompleteMarker(t.dir);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, new Date().toISOString());
    }

    result.status = "done";
    summary.totalDownloaded += result.downloaded;
    summary.totalFailed += result.failed;
    summary.results.push(result);
    summary.processed++;
    log(`  attachments: ${result.downloaded} downloaded, ${result.skipped} skipped, ${result.failed} failed`);

    if ((i + 1) % 5 === 0) {
      fs.writeFileSync(
        path.join(opts.output, "_attachments-backfill-summary.json"),
        JSON.stringify({ ...summary, finishedAt: "(in progress)" }, null, 2) + "\n",
        "utf8",
      );
    }
    await sleep(CLIENT_DELAY_MS);
  }

  summary.finishedAt = new Date().toISOString();
  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_attachments-backfill-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
  }

  log("");
  log("Done.");
  log(`  Folders needing attachments: ${targets.length}`);
  log(`  Processed:  ${summary.processed}`);
  log(`  Downloaded: ${summary.totalDownloaded}`);
  log(`  Failed:     ${summary.totalFailed}`);
  log(`  Unresolved: ${summary.unresolved}`);

  logStream?.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

































































