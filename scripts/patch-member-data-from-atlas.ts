/**
 * Incremental patch: fill member-data with all 460 Atlas clients.
 * Skips existing files; upgrades thin freshdesk.txt; optional attachment downloads.
 *
 * Usage:
 *   npx tsx scripts/patch-member-data-from-atlas.ts --dry-run --limit=5
 *   npx tsx scripts/patch-member-data-from-atlas.ts --resume
 *   npx tsx scripts/patch-member-data-from-atlas.ts --skip-attachments --resume
 *   npx tsx scripts/patch-member-data-from-atlas.ts --client-id=3fe87e0c
 */

import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import { findFreshdeskContactForClient } from "../lib/freshdesk/client";
import {
  getTicketConversations,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import type { FreshdeskAttachment } from "../lib/freshdesk/types";

const ATTACHMENT_DELAY_MS = 500;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

type CliOptions = {
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
  clientId: string | null;
  skipAttachments: boolean;
  fdRoot: string;
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

type PatchSummary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  clientsProcessed: number;
  foldersAdded: number;
  foldersReused: number;
  profileCopied: number;
  profileSkipped: number;
  chettoCopied: number;
  chettoSkipped: number;
  freshdeskUpgraded: number;
  freshdeskCopied: number;
  freshdeskSkipped: number;
  attachmentsDownloaded: number;
  attachmentsSkipped: number;
  attachmentsFailed: number;
  fdResolvedFromCsv: number;
  fdResolvedFromPhone: number;
  fdUnresolved: number;
  errors: Array<{ atlas_prefix: string; error: string }>;
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
  const date = format(new Date(), "yyyy-MM-dd");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const clientIdArg = process.argv.find((a) => a.startsWith("--client-id="));
  const fdRootArg = process.argv.find((a) => a.startsWith("--fd-root="));
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
    skipAttachments: process.argv.includes("--skip-attachments"),
    fdRoot: path.resolve(
      process.cwd(),
      fdRootArg?.slice("--fd-root=".length) ??
        `exports/freshdesk-data-${date}`,
    ),
    clientRoot: path.resolve(
      process.cwd(),
      clientRootArg?.slice("--client-root=".length) ??
        `exports/client-data-${date}`,
    ),
    csvPath: path.resolve(
      process.cwd(),
      csvArg?.slice("--csv=".length) ??
        `exports/freshdesk-data-${date}/_contacts.csv`,
    ),
    output: path.resolve(
      process.cwd(),
      outputArg?.slice("--output=".length) ?? `exports/member-data-${date}`,
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

function buildFdFolderIndex(root: string): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(root)) return index;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = extractFdId(entry.name);
    if (id) index.set(id, path.join(root, entry.name));
  }
  return index;
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

function buildCsvByAtlasPrefix(rows: ContactRow[]): Map<string, ContactRow> {
  const map = new Map<string, ContactRow>();
  for (const row of rows) {
    if (!row.atlas_client_id) continue;
    const prefix = row.atlas_client_id.slice(0, 8).toLowerCase();
    map.set(prefix, row);
  }
  return map;
}

function readIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
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

function isMorningSkip(text: string | null): boolean {
  if (!text) return true;
  return text.includes("No Freshdesk contact found");
}

function pickFreshdeskSource(params: {
  fdPath: string | null;
  morningPath: string | null;
  csvTicketCount: number;
}): { path: string | null; source: "fd" | "morning" | "none" } {
  const { fdPath, morningPath, csvTicketCount } = params;
  const fdText = fdPath ? readIfExists(fdPath) : null;
  const morningText = morningPath ? readIfExists(morningPath) : null;

  const fdTickets = parseTicketsFromFreshdeskText(fdText);
  const morningTickets = parseTicketsFromFreshdeskText(morningText);
  const morningSkip = isMorningSkip(morningText);

  if (!morningText || morningSkip) {
    if (fdPath && fdText) return { path: fdPath, source: "fd" };
    return { path: null, source: "none" };
  }
  if (!fdText || !fdPath) {
    return { path: morningPath, source: "morning" };
  }

  const fdScore = Math.max(fdTickets, csvTicketCount);
  if (fdScore === 0 && morningTickets > 0) {
    return { path: morningPath, source: "morning" };
  }
  if (morningTickets > fdScore) {
    return { path: morningPath, source: "morning" };
  }
  if (fdScore > morningTickets) {
    return { path: fdPath, source: "fd" };
  }
  if ((fdText.length ?? 0) >= (morningText?.length ?? 0)) {
    return { path: fdPath, source: "fd" };
  }
  return { path: morningPath, source: "morning" };
}

function parseProfileFields(profilePath: string): {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  const text = readIfExists(profilePath);
  if (!text) return { phone: null, firstName: null, lastName: null };

  const phoneMatch = text.match(/^\s*Phone:\s*(.+)$/m);
  const phoneRaw = phoneMatch?.[1]?.trim() ?? "";
  const phone =
    phoneRaw && phoneRaw !== "—" && phoneRaw !== "-" ? phoneRaw : null;

  const nameMatch = text.match(/^\s*Name:\s*(.+)$/m);
  const fullName = nameMatch?.[1]?.trim() ?? "";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  return { phone, firstName, lastName };
}

function resolveOutDir(params: {
  client: AtlasClient;
  csvRow: ContactRow | null;
  memberIndex: ReturnType<typeof buildMemberOutIndex>;
  output: string;
}): { outDir: string; reused: boolean; isNew: boolean } {
  const { client, csvRow, memberIndex, output } = params;

  if (csvRow) {
    const fdDir = memberIndex.byFdId.get(csvRow.freshdesk_id);
    if (fdDir) return { outDir: fdDir, reused: true, isNew: false };
  }

  const atlasDir = memberIndex.byAtlasPrefix.get(client.prefix);
  if (atlasDir) return { outDir: atlasDir, reused: true, isNew: false };

  const newDir = path.join(output, client.folderName);
  const exists = fs.existsSync(newDir);
  return { outDir: newDir, reused: exists, isNew: !exists };
}

function copyFileIfBetter(
  src: string,
  dest: string,
  dryRun: boolean,
): "copied" | "skipped" {
  if (!fs.existsSync(src)) return "skipped";
  if (fs.existsSync(dest)) return "skipped";
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return "copied";
}

function upgradeFreshdesk(params: {
  pickPath: string;
  destPath: string;
  dryRun: boolean;
}): "upgraded" | "copied" | "skipped" {
  const { pickPath, destPath, dryRun } = params;
  if (!fs.existsSync(pickPath)) return "skipped";

  const pickTickets = parseTicketsFromFreshdeskText(readIfExists(pickPath));
  const destTickets = fs.existsSync(destPath)
    ? parseTicketsFromFreshdeskText(readIfExists(destPath))
    : -1;

  if (fs.existsSync(destPath) && pickTickets <= destTickets) {
    return "skipped";
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(pickPath, destPath);
  }

  return fs.existsSync(destPath) ? "upgraded" : "copied";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
        await sleep(RETRY_DELAYS_MS[attempt] ?? 4000);
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
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 4000);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 4000);
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
  errors: PatchSummary["errors"];
  atlasPrefix: string;
}): Promise<void> {
  const { freshdeskId, outDir, dryRun, resume, stats, errors, atlasPrefix } =
    params;
  const requesterId = Number(freshdeskId);
  if (!Number.isFinite(requesterId)) return;

  let authHeader: string;
  try {
    authHeader = getFreshdeskAuthHeader();
  } catch (e) {
    errors.push({
      atlas_prefix: atlasPrefix,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  let tickets;
  try {
    tickets = await withRateLimitRetry(() =>
      listTicketsForRequester(requesterId),
    );
  } catch (e) {
    errors.push({
      atlas_prefix: atlasPrefix,
      error: `tickets: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }

  for (const ticket of tickets) {
    let conversations;
    try {
      conversations = await withRateLimitRetry(() =>
        getTicketConversations(ticket.id),
      );
    } catch (e) {
      errors.push({
        atlas_prefix: atlasPrefix,
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
            error: `attachment ${att.name}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }

        await sleep(ATTACHMENT_DELAY_MS);
      }
    }
  }
}

const fdIdCache = new Map<string, string | null>();

async function resolveFreshdeskId(params: {
  csvRow: ContactRow | null;
  client: AtlasClient;
  stats: PatchSummary;
}): Promise<string | null> {
  const { csvRow, client, stats } = params;

  if (csvRow?.freshdesk_id) {
    stats.fdResolvedFromCsv++;
    return csvRow.freshdesk_id;
  }

  if (fdIdCache.has(client.prefix)) {
    return fdIdCache.get(client.prefix) ?? null;
  }

  const profilePath = path.join(client.clientDir, "profile.txt");
  const { phone, firstName, lastName } = parseProfileFields(profilePath);

  try {
    const contact = await findFreshdeskContactForClient({
      phone,
      firstName,
      lastName,
    });
    const id = contact ? String(contact.id) : null;
    fdIdCache.set(client.prefix, id);
    if (id) stats.fdResolvedFromPhone++;
    else stats.fdUnresolved++;
    return id;
  } catch (e) {
    fdIdCache.set(client.prefix, null);
    stats.fdUnresolved++;
    stats.errors.push({
      atlas_prefix: client.prefix,
      error: `fd lookup: ${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
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

  let clients = listAtlasClients(opts.clientRoot);
  const csvRows = readContactsCsv(opts.csvPath);
  const csvByPrefix = buildCsvByAtlasPrefix(csvRows);
  const fdSourceIndex = buildFdFolderIndex(opts.fdRoot);
  const memberIndex = buildMemberOutIndex(opts.output);

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

  if (!opts.dryRun) {
    fs.mkdirSync(opts.output, { recursive: true });
  }

  const stats: PatchSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    dryRun: opts.dryRun,
    clientsProcessed: 0,
    foldersAdded: 0,
    foldersReused: 0,
    profileCopied: 0,
    profileSkipped: 0,
    chettoCopied: 0,
    chettoSkipped: 0,
    freshdeskUpgraded: 0,
    freshdeskCopied: 0,
    freshdeskSkipped: 0,
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
      ? `Dry run — patch ${clients.length} Atlas client(s) → ${opts.output}`
      : `Patching ${clients.length} Atlas client(s) → ${opts.output}`,
  );
  if (opts.skipAttachments) console.log("Skipping attachment downloads.");

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    const csvRow = csvByPrefix.get(client.prefix) ?? null;

    const { outDir, reused, isNew } = resolveOutDir({
      client,
      csvRow,
      memberIndex,
      output: opts.output,
    });

    if (isNew) stats.foldersAdded++;
    else if (reused) stats.foldersReused++;

    console.log(
      `[${i + 1}/${clients.length}] ${client.folderName} → ${path.basename(outDir)}${isNew ? " (new)" : ""}`,
    );

    if (!opts.dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const profileSrc = path.join(client.clientDir, "profile.txt");
    const chettoSrc = path.join(client.clientDir, "chetto.txt");
    const profileDest = path.join(outDir, "profile.txt");
    const chettoDest = path.join(outDir, "chetto.txt");
    const freshdeskDest = path.join(outDir, "freshdesk.txt");

    const profileResult = copyFileIfBetter(profileSrc, profileDest, opts.dryRun);
    if (profileResult === "copied") stats.profileCopied++;
    else stats.profileSkipped++;

    const chettoResult = copyFileIfBetter(chettoSrc, chettoDest, opts.dryRun);
    if (chettoResult === "copied") stats.chettoCopied++;
    else stats.chettoSkipped++;

    const fdFreshdesk = csvRow
      ? (fdSourceIndex.get(csvRow.freshdesk_id) ?? null)
      : null;
    const fdPath = fdFreshdesk
      ? path.join(fdFreshdesk, "freshdesk.txt")
      : null;
    const morningPath = path.join(client.clientDir, "freshdesk.txt");
    const pick = pickFreshdeskSource({
      fdPath,
      morningPath,
      csvTicketCount: csvRow?.ticket_count ?? 0,
    });

    if (pick.path) {
      const fdResult = upgradeFreshdesk({
        pickPath: pick.path,
        destPath: freshdeskDest,
        dryRun: opts.dryRun,
      });
      if (fdResult === "upgraded") stats.freshdeskUpgraded++;
      else if (fdResult === "copied") stats.freshdeskCopied++;
      else stats.freshdeskSkipped++;
    } else {
      stats.freshdeskSkipped++;
    }

    if (!opts.skipAttachments && !opts.dryRun) {
      const fdId = await resolveFreshdeskId({ csvRow, client, stats });
      if (fdId) {
        await downloadContactAttachments({
          freshdeskId: fdId,
          outDir,
          dryRun: opts.dryRun,
          resume: opts.resume,
          stats: attachStats,
          errors: stats.errors,
          atlasPrefix: client.prefix,
        });
      }
    }

    stats.clientsProcessed++;
  }

  stats.attachmentsDownloaded = attachStats.downloaded;
  stats.attachmentsSkipped = attachStats.skipped;
  stats.attachmentsFailed = attachStats.failed;
  stats.finishedAt = new Date().toISOString();

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_patch-summary.json"),
      JSON.stringify(stats, null, 2) + "\n",
      "utf8",
    );
  }

  console.log("");
  console.log("Done.");
  console.log(`  Clients:           ${stats.clientsProcessed}`);
  console.log(`  Folders added:     ${stats.foldersAdded}`);
  console.log(`  Folders reused:    ${stats.foldersReused}`);
  console.log(`  profile copied:    ${stats.profileCopied}`);
  console.log(`  chetto copied:     ${stats.chettoCopied}`);
  console.log(`  freshdesk upgraded:${stats.freshdeskUpgraded}`);
  console.log(`  freshdesk copied:  ${stats.freshdeskCopied}`);
  console.log(
    `  Attachments:       ${stats.attachmentsDownloaded} downloaded, ${stats.attachmentsSkipped} skipped, ${stats.attachmentsFailed} failed`,
  );
  console.log(`  FD from CSV:       ${stats.fdResolvedFromCsv}`);
  console.log(`  FD from phone:     ${stats.fdResolvedFromPhone}`);
  console.log(`  FD unresolved:     ${stats.fdUnresolved}`);
  console.log(`  Errors:            ${stats.errors.length}`);
  if (!opts.dryRun) {
    console.log(`  Summary: ${path.join(opts.output, "_patch-summary.json")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
