/**
 * Write freshdesk.txt into an EXISTING folder from a KNOWN Freshdesk contact id,
 * bypassing the flaky live name/phone resolution. For "resolved-but-never-written"
 * folders (resolution succeeded in a prior run but the write was killed / rate-limited).
 *
 * Never creates/renames folders. Writes freshdesk.txt only (attachments are handled
 * separately by fetch-fd-attachments-by-ticket.ts).
 *
 * Usage:
 *   npx tsx scripts/fetch-fd-by-contact.ts --folder=pranav_singla_56439f5f --contact=1070016522458
 */

import * as fs from "fs";
import * as path from "path";
import { getContactById, listTicketsForRequester } from "../lib/freshdesk/client";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const OUTPUT = "exports/member-data-2026-07-03";
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRetriable = (e: unknown) => {
  if (!(e instanceof Error)) return false;
  const m = `${e.message} ${((e as { cause?: { code?: string } }).cause?.code) ?? ""}`.toLowerCase();
  return e.message.includes("429") || /fetch failed|econnreset|etimedout|enotfound|eai_again|socket|network|timeout|und_err|terminated/.test(m);
};
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let a = 0; a <= MAX_RETRIES; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isRetriable(e) && a < MAX_RETRIES) {
        console.log(`  retry ${label} ${a + 1}/${MAX_RETRIES} in ${RETRY_DELAYS_MS[a]}ms`);
        await sleep(RETRY_DELAYS_MS[a] ?? 8000);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const folder = argValue("--folder=");
  const contactId = argValue("--contact=");
  if (!folder || !contactId) {
    console.log("Usage: --folder=<name> --contact=<freshdeskContactId>");
    process.exit(1);
  }
  const outDir = path.join(path.resolve(process.cwd(), OUTPUT), folder);
  if (!fs.existsSync(outDir)) {
    console.log(`Folder does not exist (will NOT create): ${outDir}`);
    process.exit(1);
  }
  const fdPath = path.join(outDir, "freshdesk.txt");
  if (fs.existsSync(fdPath)) {
    console.log(`freshdesk.txt already exists for ${folder} — leaving as-is.`);
    return;
  }

  console.log(`Fetching contact ${contactId} for ${folder}…`);
  const contact = await withRetry(`contact ${contactId}`, () => getContactById(Number(contactId)));
  if (!contact) {
    console.log("Contact not found.");
    process.exit(1);
  }
  const tickets = await withRetry(`tickets ${contactId}`, () => listTicketsForRequester(contact.id));
  console.log(`  ${contact.name} — ${tickets.length} tickets`);

  const text = await buildFreshdeskExportText({
    clientName: contact.name || folder,
    contact,
    tickets,
    skipConversations: process.argv.includes("--skip-conversations"),
  });
  fs.writeFileSync(fdPath, text, "utf8");
  console.log(`  wrote ${fdPath} (${tickets.length} tickets)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
