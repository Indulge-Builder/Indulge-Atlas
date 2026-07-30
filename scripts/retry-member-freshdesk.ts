/**
 * Retry thin freshdesk.txt + missing attachments in member-data (in place).
 *
 * Usage:
 *   npx tsx scripts/retry-member-freshdesk.ts --dry-run --limit=5
 *   npx tsx scripts/retry-member-freshdesk.ts --resume
 *   npx tsx scripts/retry-member-freshdesk.ts --client-id=3fe87e0c --resume
 *   npx tsx scripts/retry-member-freshdesk.ts --skip-attachments --resume
 */

import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import {
  findFreshdeskContactForClient,
  getContactById,
  getTicketConversations,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import type {
  FreshdeskAttachment,
  FreshdeskContact,
} from "../lib/freshdesk/types";
import {
  formatPhoneForFreshdeskLookup,
  normalizeToE164,
} from "../lib/utils/phone";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const CLIENT_DELAY_MS = 1500;
const ATTACHMENT_DELAY_MS = 800;
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const MAX_RETRIES = 4;

type CliOptions = {
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
  clientId: string | null;
  fdContactId: string | null;
  skipText: boolean;
  skipAttachments: boolean;
  clientRoot: string;
  csvPath: string;
  output: string;
};

type ContactRow = {
  freshdesk_id: string;
  name: string;
  ticket_count: number;
  atlas_client_id: string;
};

type AtlasClient = {
  prefix: string;
  folderName: string;
  clientDir: string;
};

type RetrySummary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  clientsProcessed: number;
  textUpgraded: number;
  textSkipped: number;
  textFailed: number;
  attachmentsDownloaded: number;
  attachmentsSkipped: number;
  attachmentsFailed: number;
  fdResolvedFromCsv: number;
  fdResolvedFromPhone: number;
  fdUnresolved: number;
  errors: Array<{ atlas_prefix: string; folder: string; error: string }>;
};

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

function parseCli(): CliOptions {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const clientIdArg = process.argv.find((a) => a.startsWith("--client-id="));
  const fdContactIdArg = process.argv.find((a) =>
    a.startsWith("--fd-contact-id="),
  );
  const clientRootArg = process.argv.find((a) =>
    a.startsWith("--client-root="),
  );
  const csvArg = process.argv.find((a) => a.startsWith("--csv="));
  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const limitRaw = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  return {
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    limit: limitRaw != null && Number.isFinite(limitRaw) ? limitRaw : null,
    clientId: clientIdArg ? clientIdArg.slice("--client-id=".length) : null,
    fdContactId: fdContactIdArg
      ? fdContactIdArg.slice("--fd-contact-id=".length)
      : null,
    skipText: process.argv.includes("--skip-text"),
    skipAttachments: process.argv.includes("--skip-attachments"),
    clientRoot: path.resolve(
      process.cwd(),
      clientRootArg?.slice("--client-root=".length) ??
        "exports/client-data-2026-07-03",
    ),
    csvPath: path.resolve(
      process.cwd(),
      csvArg?.slice("--csv=".length) ??
        "exports/freshdesk-data-2026-07-03/_contacts.csv",
    ),
    output: path.resolve(
      process.cwd(),
      outputArg?.slice("--output=".length) ?? DEFAULT_OUTPUT,
    ),
  };
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
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: ContactRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    if (cols.length < 9) continue;
    rows.push({
      freshdesk_id: cols[0]!.trim(),
      name: cols[1] ?? "",
      ticket_count: Number(cols[6]) || 0,
      atlas_client_id: (cols[7] ?? "").trim(),
    });
  }
  return rows;
}

function extractFdId(folderName: string): string | null {
  const match = folderName.match(/_(\d{10,})$/);
  return match ? match[1]! : null;
}

function extractAtlasPrefix(folderName: string): string | null {
  const match = folderName.match(/_([a-f0-9]{8})$/i);
  return match ? match[1]!.toLowerCase() : null;
}

function listAtlasClients(clientRoot: string): AtlasClient[] {
  const clients: AtlasClient[] = [];
  for (const entry of fs.readdirSync(clientRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const prefix = extractAtlasPrefix(entry.name);
    if (!prefix) continue;
    clients.push({
      prefix,
      folderName: entry.name,
      clientDir: path.join(clientRoot, entry.name),
    });
  }
  clients.sort((a, b) => a.folderName.localeCompare(b.folderName));
  return clients;
}

function buildCsvByAtlasPrefix(rows: ContactRow[]): Map<string, ContactRow> {
  const map = new Map<string, ContactRow>();
  for (const row of rows) {
    if (!row.atlas_client_id) continue;
    map.set(row.atlas_client_id.slice(0, 8).toLowerCase(), row);
  }
  return map;
}

function buildMemberOutIndex(output: string): {
  byFdId: Map<string, string>;
  byAtlasPrefix: Map<string, string>;
} {
  const byFdId = new Map<string, string>();
  const byAtlasPrefix = new Map<string, string>();
  if (!fs.existsSync(output)) return { byFdId, byAtlasPrefix };

  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(output, entry.name);
    const fdId = extractFdId(entry.name);
    if (fdId) byFdId.set(fdId, full);
    const prefix = extractAtlasPrefix(entry.name);
    if (prefix && !extractFdId(entry.name)) {
      byAtlasPrefix.set(prefix, full);
    }
  }
  return { byFdId, byAtlasPrefix };
}

function parseProfileFields(profilePath: string): {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
} {
  const text = fs.existsSync(profilePath)
    ? fs.readFileSync(profilePath, "utf8")
    : "";
  if (!text) {
    return { phone: null, firstName: null, lastName: null, fullName: "" };
  }

  const phoneMatch = text.match(/^\s*Phone:\s*(.+)$/m);
  const phoneRaw = phoneMatch?.[1]?.trim() ?? "";
  const phone =
    phoneRaw && phoneRaw !== "—" && phoneRaw !== "-" ? phoneRaw : null;

  const nameMatch = text.match(/^\s*Name:\s*(.+)$/m);
  const fullName = nameMatch?.[1]?.trim() ?? "";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  return { phone, firstName, lastName, fullName };
}

function normalizePhoneForLookup(phone: string | null): string | null {
  if (!phone) return null;
  const noSpace = phone.replace(/\s+/g, "").trim();
  if (!noSpace || noSpace === "—") return null;
  const e164 = normalizeToE164(noSpace);
  if (e164) return formatPhoneForFreshdeskLookup(e164) || e164;
  return noSpace;
}

function resolveOutDir(params: {
  client: AtlasClient;
  csvRow: ContactRow | null;
  memberIndex: ReturnType<typeof buildMemberOutIndex>;
  output: string;
}): string {
  const { client, csvRow, memberIndex, output } = params;

  if (csvRow) {
    const fdDir = memberIndex.byFdId.get(csvRow.freshdesk_id);
    if (fdDir) return fdDir;
  }

  const atlasDir = memberIndex.byAtlasPrefix.get(client.prefix);
  if (atlasDir) return atlasDir;

  return path.join(output, client.folderName);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("429");
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
      if (isRateLimited(e) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 8000;
        console.warn(
          `  Rate limited on ${label} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
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

function attachmentDestPath(
  outDir: string,
  ticketId: number,
  conversationId: number,
  name: string,
): string {
  const safe = sanitizeFilename(name);
  return path.join(
    outDir,
    "attachments",
    `ticket_${ticketId}`,
    `conv_${conversationId}_${safe}`,
  );
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
      if (!res.ok) {
        throw new Error(`Download failed (status ${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buf);
      return;
    } catch (e) {
      lastError = e;
      if (isRateLimited(e) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 8000);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function downloadContactAttachments(params: {
  freshdeskId: string;
  outDir: string;
  dryRun: boolean;
  resume: boolean;
  stats: { downloaded: number; skipped: number; failed: number };
  errors: RetrySummary["errors"];
  atlasPrefix: string;
  folder: string;
}): Promise<void> {
  const {
    freshdeskId,
    outDir,
    dryRun,
    resume,
    stats,
    errors,
    atlasPrefix,
    folder,
  } = params;
  const requesterId = Number(freshdeskId);
  if (!Number.isFinite(requesterId)) return;

  let authHeader: string;
  try {
    authHeader = getFreshdeskAuthHeader();
  } catch (e) {
    errors.push({
      atlas_prefix: atlasPrefix,
      folder,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  let tickets;
  try {
    tickets = await withRateLimitRetry(`tickets ${freshdeskId}`, () =>
      listTicketsForRequester(requesterId),
    );
  } catch (e) {
    errors.push({
      atlas_prefix: atlasPrefix,
      folder,
      error: `tickets: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }

  for (const ticket of tickets) {
    let conversations;
    try {
      conversations = await withRateLimitRetry(`conversations ${ticket.id}`, () =>
        getTicketConversations(ticket.id),
      );
    } catch (e) {
      errors.push({
        atlas_prefix: atlasPrefix,
        folder,
        error: `conversations ticket ${ticket.id}: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    for (const conv of conversations) {
      for (const att of conv.attachments) {
        const dest = attachmentDestPath(
          outDir,
          ticket.id,
          conv.id,
          att.name || `attachment_${att.id}`,
        );

        if (resume && fs.existsSync(dest)) {
          stats.skipped++;
          continue;
        }

        if (dryRun) {
          stats.downloaded++;
          continue;
        }

        try {
          await downloadAttachment(att, dest, authHeader);
          stats.downloaded++;
        } catch (e) {
          stats.failed++;
          errors.push({
            atlas_prefix: atlasPrefix,
            folder,
            error: `attachment ${att.name}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }

        await sleep(ATTACHMENT_DELAY_MS);
      }
    }
  }
}

const contactCache = new Map<string, FreshdeskContact | null>();

async function resolveContact(params: {
  csvRow: ContactRow | null;
  client: AtlasClient;
  stats: RetrySummary;
}): Promise<FreshdeskContact | null> {
  const { csvRow, client, stats } = params;
  const cacheKey = client.prefix;

  if (contactCache.has(cacheKey)) {
    return contactCache.get(cacheKey) ?? null;
  }

  if (csvRow?.freshdesk_id) {
    try {
      const contact = await withRateLimitRetry(
        `contact ${csvRow.freshdesk_id}`,
        () => getContactById(Number(csvRow.freshdesk_id)),
      );
      if (contact) {
        contactCache.set(cacheKey, contact);
        stats.fdResolvedFromCsv++;
        return contact;
      }
    } catch (e) {
      stats.errors.push({
        atlas_prefix: client.prefix,
        folder: client.folderName,
        error: `contact ${csvRow.freshdesk_id}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const profilePath = path.join(client.clientDir, "profile.txt");
  const { phone, firstName, lastName } = parseProfileFields(profilePath);
  const lookupPhone = normalizePhoneForLookup(phone);

  try {
    const contact = await withRateLimitRetry("phone lookup", () =>
      findFreshdeskContactForClient({
        phone: lookupPhone,
        firstName,
        lastName,
      }),
    );
    contactCache.set(cacheKey, contact);
    if (contact) stats.fdResolvedFromPhone++;
    else stats.fdUnresolved++;
    return contact;
  } catch (e) {
    contactCache.set(cacheKey, null);
    stats.fdUnresolved++;
    stats.errors.push({
      atlas_prefix: client.prefix,
      folder: client.folderName,
      error: `fd lookup: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

async function fetchFreshdeskText(
  contact: FreshdeskContact,
  clientName: string,
): Promise<string> {
  const tickets = await withRateLimitRetry(`tickets ${contact.id}`, () =>
    listTicketsForRequester(contact.id),
  );
  await sleep(CLIENT_DELAY_MS);
  return buildFreshdeskExportText({
    clientName: clientName || contact.name || "Client",
    contact,
    tickets,
  });
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();

  if (!fs.existsSync(opts.clientRoot)) {
    throw new Error(`Missing client root: ${opts.clientRoot}`);
  }
  if (!fs.existsSync(opts.csvPath)) {
    throw new Error(`Missing CSV: ${opts.csvPath}`);
  }
  if (!opts.dryRun) {
    fs.mkdirSync(opts.output, { recursive: true });
  }

  let clients = listAtlasClients(opts.clientRoot);
  const csvRows = readContactsCsv(opts.csvPath);
  const csvByPrefix = buildCsvByAtlasPrefix(csvRows);
  const memberIndex = buildMemberOutIndex(opts.output);

  if (opts.fdContactId) {
    const row = csvRows.find((r) => r.freshdesk_id === opts.fdContactId);
    if (row?.atlas_client_id) {
      const prefix = row.atlas_client_id.slice(0, 8).toLowerCase();
      clients = clients.filter((c) => c.prefix === prefix);
    } else {
      clients = [];
    }
  }

  if (opts.clientId) {
    const id = opts.clientId.toLowerCase();
    clients = clients.filter(
      (c) => c.prefix === id.slice(0, 8) || c.prefix.startsWith(id),
    );
  }

  if (opts.limit != null && opts.limit > 0) {
    clients = clients.slice(0, opts.limit);
  }

  if (!clients.length) {
    console.log("No Atlas clients matched filters.");
    return;
  }

  const stats: RetrySummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    dryRun: opts.dryRun,
    clientsProcessed: 0,
    textUpgraded: 0,
    textSkipped: 0,
    textFailed: 0,
    attachmentsDownloaded: 0,
    attachmentsSkipped: 0,
    attachmentsFailed: 0,
    fdResolvedFromCsv: 0,
    fdResolvedFromPhone: 0,
    fdUnresolved: 0,
    errors: [],
  };

  const attachStats = { downloaded: 0, skipped: 0, failed: 0 };

  console.log(
    opts.dryRun
      ? `Dry run — retry ${clients.length} client(s) → ${opts.output}`
      : `Retrying Freshdesk text + attachments for ${clients.length} client(s) → ${opts.output}`,
  );
  if (opts.skipText) console.log("Skipping freshdesk.txt refresh.");
  if (opts.skipAttachments) console.log("Skipping attachment downloads.");

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    const csvRow = csvByPrefix.get(client.prefix) ?? null;
    const outDir = resolveOutDir({
      client,
      csvRow,
      memberIndex,
      output: opts.output,
    });
    const folderName = path.basename(outDir);
    const profilePath = path.join(client.clientDir, "profile.txt");
    const { fullName } = parseProfileFields(profilePath);
    const freshdeskDest = path.join(outDir, "freshdesk.txt");

    console.log(
      `[${i + 1}/${clients.length}] ${client.folderName} → ${folderName}`,
    );

    if (!opts.dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const contact = await resolveContact({ csvRow, client, stats });
    const fdId = contact ? String(contact.id) : null;

    if (!opts.skipText && contact) {
      const existingTickets = fs.existsSync(freshdeskDest)
        ? parseTicketsFromFreshdeskText(
            fs.readFileSync(freshdeskDest, "utf8"),
          )
        : -1;

      if (opts.resume && existingTickets > 0) {
        stats.textSkipped++;
        console.log(`  freshdesk.txt: skip (${existingTickets} tickets)`);
      } else if (opts.dryRun) {
        stats.textUpgraded++;
        console.log(`  freshdesk.txt: would re-fetch via API`);
      } else {
        try {
          const text = await fetchFreshdeskText(contact, fullName);
          const newTickets = parseTicketsFromFreshdeskText(text);
          if (newTickets > existingTickets) {
            fs.writeFileSync(freshdeskDest, text, "utf8");
            stats.textUpgraded++;
            console.log(
              `  freshdesk.txt: upgraded (${existingTickets} → ${newTickets} tickets)`,
            );
          } else {
            stats.textSkipped++;
            console.log(`  freshdesk.txt: skip (no improvement)`);
          }
        } catch (e) {
          stats.textFailed++;
          const msg = e instanceof Error ? e.message : String(e);
          stats.errors.push({
            atlas_prefix: client.prefix,
            folder: folderName,
            error: `text: ${msg}`,
          });
          console.log(`  freshdesk.txt: failed — ${msg}`);
        }
      }
    } else if (!opts.skipText && !contact) {
      stats.textSkipped++;
      console.log(`  freshdesk.txt: skip (no FD contact)`);
    }

    if (!opts.skipAttachments && fdId) {
      if (opts.dryRun) {
        console.log(`  attachments: would download for FD ${fdId}`);
      } else {
        await downloadContactAttachments({
          freshdeskId: fdId,
          outDir,
          dryRun: false,
          resume: opts.resume,
          stats: attachStats,
          errors: stats.errors,
          atlasPrefix: client.prefix,
          folder: folderName,
        });
      }
    } else if (!opts.skipAttachments && !fdId) {
      console.log(`  attachments: skip (no FD contact)`);
    }

    stats.clientsProcessed++;
    if (!opts.dryRun) {
      await sleep(CLIENT_DELAY_MS);
    }
  }

  stats.attachmentsDownloaded = attachStats.downloaded;
  stats.attachmentsSkipped = attachStats.skipped;
  stats.attachmentsFailed = attachStats.failed;
  stats.finishedAt = new Date().toISOString();

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_freshdesk-retry-summary.json"),
      JSON.stringify(stats, null, 2) + "\n",
      "utf8",
    );
  }

  console.log("");
  console.log("Done.");
  console.log(`  Clients:      ${stats.clientsProcessed}`);
  console.log(
    `  Text:         ${stats.textUpgraded} upgraded, ${stats.textSkipped} skipped, ${stats.textFailed} failed`,
  );
  console.log(
    `  Attachments:  ${stats.attachmentsDownloaded} downloaded, ${stats.attachmentsSkipped} skipped, ${stats.attachmentsFailed} failed`,
  );
  console.log(
    `  FD resolved:  ${stats.fdResolvedFromCsv} csv, ${stats.fdResolvedFromPhone} phone, ${stats.fdUnresolved} unresolved`,
  );
  console.log(`  Errors:       ${stats.errors.length}`);
  if (!opts.dryRun) {
    console.log(
      `  Summary: ${path.join(opts.output, "_freshdesk-retry-summary.json")}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
