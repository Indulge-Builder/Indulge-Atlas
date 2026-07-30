/**
 * Download Freshdesk ticket attachments for folders that ALREADY have a
 * freshdesk.txt (with resolved tickets) but no attachments/ — WITHOUT re-running
 * the flaky live contact resolution. Ticket IDs are parsed straight out of
 * freshdesk.txt ("TICKET #<id>"), then conversations → attachments are fetched.
 *
 * Idempotent: existing attachment files are skipped. Never creates/renames
 * folders; only writes into {folder}/attachments/.
 *
 * Usage:
 *   npx tsx scripts/fetch-fd-attachments-by-ticket.ts --folders-file=exports/member-data-2026-07-03/_fd-attachments-16.txt
 */

import * as fs from "fs";
import * as path from "path";
import { getTicketConversations } from "../lib/freshdesk/client";
import type { FreshdeskAttachment } from "../lib/freshdesk/types";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const ATTACHMENT_DELAY_MS = 800;
const TICKET_DELAY_MS = 400;
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000, 90000];
const MAX_RETRIES = 5;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
}

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

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (isRetriable(e) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 8000;
        console.log(
          `    ${isRateLimited(e) ? "rate limited" : "network error"} on ${label} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
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

/** Pull every ticket id out of a freshdesk.txt ("TICKET #<id> ..."). */
function parseTicketIds(fdText: string): number[] {
  const ids = new Set<number>();
  for (const m of fdText.matchAll(/^TICKET #(\d+)\b/gm)) ids.add(Number(m[1]));
  return [...ids];
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

  const output = path.resolve(process.cwd(), argValue("--output=") ?? DEFAULT_OUTPUT);
  const foldersFile = argValue("--folders-file=");
  if (!foldersFile) {
    console.log("Missing --folders-file=<path>");
    process.exit(1);
  }
  const folders = readFoldersAllowList(foldersFile);
  const authHeader = getFreshdeskAuthHeader();

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const perFolder: Record<string, { downloaded: number; skipped: number; failed: number; tickets: number }> = {};

  console.log(`Fetching attachments for ${folders.length} folder(s) → ${output}\n`);

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]!;
    const outDir = path.join(output, folder);
    const fdPath = path.join(outDir, "freshdesk.txt");
    if (!fs.existsSync(fdPath)) {
      console.log(`[${i + 1}/${folders.length}] ${folder} — no freshdesk.txt, skip`);
      continue;
    }
    // Already has attachments? skip whole folder.
    const attDir = path.join(outDir, "attachments");
    const hasAny =
      fs.existsSync(attDir) &&
      fs.readdirSync(attDir).some((n) => {
        const p = path.join(attDir, n);
        return fs.statSync(p).isDirectory()
          ? fs.readdirSync(p).length > 0
          : fs.statSync(p).isFile();
      });

    const ticketIds = parseTicketIds(fs.readFileSync(fdPath, "utf8"));
    const stat = { downloaded: 0, skipped: 0, failed: 0, tickets: ticketIds.length };
    perFolder[folder] = stat;
    console.log(
      `[${i + 1}/${folders.length}] ${folder} — ${ticketIds.length} ticket(s)` +
        (hasAny ? " (already has some attachments; filling gaps)" : ""),
    );

    for (const ticketId of ticketIds) {
      let conversations;
      try {
        conversations = await withRetry(`conversations ${ticketId}`, () =>
          getTicketConversations(ticketId),
        );
      } catch (e) {
        stat.failed++;
        console.log(`    conversations ${ticketId} failed: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      for (const conv of conversations) {
        for (const att of conv.attachments) {
          const dest = path.join(
            attDir,
            `ticket_${ticketId}`,
            `conv_${conv.id}_${sanitizeFilename(att.name || `attachment_${att.id}`)}`,
          );
          if (fs.existsSync(dest)) {
            stat.skipped++;
            totalSkipped++;
            continue;
          }
          try {
            await downloadAttachment(att, dest, authHeader);
            stat.downloaded++;
            totalDownloaded++;
            await sleep(ATTACHMENT_DELAY_MS);
          } catch (e) {
            stat.failed++;
            totalFailed++;
            console.log(`    attachment "${att.name}" (ticket ${ticketId}) failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      await sleep(TICKET_DELAY_MS);
    }
    console.log(`  → ${stat.downloaded} downloaded, ${stat.skipped} skipped, ${stat.failed} failed`);
  }

  console.log("\nDone.");
  console.log(`  Total downloaded: ${totalDownloaded}`);
  console.log(`  Total skipped:    ${totalSkipped}`);
  console.log(`  Total failed:     ${totalFailed}`);
  fs.writeFileSync(
    path.join(output, "_fd-attachments-by-ticket-summary.json"),
    JSON.stringify({ totalDownloaded, totalSkipped, totalFailed, perFolder }, null, 2) + "\n",
    "utf8",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
