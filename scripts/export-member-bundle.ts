/**
 * Member bundle export — profile + Chetto + Freshdesk text + FD attachment files.
 * Option B: one folder per Freshdesk contact (499), Atlas files when phone-matched.
 *
 * Usage:
 *   npx tsx scripts/export-member-bundle.ts --dry-run --limit=3
 *   npx tsx scripts/export-member-bundle.ts --resume
 *   npx tsx scripts/export-member-bundle.ts --skip-attachments
 *   npx tsx scripts/export-member-bundle.ts --client-id=<atlas-uuid>
 *   npx tsx scripts/export-member-bundle.ts --fd-contact-id=1070038826131
 */

import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
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
  force: boolean;
  resume: boolean;
  limit: number | null;
  clientId: string | null;
  fdContactId: string | null;
  skipAttachments: boolean;
  skipChetto: boolean;
  skipProfile: boolean;
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
  atlas_client_name: string;
};

type FreshdeskPick = "fd" | "morning" | "none";

type Summary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  contactsProcessed: number;
  withProfile: number;
  withChetto: number;
  withFreshdesk: number;
  attachmentsDownloaded: number;
  attachmentsSkipped: number;
  attachmentsFailed: number;
  errors: Array<{ freshdesk_id: string; error: string }>;
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
  const fdContactIdArg = process.argv.find((a) =>
    a.startsWith("--fd-contact-id="),
  );
  const fdRootArg = process.argv.find((a) => a.startsWith("--fd-root="));
  const clientRootArg = process.argv.find((a) =>
    a.startsWith("--client-root="),
  );
  const csvArg = process.argv.find((a) => a.startsWith("--csv="));
  const outputArg = process.argv.find((a) => a.startsWith("--output="));

  const limitRaw = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  return {
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force"),
    resume: process.argv.includes("--resume"),
    limit: limitRaw != null && Number.isFinite(limitRaw) ? limitRaw : null,
    clientId: clientIdArg ? clientIdArg.slice("--client-id=".length) : null,
    fdContactId: fdContactIdArg
      ? fdContactIdArg.slice("--fd-contact-id=".length)
      : null,
    skipAttachments: process.argv.includes("--skip-attachments"),
    skipChetto: process.argv.includes("--skip-chetto"),
    skipProfile: process.argv.includes("--skip-profile"),
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
      atlas_client_name: cols[8] ?? "",
    });
  }
  return rows;
}

function extractTrailingId(folderName: string): string | null {
  const match = folderName.match(/_(\d{10,})$/);
  return match ? match[1]! : null;
}

function buildFdFolderIndex(fdRoot: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of fs.readdirSync(fdRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = extractTrailingId(entry.name);
    if (id) index.set(id, path.join(fdRoot, entry.name));
  }
  return index;
}

function buildClientFolderIndex(clientRoot: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of fs.readdirSync(clientRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/_([a-f0-9]{8})$/i);
    if (match) index.set(match[1]!.toLowerCase(), path.join(clientRoot, entry.name));
  }
  return index;
}

function safeFolderName(name: string, freshdeskId: string): string {
  const safe =
    (name || "contact")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "contact";
  return `${safe}_${freshdeskId}`;
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

function pickFreshdeskPath(params: {
  fdPath: string | null;
  morningPath: string | null;
  csvTicketCount: number;
  force: boolean;
}): { path: string | null; source: FreshdeskPick } {
  const { fdPath, morningPath, csvTicketCount, force } = params;
  const fdText = fdPath ? readIfExists(fdPath) : null;
  const morningText = morningPath ? readIfExists(morningPath) : null;

  if (force && fdPath && fdText) {
    return { path: fdPath, source: "fd" };
  }

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
  errors: Summary["errors"];
}): Promise<void> {
  const { freshdeskId, outDir, dryRun, resume, stats, errors } = params;
  const requesterId = Number(freshdeskId);
  if (!Number.isFinite(requesterId)) return;

  let authHeader: string;
  try {
    authHeader = getFreshdeskAuthHeader();
  } catch (e) {
    errors.push({
      freshdesk_id: freshdeskId,
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
      freshdesk_id: freshdeskId,
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
        freshdesk_id: freshdeskId,
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
            freshdesk_id: freshdeskId,
            error: `attachment ${att.name}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }

        await sleep(ATTACHMENT_DELAY_MS);
      }
    }
  }
}

function copyIfExists(src: string, dest: string, dryRun: boolean): boolean {
  if (!fs.existsSync(src)) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return true;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();

  if (!fs.existsSync(opts.csvPath)) {
    throw new Error(`Missing CSV: ${opts.csvPath}`);
  }
  if (!fs.existsSync(opts.fdRoot)) {
    throw new Error(`Missing FD root: ${opts.fdRoot}`);
  }
  if (!fs.existsSync(opts.clientRoot)) {
    throw new Error(`Missing client root: ${opts.clientRoot}`);
  }

  let rows = readContactsCsv(opts.csvPath);

  if (opts.fdContactId) {
    rows = rows.filter((r) => r.freshdesk_id === opts.fdContactId);
  }
  if (opts.clientId) {
    const id = opts.clientId.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.atlas_client_id.toLowerCase() === id ||
        r.atlas_client_id.toLowerCase().startsWith(id.slice(0, 8)),
    );
  }
  if (opts.limit != null && opts.limit > 0) {
    rows = rows.slice(0, opts.limit);
  }

  if (!rows.length) {
    console.log("No contacts matched filters.");
    return;
  }

  const fdIndex = buildFdFolderIndex(opts.fdRoot);
  const clientIndex = buildClientFolderIndex(opts.clientRoot);

  if (!opts.dryRun) {
    fs.mkdirSync(opts.output, { recursive: true });
  }

  const stats = {
    withProfile: 0,
    withChetto: 0,
    withFreshdesk: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
  };
  const errors: Summary["errors"] = [];

  console.log(
    opts.dryRun
      ? `Dry run — ${rows.length} bundle(s) → ${opts.output}`
      : `Building ${rows.length} member bundle(s) → ${opts.output}`,
  );
  if (opts.skipAttachments) {
    console.log("Skipping attachment downloads.");
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const fdFolder = fdIndex.get(row.freshdesk_id);
    const folderName = fdFolder
      ? path.basename(fdFolder)
      : safeFolderName(row.name, row.freshdesk_id);
    const outDir = path.join(opts.output, folderName);

    const atlasPrefix = row.atlas_client_id
      ? row.atlas_client_id.slice(0, 8).toLowerCase()
      : "";
    const clientFolder = atlasPrefix
      ? (clientIndex.get(atlasPrefix) ?? null)
      : null;

    console.log(
      `[${i + 1}/${rows.length}] ${row.name || folderName} (FD ${row.freshdesk_id})`,
    );

    if (!opts.dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    if (clientFolder && !opts.skipProfile) {
      if (
        copyIfExists(
          path.join(clientFolder, "profile.txt"),
          path.join(outDir, "profile.txt"),
          opts.dryRun,
        )
      ) {
        stats.withProfile++;
      }
    }

    if (clientFolder && !opts.skipChetto) {
      if (
        copyIfExists(
          path.join(clientFolder, "chetto.txt"),
          path.join(outDir, "chetto.txt"),
          opts.dryRun,
        )
      ) {
        stats.withChetto++;
      }
    }

    const fdFreshdesk = fdFolder
      ? path.join(fdFolder, "freshdesk.txt")
      : null;
    const morningFreshdesk = clientFolder
      ? path.join(clientFolder, "freshdesk.txt")
      : null;
    const pick = pickFreshdeskPath({
      fdPath: fdFreshdesk,
      morningPath: morningFreshdesk,
      csvTicketCount: row.ticket_count,
      force: opts.force,
    });

    if (pick.path) {
      copyIfExists(pick.path, path.join(outDir, "freshdesk.txt"), opts.dryRun);
      stats.withFreshdesk++;
    }

    if (!opts.skipAttachments) {
      await downloadContactAttachments({
        freshdeskId: row.freshdesk_id,
        outDir,
        dryRun: opts.dryRun,
        resume: opts.resume,
        stats,
        errors,
      });
    }
  }

  const finishedAt = new Date();
  const summary: Summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    dryRun: opts.dryRun,
    contactsProcessed: rows.length,
    withProfile: stats.withProfile,
    withChetto: stats.withChetto,
    withFreshdesk: stats.withFreshdesk,
    attachmentsDownloaded: stats.downloaded,
    attachmentsSkipped: stats.skipped,
    attachmentsFailed: stats.failed,
    errors,
  };

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
  }

  console.log("");
  console.log("Done.");
  console.log(`  Contacts:      ${rows.length}`);
  console.log(`  profile.txt:   ${stats.withProfile}`);
  console.log(`  chetto.txt:    ${stats.withChetto}`);
  console.log(`  freshdesk.txt: ${stats.withFreshdesk}`);
  console.log(
    `  Attachments:   ${stats.downloaded} downloaded, ${stats.skipped} skipped, ${stats.failed} failed`,
  );
  console.log(`  Errors:        ${errors.length}`);
  if (!opts.dryRun) {
    console.log(`  Output: ${opts.output}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
