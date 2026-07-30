/**
 * Backfill Freshdesk text + attachments for ALL member-data folders that are
 * still empty — IN PLACE. Never creates a new folder; never writes outside the
 * --output dir; never touches profile.txt / chetto.txt.
 *
 * Method (same as the Nithin Kamath backfill):
 *   - Contact resolution via searchContactsByName() (autocomplete) + CSV +
 *     the folder's own FD id, picking the candidate with the MOST tickets.
 *   - freshdesk.txt via listTicketsForRequester + buildFreshdeskExportText.
 *   - attachments via getTicketConversations → download each conv.attachment.
 *
 * Usage:
 *   npx tsx scripts/backfill-freshdesk.ts --dry-run
 *   npx tsx scripts/backfill-freshdesk.ts --resume
 *   npx tsx scripts/backfill-freshdesk.ts --resume --skip-attachments
 *   npx tsx scripts/backfill-freshdesk.ts --resume --only=nithin
 *   npx tsx scripts/backfill-freshdesk.ts --resume --limit=25
 */

import * as fs from "fs";
import * as path from "path";
import {
  findFreshdeskContactForClient,
  getContactById,
  getTicketConversations,
  listAllContacts,
  listTicketsForRequester,
  searchContactsByName,
} from "../lib/freshdesk/client";
import type {
  FreshdeskAttachment,
  FreshdeskContact,
  FreshdeskTicket,
} from "../lib/freshdesk/types";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const DEFAULT_CSV = "exports/freshdesk-data-2026-07-03/_contacts.csv";
const CLIENT_DELAY_MS = 1500;
const ATTACHMENT_DELAY_MS = 800;
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 90000];
const MAX_RETRIES = 5;
const MAX_CANDIDATES = 6;

type CliOptions = {
  output: string;
  csvPath: string;
  dryRun: boolean;
  resume: boolean;
  force: boolean;
  skipText: boolean;
  skipAttachments: boolean;
  limit: number | null;
  only: string | null;
  foldersFile: string | null;
};

type ContactRow = { freshdesk_id: string; name: string };

type FolderResult = {
  folder: string;
  displayName: string;
  ownFdId: string | null;
  needsText: boolean;
  needsAttachments: boolean;
  resolvedFdId: string | null;
  tickets: number | null;
  textStatus:
    | "upgraded"
    | "skipped-resume"
    | "skipped-no-improvement"
    | "skipped-not-needed"
    | "unresolved"
    | "failed"
    | "dry-run";
  attachmentsDownloaded: number;
  attachmentsSkipped: number;
  attachmentsFailed: number;
  detail?: string;
};

type RunSummary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  output: string;
  foldersScanned: number;
  foldersNeedingWork: number;
  foldersProcessed: number;
  textUpgraded: number;
  unresolved: number;
  attachmentsDownloaded: number;
  attachmentsSkipped: number;
  attachmentsFailed: number;
  results: FolderResult[];
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
    csvPath: path.resolve(process.cwd(), argValue("--csv=") ?? DEFAULT_CSV),
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    force: process.argv.includes("--force"),
    skipText: process.argv.includes("--skip-text"),
    skipAttachments: process.argv.includes("--skip-attachments"),
    limit: limit != null && Number.isFinite(limit) ? limit : null,
    only: argValue("--only="),
    foldersFile: argValue("--folders-file="),
  };
}

/**
 * Load an explicit allow-list of folder names from a text file. Lines that are
 * blank, comments (#), a header/separator, or "Key: value" metadata are ignored,
 * so a report file like _report-chetto-profile-only.txt can be passed directly.
 */
function readFoldersAllowList(filePath: string): Set<string> | null {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    log(`Folders file not found: ${resolved}`);
    return null;
  }
  const set = new Set<string>();
  for (const raw of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("=")) continue;
    if (/^[A-Za-z].*:/.test(line) && line.includes(" ")) continue; // "Count: 117" etc.
    // A valid folder token: no spaces, ends in a hex or numeric suffix.
    if (/\s/.test(line)) continue;
    set.add(line);
  }
  return set;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readContactsCsv(csvPath: string): ContactRow[] {
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: ContactRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    if (cols.length < 2) continue;
    const freshdesk_id = cols[0]!.trim();
    const name = (cols[1] ?? "").trim();
    if (!freshdesk_id) continue;
    rows.push({ freshdesk_id, name });
  }
  return rows;
}

function extractFdId(folderName: string): string | null {
  const match = folderName.match(/_(\d{10,})$/);
  return match ? match[1]! : null;
}

function parseTicketsFromFreshdeskText(text: string | null): number {
  if (!text) return -1;
  if (text.includes("No Freshdesk contact found")) return 0;
  const match = text.match(/^Tickets:\s*(\d+)/m);
  if (match) return Number(match[1]);
  const history = text.match(/SERVICE HISTORY — (\d+) ticket/);
  if (history) return Number(history[1]);
  return 0;
}

function readFolderDisplayName(outDir: string, fallback: string): string {
  for (const file of ["freshdesk.txt", "profile.txt", "contact.txt"]) {
    const p = path.join(outDir, file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const m =
      text.match(/^Freshdesk Export — (.+)$/m) ??
      text.match(/^\s*Name:\s*(.+)$/m);
    const name = m?.[1]?.trim();
    if (name && name !== "—" && name !== "-") return name;
  }
  return fallback;
}

/** Read the client phone/mobile from profile.txt (most reliable resolver key). */
function readFolderPhone(outDir: string): string | null {
  for (const file of ["profile.txt", "freshdesk.txt"]) {
    const p = path.join(outDir, file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const re of [/^\s*Phone:\s*(.+)$/m, /^\s*Mobile:\s*(.+)$/m]) {
      const m = text.match(re);
      const v = m?.[1]?.trim();
      if (v && v !== "—" && v !== "-" && /\d/.test(v)) return v;
    }
  }
  return null;
}

/** Last 10 digits of a phone number — a format-agnostic match key. */
function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

type ContactsIndex = {
  byPhone: Map<string, FreshdeskContact[]>;
  byName: Map<string, FreshdeskContact[]>;
  total: number;
};

function addToMap(
  map: Map<string, FreshdeskContact[]>,
  key: string | null,
  c: FreshdeskContact,
): void {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(c);
  else map.set(key, [c]);
}

function buildContactsIndex(contacts: FreshdeskContact[]): ContactsIndex {
  const byPhone = new Map<string, FreshdeskContact[]>();
  const byName = new Map<string, FreshdeskContact[]>();
  for (const c of contacts) {
    const rec = c as unknown as {
      phone?: string | null;
      mobile?: string | null;
      name?: string | null;
    };
    addToMap(byPhone, normalizePhoneKey(rec.phone), c);
    addToMap(byPhone, normalizePhoneKey(rec.mobile), c);
    const nm = (rec.name ?? "").trim().toLowerCase();
    if (nm) addToMap(byName, nm, c);
  }
  return { byPhone, byName, total: contacts.length };
}

/**
 * Fetch the full Freshdesk contact list once and build a phone+name index.
 * Cached to _fd-contacts-full.json so repeated runs don't re-page the API.
 * Returns null if listing fails (caller falls back to live search).
 */
async function loadContactsIndex(output: string): Promise<ContactsIndex | null> {
  const cachePath = path.join(output, "_fd-contacts-full.json");
  let contacts: FreshdeskContact[] | null = null;

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (Array.isArray(cached) && cached.length) {
        contacts = cached as FreshdeskContact[];
        log(`Contacts index: loaded ${contacts.length} from cache.`);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  if (!contacts) {
    try {
      log("Contacts index: fetching full contact list from Freshdesk…");
      contacts = await withRateLimitRetry("listAllContacts", () =>
        listAllContacts(),
      );
      fs.writeFileSync(cachePath, JSON.stringify(contacts), "utf8");
      log(`Contacts index: fetched ${contacts.length} contacts (cached).`);
    } catch (e) {
      log(
        `Contacts index: fetch failed (${e instanceof Error ? e.message : String(e)}) — falling back to live search.`,
      );
      return null;
    }
  }

  return buildContactsIndex(contacts);
}

/** True if the folder has a non-empty attachments/ directory. */
function hasAttachments(outDir: string): boolean {
  const dir = path.join(outDir, "attachments");
  if (!fs.existsSync(dir)) return false;
  try {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        if (entry.isFile()) return true;
        if (entry.isDirectory()) stack.push(path.join(cur, entry.name));
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

/**
 * Resolve the BEST Freshdesk contact for a folder: gather candidate contact
 * ids (CSV name matches + autocomplete name search + the folder's own FD id),
 * fetch tickets for each, and return the candidate with the most tickets.
 */
async function resolveBestContact(
  name: string,
  csvRows: ContactRow[],
  ownFdId: string | null,
  phone: string | null = null,
  index: ContactsIndex | null = null,
): Promise<{ contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null> {
  const target = name.trim().toLowerCase();
  const candidateIds = new Set<string>();

  if (ownFdId) candidateIds.add(ownFdId);

  // Deterministic first: match against the full local contacts index by phone
  // (last-10-digits) then exact name. No API flakiness.
  if (index) {
    const phoneKey = normalizePhoneKey(phone);
    if (phoneKey) {
      for (const c of index.byPhone.get(phoneKey) ?? []) {
        candidateIds.add(String(c.id));
      }
    }
    if (target) {
      for (const c of index.byName.get(target) ?? []) {
        candidateIds.add(String(c.id));
      }
    }
  }

  // Only fall back to (flaky/expensive) live search when the deterministic
  // index found nothing.
  if (candidateIds.size === 0) {
    // Phone is the most reliable key — handles + and both phone/mobile fields.
    if (phone) {
      try {
        const byPhone = await withRateLimitRetry(`phone "${phone}"`, () =>
          findFreshdeskContactForClient({
            phone,
            firstName: name || null,
            lastName: null,
          }),
        );
        if (byPhone) candidateIds.add(String(byPhone.id));
      } catch (e) {
        log(`    phone search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (target) {
      const exact = csvRows.filter((r) => r.name.trim().toLowerCase() === target);
      const csvMatches = exact.length
        ? exact
        : csvRows.filter((r) => r.name.trim().toLowerCase().includes(target));
      for (const row of csvMatches) candidateIds.add(row.freshdesk_id);

      try {
        const found = await withRateLimitRetry(`name search "${name}"`, () =>
          searchContactsByName(name),
        );
        for (const c of found) candidateIds.add(String(c.id));
      } catch (e) {
        log(`    name search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  let best: { contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null =
    null;

  for (const id of [...candidateIds].slice(0, MAX_CANDIDATES)) {
    let contact: FreshdeskContact | null = null;
    try {
      contact = await withRateLimitRetry(`contact ${id}`, () =>
        getContactById(Number(id)),
      );
    } catch (e) {
      log(`    contact ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!contact) continue;

    let tickets: FreshdeskTicket[] = [];
    try {
      tickets = await withRateLimitRetry(`tickets ${id}`, () =>
        listTicketsForRequester(contact!.id),
      );
    } catch (e) {
      log(`    tickets ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
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

/** Download all attachments for the given tickets into {outDir}/attachments. */
async function downloadAttachmentsForTickets(
  tickets: FreshdeskTicket[],
  outDir: string,
  opts: CliOptions,
  result: FolderResult,
): Promise<void> {
  const authHeader = getFreshdeskAuthHeader();

  for (const ticket of tickets) {
    let conversations;
    try {
      conversations = await withRateLimitRetry(
        `conversations ${ticket.id}`,
        () => getTicketConversations(ticket.id),
      );
    } catch (e) {
      result.attachmentsFailed++;
      log(
        `    conversations ticket ${ticket.id} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    for (const conv of conversations) {
      for (const att of conv.attachments) {
        const dest = path.join(
          outDir,
          "attachments",
          `ticket_${ticket.id}`,
          `conv_${conv.id}_${sanitizeFilename(att.name || `attachment_${att.id}`)}`,
        );

        if (opts.resume && fs.existsSync(dest)) {
          result.attachmentsSkipped++;
          continue;
        }
        try {
          await downloadAttachment(att, dest, authHeader);
          result.attachmentsDownloaded++;
          await sleep(ATTACHMENT_DELAY_MS);
        } catch (e) {
          result.attachmentsFailed++;
          log(
            `    attachment "${att.name}" (ticket ${ticket.id}) failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }
}

function listCandidateFolders(output: string, only: string | null): string[] {
  if (!fs.existsSync(output)) return [];
  const names: string[] = [];
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;
    if (only && !entry.name.toLowerCase().includes(only.toLowerCase())) continue;
    names.push(entry.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();

  if (!fs.existsSync(opts.output)) {
    console.log(`Output folder not found: ${opts.output}`);
    return;
  }

  if (!opts.dryRun) {
    logStream = fs.createWriteStream(
      path.join(opts.output, "_freshdesk-backfill-run.log"),
      { flags: "a" },
    );
  }

  const csvRows = readContactsCsv(opts.csvPath);
  const contactsIndex = await loadContactsIndex(opts.output);
  let folders = listCandidateFolders(opts.output, opts.only);

  if (opts.foldersFile) {
    const allow = readFoldersAllowList(opts.foldersFile);
    if (!allow) return;
    const before = folders.length;
    folders = folders.filter((f) => allow.has(f));
    log(
      `Folders allow-list: ${allow.size} listed, ${folders.length} matched existing folders (from ${before} scanned).`,
    );
    const missing = [...allow].filter((f) => !folders.includes(f));
    if (missing.length > 0) {
      log(`  ${missing.length} listed folder(s) not found on disk:`);
      for (const m of missing) log(`    - ${m}`);
    }
  }

  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    dryRun: opts.dryRun,
    output: opts.output,
    foldersScanned: folders.length,
    foldersNeedingWork: 0,
    foldersProcessed: 0,
    textUpgraded: 0,
    unresolved: 0,
    attachmentsDownloaded: 0,
    attachmentsSkipped: 0,
    attachmentsFailed: 0,
    results: [],
  };

  // First pass: classify which folders need work (no network).
  const needWork: FolderResult[] = [];
  for (const folder of folders) {
    const outDir = path.join(opts.output, folder);
    const fdPath = path.join(outDir, "freshdesk.txt");
    const fdText = fs.existsSync(fdPath) ? fs.readFileSync(fdPath, "utf8") : null;
    const tickets = parseTicketsFromFreshdeskText(fdText);
    const needsText = fdText === null || tickets <= 0;
    // Attachments are downloaded for processed folders that resolve to tickets,
    // but a missing attachments/ folder alone does NOT pull a folder into scope:
    // only folders lacking freshdesk.txt or showing Tickets: 0 are processed.
    const needsAttachments = !hasAttachments(outDir) && (tickets > 0 || needsText);

    if (!needsText && !opts.force) continue;

    needWork.push({
      folder,
      displayName: readFolderDisplayName(outDir, folder),
      ownFdId: extractFdId(folder),
      needsText: needsText || opts.force,
      needsAttachments: needsAttachments || opts.force,
      resolvedFdId: null,
      tickets: null,
      textStatus: "dry-run",
      attachmentsDownloaded: 0,
      attachmentsSkipped: 0,
      attachmentsFailed: 0,
    });
  }

  summary.foldersNeedingWork = needWork.length;

  let targets = needWork;
  if (opts.limit != null && opts.limit > 0) targets = targets.slice(0, opts.limit);

  log(
    `${opts.dryRun ? "Dry run" : "Backfill"} — ${folders.length} folder(s) scanned, ` +
      `${needWork.length} need work, processing ${targets.length} → ${opts.output}`,
  );
  if (opts.skipText) log("  (skipping freshdesk.txt)");
  if (opts.skipAttachments) log("  (skipping attachments)");

  for (let i = 0; i < targets.length; i++) {
    const result = targets[i]!;
    const outDir = path.join(opts.output, result.folder);
    const phone = readFolderPhone(outDir);
    log(
      `[${i + 1}/${targets.length}] ${result.folder} — name: "${result.displayName}"` +
        (phone ? ` phone: ${phone}` : "") +
        (result.ownFdId ? ` (FD ${result.ownFdId})` : ""),
    );

    if (opts.dryRun) {
      // Cheap dry-run: resolve contact + ticket count, no conversation fetches.
      try {
        const best = await resolveBestContact(
          result.displayName,
          csvRows,
          result.ownFdId,
          phone,
          contactsIndex,
        );
        if (!best) {
          result.textStatus = "unresolved";
          summary.unresolved++;
          log("  unresolved — no Freshdesk contact found");
        } else {
          result.resolvedFdId = String(best.contact.id);
          result.tickets = best.tickets.length;
          log(
            `  would resolve → #${best.contact.id} (${best.tickets.length} tickets)` +
              `${result.needsText ? "; write freshdesk.txt" : ""}` +
              `${result.needsAttachments && !opts.skipAttachments ? "; download attachments" : ""}`,
          );
        }
      } catch (e) {
        result.textStatus = "failed";
        result.detail = e instanceof Error ? e.message : String(e);
        log(`  resolve failed — ${result.detail}`);
      }
      summary.results.push(result);
      summary.foldersProcessed++;
      await sleep(500);
      continue;
    }

    // Real run.
    let best: { contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null;
    try {
      best = await resolveBestContact(
        result.displayName,
        csvRows,
        result.ownFdId,
        phone,
        contactsIndex,
      );
    } catch (e) {
      result.textStatus = "failed";
      result.detail = e instanceof Error ? e.message : String(e);
      summary.results.push(result);
      summary.foldersProcessed++;
      log(`  resolve failed — ${result.detail}`);
      continue;
    }

    if (!best) {
      result.textStatus = "unresolved";
      summary.unresolved++;
      summary.results.push(result);
      log("  unresolved — no Freshdesk contact found (skipped, no folder created)");
      summary.foldersProcessed++;
      await sleep(CLIENT_DELAY_MS);
      continue;
    }

    result.resolvedFdId = String(best.contact.id);
    result.tickets = best.tickets.length;

    // freshdesk.txt
    const fdPath = path.join(outDir, "freshdesk.txt");
    const existingTickets = fs.existsSync(fdPath)
      ? parseTicketsFromFreshdeskText(fs.readFileSync(fdPath, "utf8"))
      : -1;

    if (opts.skipText || (!result.needsText && !opts.force)) {
      result.textStatus = "skipped-not-needed";
    } else if (opts.resume && !opts.force && existingTickets > 0) {
      result.textStatus = "skipped-resume";
    } else {
      try {
        const text = await buildFreshdeskExportText({
          clientName: best.contact.name || result.displayName,
          contact: best.contact,
          tickets: best.tickets,
        });
        const newTickets = parseTicketsFromFreshdeskText(text);
        if (opts.force || newTickets > existingTickets) {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(fdPath, text, "utf8");
          result.textStatus = "upgraded";
          summary.textUpgraded++;
          log(
            `  freshdesk.txt: upgraded (${existingTickets < 0 ? "none" : existingTickets} → ${newTickets} tickets)`,
          );
        } else {
          result.textStatus = "skipped-no-improvement";
          log(`  freshdesk.txt: skip (no improvement, ${newTickets} tickets)`);
        }
      } catch (e) {
        result.textStatus = "failed";
        result.detail = e instanceof Error ? e.message : String(e);
        log(`  freshdesk.txt: failed — ${result.detail}`);
      }
    }

    // attachments
    if (!opts.skipAttachments && (result.needsAttachments || opts.force)) {
      if (best.tickets.length === 0) {
        log("  attachments: none (0 tickets)");
      } else {
        log(`  attachments: downloading across ${best.tickets.length} ticket(s)…`);
        await downloadAttachmentsForTickets(best.tickets, outDir, opts, result);
        log(
          `  attachments: ${result.attachmentsDownloaded} downloaded, ${result.attachmentsSkipped} skipped, ${result.attachmentsFailed} failed`,
        );
      }
    }

    summary.attachmentsDownloaded += result.attachmentsDownloaded;
    summary.attachmentsSkipped += result.attachmentsSkipped;
    summary.attachmentsFailed += result.attachmentsFailed;
    summary.results.push(result);
    summary.foldersProcessed++;

    // Periodic checkpoint of the summary so long runs are inspectable.
    if (!opts.dryRun && (i + 1) % 5 === 0) {
      fs.writeFileSync(
        path.join(opts.output, "_freshdesk-backfill-summary.json"),
        JSON.stringify({ ...summary, finishedAt: "(in progress)" }, null, 2) + "\n",
        "utf8",
      );
    }

    await sleep(CLIENT_DELAY_MS);
  }

  summary.finishedAt = new Date().toISOString();

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_freshdesk-backfill-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
  }

  log("");
  log("Done.");
  log(`  Folders scanned:     ${summary.foldersScanned}`);
  log(`  Folders needing work: ${summary.foldersNeedingWork}`);
  log(`  Folders processed:   ${summary.foldersProcessed}`);
  log(`  Text upgraded:       ${summary.textUpgraded}`);
  log(`  Unresolved:          ${summary.unresolved}`);
  log(
    `  Attachments:         ${summary.attachmentsDownloaded} downloaded, ${summary.attachmentsSkipped} skipped, ${summary.attachmentsFailed} failed`,
  );
  if (!opts.dryRun) {
    log(
      `  Summary: ${path.join(opts.output, "_freshdesk-backfill-summary.json")}`,
    );
  }

  logStream?.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
