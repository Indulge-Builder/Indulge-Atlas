/**
 * Export ALL Freshdesk contacts and service history (Freshdesk-first, not Atlas-matched).
 *
 * Usage:
 *   npx tsx scripts/export-all-freshdesk-data.ts --dry-run --limit=5
 *   npx tsx scripts/export-all-freshdesk-data.ts --limit=10
 *   npx tsx scripts/export-all-freshdesk-data.ts --contact-id=12345
 *   npx tsx scripts/export-all-freshdesk-data.ts --skip-conversations
 *   npx tsx scripts/export-all-freshdesk-data.ts --output=exports/my-freshdesk-run
 */

import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import { chettoPhoneLookupVariants } from "../lib/actions/chetto";
import {
  getContactById,
  listAllContacts,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import type { FreshdeskContact, FreshdeskTicket } from "../lib/freshdesk/types";
import {
  buildContactSection,
  buildFreshdeskExportText,
} from "./lib/export-formatters";

const CONTACT_DELAY_MS = 400;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  contactId: number | null;
  skipConversations: boolean;
  output: string | null;
};

type AtlasClientRef = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
};

type ExportError = {
  freshdeskId: number;
  folder: string;
  stage: "contacts" | "tickets" | "conversations" | "write";
  error: string;
};

type ContactRow = {
  freshdesk_id: number;
  name: string;
  phone: string;
  mobile: string;
  email: string;
  active: boolean;
  ticket_count: number;
  atlas_client_id: string;
  atlas_client_name: string;
  folder: string;
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
  const contactIdArg = process.argv.find((a) =>
    a.startsWith("--contact-id="),
  );
  const outputArg = process.argv.find((a) => a.startsWith("--output="));

  const contactIdRaw = contactIdArg?.slice("--contact-id=".length);
  const contactId =
    contactIdRaw != null && contactIdRaw.length > 0
      ? Number(contactIdRaw)
      : null;
  if (contactId != null && !Number.isFinite(contactId)) {
    throw new Error(`Invalid --contact-id=${contactIdRaw}`);
  }

  const limitRaw = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
  if (limitRaw != null && (!Number.isFinite(limitRaw) || limitRaw <= 0)) {
    throw new Error(`Invalid --limit=${limitArg?.slice("--limit=".length)}`);
  }

  return {
    dryRun: process.argv.includes("--dry-run"),
    limit: limitRaw,
    contactId,
    skipConversations: process.argv.includes("--skip-conversations"),
    output: outputArg ? outputArg.slice("--output=".length) : null,
  };
}

function defaultOutputRoot(): string {
  const date = format(new Date(), "yyyy-MM-dd");
  return path.join(process.cwd(), "exports", `freshdesk-data-${date}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\(status (\d+)\)/);
  return match ? Number(match[1]) : null;
}

function isRateLimited(error: unknown): boolean {
  return extractHttpStatus(error) === 429;
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
        const delay = RETRY_DELAYS_MS[attempt] ?? 4000;
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

function getServiceClient() {
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

function contactFolderName(contact: FreshdeskContact): string {
  const safe =
    (contact.name || "contact")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "contact";
  return `${safe}_${contact.id}`;
}

function atlasClientDisplayName(client: AtlasClientRef): string {
  return [client.first_name, client.last_name].filter(Boolean).join(" ").trim();
}

function buildAtlasPhoneIndex(
  clients: AtlasClientRef[],
): Map<string, AtlasClientRef> {
  const index = new Map<string, AtlasClientRef>();
  for (const client of clients) {
    const phone = client.phone_number?.trim() ?? "";
    if (!phone) continue;
    for (const variant of chettoPhoneLookupVariants(phone)) {
      if (!index.has(variant)) {
        index.set(variant, client);
      }
    }
  }
  return index;
}

function matchAtlasClient(
  contact: FreshdeskContact,
  phoneIndex: Map<string, AtlasClientRef>,
): AtlasClientRef | null {
  const candidates = [contact.phone, contact.mobile];
  for (const raw of candidates) {
    const trimmed = raw?.trim() ?? "";
    if (!trimmed) continue;
    for (const variant of chettoPhoneLookupVariants(trimmed)) {
      const hit = phoneIndex.get(variant);
      if (hit) return hit;
    }
  }
  return null;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(values: string[]): string {
  return values.map(csvEscape).join(",");
}

async function loadAtlasClients(): Promise<AtlasClientRef[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number")
    .order("first_name");

  if (error) {
    throw new Error(`Supabase clients fetch failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    first_name: String(row.first_name ?? ""),
    last_name: (row.last_name as string | null) ?? null,
    phone_number: (row.phone_number as string | null) ?? null,
  }));
}

async function fetchContacts(opts: CliOptions): Promise<FreshdeskContact[]> {
  if (opts.contactId != null) {
    const one = await withRateLimitRetry(`contact:${opts.contactId}`, () =>
      getContactById(opts.contactId!),
    );
    if (!one) {
      throw new Error(`Freshdesk contact ${opts.contactId} not found`);
    }
    return [one];
  }

  let contacts = await withRateLimitRetry("listAllContacts", () =>
    listAllContacts(),
  );

  if (opts.limit != null && opts.limit > 0) {
    contacts = contacts.slice(0, opts.limit);
  }

  return contacts;
}

async function processContact(
  contact: FreshdeskContact,
  opts: CliOptions,
  outputRoot: string,
  phoneIndex: Map<string, AtlasClientRef>,
  errors: ExportError[],
): Promise<ContactRow> {
  const folder = contactFolderName(contact);
  const contactDir = path.join(outputRoot, folder);
  const atlas = matchAtlasClient(contact, phoneIndex);
  const atlasName = atlas ? atlasClientDisplayName(atlas) : "";

  let tickets: FreshdeskTicket[] = [];
  try {
    tickets = await withRateLimitRetry(`tickets:${contact.id}`, () =>
      listTicketsForRequester(contact.id),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      freshdeskId: contact.id,
      folder,
      stage: "tickets",
      error: msg,
    });
    console.error(`  ✗ tickets for ${contact.id}: ${msg}`);
  }

  if (!opts.dryRun) {
    fs.mkdirSync(contactDir, { recursive: true });
  }

  const contactText = buildContactSection(contact).join("\n") + "\n";

  try {
    if (!opts.dryRun) {
      fs.writeFileSync(path.join(contactDir, "contact.txt"), contactText, "utf8");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      freshdeskId: contact.id,
      folder,
      stage: "write",
      error: `contact.txt: ${msg}`,
    });
  }

  try {
    const freshdeskText = await buildFreshdeskExportText({
      clientName: contact.name || `Contact ${contact.id}`,
      contact,
      tickets,
      skipConversations: opts.skipConversations,
    });

    if (!opts.dryRun) {
      fs.writeFileSync(
        path.join(contactDir, "freshdesk.txt"),
        freshdeskText,
        "utf8",
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      freshdeskId: contact.id,
      folder,
      stage: opts.skipConversations ? "write" : "conversations",
      error: `freshdesk.txt: ${msg}`,
    });
    console.error(`  ✗ export for ${contact.id}: ${msg}`);
  }

  return {
    freshdesk_id: contact.id,
    name: contact.name || "",
    phone: contact.phone || "",
    mobile: contact.mobile || "",
    email: contact.email || "",
    active: contact.active,
    ticket_count: tickets.length,
    atlas_client_id: atlas?.id ?? "",
    atlas_client_name: atlasName,
    folder,
  };
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  if (!process.env.FRESHDESK_API_KEY?.trim()) {
    throw new Error("FRESHDESK_API_KEY is not configured in .env.local");
  }

  const opts = parseCli();
  const startedAt = new Date();
  const outputRoot = path.resolve(
    process.cwd(),
    opts.output ?? defaultOutputRoot(),
  );

  if (!opts.dryRun) {
    fs.mkdirSync(outputRoot, { recursive: true });
  }

  console.log("Loading Atlas clients for phone join…");
  const atlasClients = await loadAtlasClients();
  const phoneIndex = buildAtlasPhoneIndex(atlasClients);
  console.log(
    `Indexed ${phoneIndex.size} phone variant(s) from ${atlasClients.length} Atlas client(s).`,
  );

  console.log("Fetching Freshdesk contacts…");
  const contacts = await fetchContacts(opts);
  if (!contacts.length) {
    console.log("No Freshdesk contacts to export.");
    return;
  }

  const errors: ExportError[] = [];
  const rows: ContactRow[] = [];

  console.log(
    opts.dryRun
      ? `Dry run — ${contacts.length} contact(s) → ${outputRoot}`
      : `Exporting ${contacts.length} Freshdesk contact(s) → ${outputRoot}`,
  );
  if (opts.skipConversations) {
    console.log("Skipping conversation fetches (--skip-conversations).");
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]!;
    const prefix = `[${i + 1}/${contacts.length}]`;
    console.log(`${prefix} ${contact.name || "(no name)"} (#${contact.id})`);

    const row = await processContact(
      contact,
      opts,
      outputRoot,
      phoneIndex,
      errors,
    );
    rows.push(row);

    if (i < contacts.length - 1) {
      await sleep(CONTACT_DELAY_MS);
    }
  }

  const csvHeader = [
    "freshdesk_id",
    "name",
    "phone",
    "mobile",
    "email",
    "active",
    "ticket_count",
    "atlas_client_id",
    "atlas_client_name",
  ].join(",");

  const csvBody = rows
    .map((r) =>
      csvRow([
        String(r.freshdesk_id),
        r.name,
        r.phone,
        r.mobile,
        r.email,
        r.active ? "true" : "false",
        String(r.ticket_count),
        r.atlas_client_id,
        r.atlas_client_name,
      ]),
    )
    .join("\n");

  const csvPath = path.join(outputRoot, "_contacts.csv");
  if (!opts.dryRun) {
    fs.writeFileSync(csvPath, `${csvHeader}\n${csvBody}\n`, "utf8");
  }

  const atlasMatched = rows.filter((r) => r.atlas_client_id).length;
  const totalTickets = rows.reduce((sum, r) => sum + r.ticket_count, 0);
  const finishedAt = new Date();

  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    dryRun: opts.dryRun,
    skipConversations: opts.skipConversations,
    outputRoot,
    contactsTotal: contacts.length,
    contactsExported: rows.length,
    ticketsTotal: totalTickets,
    atlasMatched,
    atlasClientsIndexed: atlasClients.length,
    errors,
  };

  const summaryPath = path.join(outputRoot, "_summary.json");
  if (!opts.dryRun) {
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log("");
  console.log("Done.");
  console.log(`  Contacts: ${rows.length}`);
  console.log(`  Tickets:  ${totalTickets}`);
  console.log(`  Atlas matched: ${atlasMatched}/${rows.length}`);
  console.log(`  Errors: ${errors.length}`);
  if (!opts.dryRun) {
    console.log(`  CSV: ${csvPath}`);
    console.log(`  Summary: ${summaryPath}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
