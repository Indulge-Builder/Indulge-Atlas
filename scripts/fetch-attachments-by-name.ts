/**
 * Download Freshdesk ticket attachments for a contact (by name or FD id),
 * in place under a member-data folder. Never touches freshdesk.txt / profile.txt
 * / chetto.txt — only writes into {folder}/attachments/.
 *
 * Usage:
 *   npx tsx scripts/fetch-attachments-by-name.ts --name="Nithin Kamath"
 *   npx tsx scripts/fetch-attachments-by-name.ts --fd-contact-id=1070012862667
 *   npx tsx scripts/fetch-attachments-by-name.ts --fd-contact-id=1070012862667 --folder=nithin_kamath_45c90904
 *   npx tsx scripts/fetch-attachments-by-name.ts --name="Nithin Kamath" --dry-run
 *   npx tsx scripts/fetch-attachments-by-name.ts --name="Nithin Kamath" --resume
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
} from "../lib/freshdesk/types";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const CLIENT_DELAY_MS = 1500;
const ATTACHMENT_DELAY_MS = 800;
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const MAX_RETRIES = 4;

type CliOptions = {
  name: string | null;
  fdContactId: string | null;
  folder: string | null;
  output: string;
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
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

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

function parseCli(): CliOptions {
  const limitRaw = argValue("--limit=");
  const limit = limitRaw != null ? Number(limitRaw) : null;
  return {
    name: argValue("--name="),
    fdContactId: argValue("--fd-contact-id="),
    folder: argValue("--folder="),
    output: path.resolve(process.cwd(), argValue("--output=") ?? DEFAULT_OUTPUT),
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    limit: limit != null && Number.isFinite(limit) ? limit : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
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

function extractFdId(folderName: string): string | null {
  const match = folderName.match(/_(\d{10,})$/);
  return match ? match[1]! : null;
}

/**
 * Find an existing member-data folder for a contact:
 *   1. --folder override (exact folder name under output)
 *   2. folder whose trailing FD id matches
 *   3. folder whose freshdesk.txt / profile.txt display name matches the contact
 * Falls back to {slug}_{fdId}.
 */
function resolveOutDir(
  output: string,
  contact: FreshdeskContact,
  folderOverride: string | null,
): string {
  if (folderOverride) {
    return path.isAbsolute(folderOverride)
      ? folderOverride
      : path.join(output, folderOverride);
  }

  const fdId = String(contact.id);
  const wantName = (contact.name ?? "").trim().toLowerCase();

  let nameMatch: string | null = null;
  if (fs.existsSync(output)) {
    for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (extractFdId(entry.name) === fdId) {
        return path.join(output, entry.name);
      }
      if (!nameMatch && wantName) {
        const dir = path.join(output, entry.name);
        for (const file of ["freshdesk.txt", "profile.txt"]) {
          const p = path.join(dir, file);
          if (!fs.existsSync(p)) continue;
          const text = fs.readFileSync(p, "utf8");
          const m =
            text.match(/^Freshdesk Export — (.+)$/m) ??
            text.match(/^\s*Name:\s*(.+)$/m);
          if (m?.[1]?.trim().toLowerCase() === wantName) {
            nameMatch = dir;
            break;
          }
        }
      }
    }
  }

  if (nameMatch) return nameMatch;

  const slug =
    (contact.name ?? "contact")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "contact";
  return path.join(output, `${slug}_${fdId}`);
}

async function resolveContact(
  opts: CliOptions,
): Promise<FreshdeskContact | null> {
  if (opts.fdContactId) {
    return withRateLimitRetry(`contact ${opts.fdContactId}`, () =>
      getContactById(Number(opts.fdContactId)),
    );
  }
  if (opts.name) {
    const found = await withRateLimitRetry(`name search "${opts.name}"`, () =>
      searchContactsByName(opts.name!),
    );
    return found[0] ?? null;
  }
  return null;
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
      if (isRateLimited(e) && attempt < MAX_RETRIES) {
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
  if (!opts.name && !opts.fdContactId) {
    console.log(
      'Provide --name="Full Name" or --fd-contact-id=<id>. Optional: --folder, --output, --dry-run, --resume, --limit.',
    );
    return;
  }

  const contact = await resolveContact(opts);
  if (!contact) {
    console.log("Unresolved — no Freshdesk contact found.");
    return;
  }

  const outDir = resolveOutDir(opts.output, contact, opts.folder);
  console.log(
    `Contact #${contact.id} (${contact.name}) → ${path.basename(outDir)}`,
  );
  console.log(opts.dryRun ? "Dry run — no files written." : `Output: ${outDir}`);

  const authHeader = getFreshdeskAuthHeader();

  let tickets = await withRateLimitRetry(`tickets ${contact.id}`, () =>
    listTicketsForRequester(contact.id),
  );
  if (opts.limit != null && opts.limit > 0) tickets = tickets.slice(0, opts.limit);
  console.log(`Tickets: ${tickets.length}`);

  const stats = { downloaded: 0, skipped: 0, failed: 0, withAttachments: 0 };
  const errors: string[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    let conversations;
    try {
      conversations = await withRateLimitRetry(
        `conversations ${ticket.id}`,
        () => getTicketConversations(ticket.id),
      );
    } catch (e) {
      errors.push(
        `conversations ticket ${ticket.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    for (const conv of conversations) {
      for (const att of conv.attachments) {
        stats.withAttachments++;
        const dest = path.join(
          outDir,
          "attachments",
          `ticket_${ticket.id}`,
          `conv_${conv.id}_${sanitizeFilename(att.name || `attachment_${att.id}`)}`,
        );

        if (opts.resume && fs.existsSync(dest)) {
          stats.skipped++;
          continue;
        }
        if (opts.dryRun) {
          stats.downloaded++;
          continue;
        }
        try {
          await downloadAttachment(att, dest, authHeader);
          stats.downloaded++;
          console.log(`  ✓ ticket ${ticket.id}: ${att.name}`);
          await sleep(ATTACHMENT_DELAY_MS);
        } catch (e) {
          stats.failed++;
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`attachment ${att.name} (ticket ${ticket.id}): ${msg}`);
          console.log(`  ✗ ticket ${ticket.id}: ${att.name} — ${msg}`);
        }
      }
    }

    if (!opts.dryRun && (i + 1) % 10 === 0) {
      console.log(
        `  … ${i + 1}/${tickets.length} tickets processed (${stats.downloaded} files)`,
      );
    }
  }

  console.log("");
  console.log("Done.");
  console.log(`  Attachments found: ${stats.withAttachments}`);
  console.log(
    `  Downloaded: ${stats.downloaded}  Skipped: ${stats.skipped}  Failed: ${stats.failed}`,
  );
  if (errors.length) {
    console.log(`  Errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) console.log(`    - ${e}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
