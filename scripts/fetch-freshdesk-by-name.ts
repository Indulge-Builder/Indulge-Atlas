/**
 * Upgrade ONLY freshdesk.txt by client name, in place in member-data.
 *
 * - Writes only {member-data-folder}/freshdesk.txt via the live FD API.
 * - Never downloads attachments; never touches profile.txt / chetto.txt.
 * - Never writes outside the --output (member-data) folder.
 *
 * Usage:
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --name="Afsar"
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --name="Advita Bihani" --name="Afsar"
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --names-file=names.txt
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --name="Afsar" --dry-run
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --name="Afsar" --resume
 *   npx tsx scripts/fetch-freshdesk-by-name.ts --name="Afsar" --force
 */

import * as fs from "fs";
import * as path from "path";
import {
  getContactById,
  listTicketsForRequester,
  searchContactsByName,
} from "../lib/freshdesk/client";
import type {
  FreshdeskContact,
  FreshdeskTicket,
} from "../lib/freshdesk/types";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const DEFAULT_CSV = "exports/freshdesk-data-2026-07-03/_contacts.csv";
const CLIENT_DELAY_MS = 1500;
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const MAX_RETRIES = 4;

type CliOptions = {
  names: string[];
  allZero: boolean;
  byName: boolean;
  limit: number | null;
  dryRun: boolean;
  resume: boolean;
  force: boolean;
  folder: string | null;
  csvPath: string;
  output: string;
};

type ContactRow = {
  freshdesk_id: string;
  name: string;
};

type NameSummary = {
  name: string;
  status:
    | "upgraded"
    | "skipped-resume"
    | "skipped-no-improvement"
    | "unresolved"
    | "failed";
  freshdesk_id: string | null;
  folder: string | null;
  tickets: number | null;
  detail?: string;
};

type RunSummary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  output: string;
  namesProcessed: number;
  upgraded: number;
  skipped: number;
  unresolved: number;
  failed: number;
  results: NameSummary[];
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

function parseCli(): CliOptions {
  const names: string[] = [];
  for (const arg of process.argv) {
    if (arg.startsWith("--name=")) {
      const v = arg.slice("--name=".length).trim();
      if (v) names.push(v);
    }
  }

  const namesFileArg = process.argv.find((a) => a.startsWith("--names-file="));
  if (namesFileArg) {
    const file = path.resolve(
      process.cwd(),
      namesFileArg.slice("--names-file=".length),
    );
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const v = line.trim();
        if (v && !v.startsWith("#")) names.push(v);
      }
    }
  }

  const csvArg = process.argv.find((a) => a.startsWith("--csv="));
  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const folderArg = process.argv.find((a) => a.startsWith("--folder="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limitRaw = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  return {
    names: [...new Set(names)],
    allZero: process.argv.includes("--all-zero"),
    byName: process.argv.includes("--by-name"),
    limit: limitRaw != null && Number.isFinite(limitRaw) ? limitRaw : null,
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    force: process.argv.includes("--force"),
    folder: folderArg ? folderArg.slice("--folder=".length).trim() || null : null,
    csvPath: path.resolve(
      process.cwd(),
      csvArg?.slice("--csv=".length) ?? DEFAULT_CSV,
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

/** Map existing member-data folders by trailing Freshdesk id. */
function buildMemberOutIndexByFdId(output: string): Map<string, string> {
  const byFdId = new Map<string, string>();
  if (!fs.existsSync(output)) return byFdId;
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fdId = extractFdId(entry.name);
    if (fdId) byFdId.set(fdId, path.join(output, entry.name));
  }
  return byFdId;
}

type ZeroTarget = {
  fdId: string;
  folder: string;
  outDir: string;
};

/** Scan output folders whose freshdesk.txt shows Tickets: 0 and have an FD id. */
function findZeroTicketTargets(output: string): ZeroTarget[] {
  const targets: ZeroTarget[] = [];
  if (!fs.existsSync(output)) return targets;
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fdId = extractFdId(entry.name);
    if (!fdId) continue; // Atlas-only folders have no resolvable FD contact here
    const outDir = path.join(output, entry.name);
    const fdPath = path.join(outDir, "freshdesk.txt");
    const existing = fs.existsSync(fdPath)
      ? parseTicketsFromFreshdeskText(fs.readFileSync(fdPath, "utf8"))
      : -1;
    if (existing <= 0) {
      targets.push({ fdId, folder: entry.name, outDir });
    }
  }
  targets.sort((a, b) => a.folder.localeCompare(b.folder));
  return targets;
}

function slugFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "contact"
  );
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
        log(
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

/** Read the display Name from an existing folder's freshdesk.txt / contact.txt. */
function readFolderDisplayName(outDir: string, fallback: string): string {
  for (const file of ["freshdesk.txt", "contact.txt"]) {
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

/**
 * Resolve the BEST Freshdesk contact for a name: gather candidate contacts
 * (CSV name matches + live name search + the folder's own FD id), fetch
 * tickets for each, and return the candidate with the most tickets.
 */
async function resolveBestContactByName(
  name: string,
  csvRows: ContactRow[],
  ownFdId: string | null,
): Promise<{ contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null> {
  const target = name.trim().toLowerCase();
  const candidateIds = new Set<string>();

  if (ownFdId) candidateIds.add(ownFdId);

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
    log(`  name search failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let best: { contact: FreshdeskContact; tickets: FreshdeskTicket[] } | null =
    null;

  for (const id of [...candidateIds].slice(0, 6)) {
    let contact: FreshdeskContact | null = null;
    try {
      contact = await withRateLimitRetry(`contact ${id}`, () =>
        getContactById(Number(id)),
      );
    } catch (e) {
      log(`  contact ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!contact) continue;

    let tickets: FreshdeskTicket[] = [];
    try {
      tickets = await withRateLimitRetry(`tickets ${id}`, () =>
        listTicketsForRequester(contact!.id),
      );
    } catch (e) {
      log(`  tickets ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!best || tickets.length > best.tickets.length) {
      best = { contact, tickets };
    }
  }

  return best;
}

/**
 * Resolve a Freshdesk contact from a name:
 *   1. exact (case-insensitive) match in _contacts.csv → getContactById
 *   2. searchContactsByName() live API
 */
async function resolveContactByName(
  name: string,
  csvRows: ContactRow[],
): Promise<FreshdeskContact | null> {
  const target = name.trim().toLowerCase();

  const exact = csvRows.filter((r) => r.name.trim().toLowerCase() === target);
  const partial = exact.length
    ? exact
    : csvRows.filter((r) => r.name.trim().toLowerCase().includes(target));

  for (const row of partial) {
    try {
      const contact = await withRateLimitRetry(
        `contact ${row.freshdesk_id}`,
        () => getContactById(Number(row.freshdesk_id)),
      );
      if (contact) return contact;
    } catch (e) {
      log(
        `  csv contact ${row.freshdesk_id} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    const results = await withRateLimitRetry(`name search "${name}"`, () =>
      searchContactsByName(name),
    );
    if (results.length) return results[0]!;
  } catch (e) {
    log(
      `  name search failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return null;
}

/** Fetch tickets, build text, and write freshdesk.txt only. */
async function writeFreshdeskForContact(params: {
  contact: FreshdeskContact;
  displayName: string;
  outDir: string;
  opts: CliOptions;
  summary: RunSummary;
  result: NameSummary;
  preFetchedTickets?: FreshdeskTicket[];
}): Promise<void> {
  const { contact, displayName, outDir, opts, summary, result } = params;
  const fdId = String(contact.id);
  const folderName = path.basename(outDir);
  const freshdeskDest = path.join(outDir, "freshdesk.txt");
  result.freshdesk_id = fdId;
  result.folder = folderName;

  const existingTickets = fs.existsSync(freshdeskDest)
    ? parseTicketsFromFreshdeskText(fs.readFileSync(freshdeskDest, "utf8"))
    : -1;

  if (opts.resume && !opts.force && existingTickets > 0) {
    result.status = "skipped-resume";
    result.tickets = existingTickets;
    summary.skipped++;
    log(`  freshdesk.txt: skip (${existingTickets} tickets)`);
    return;
  }

  if (opts.dryRun) {
    result.status = "upgraded";
    result.detail = "would re-fetch via API";
    summary.upgraded++;
    log(`  freshdesk.txt: would re-fetch via API`);
    return;
  }

  try {
    const tickets =
      params.preFetchedTickets ??
      (await withRateLimitRetry(`tickets ${fdId}`, () =>
        listTicketsForRequester(contact.id),
      ));
    const text = await buildFreshdeskExportText({
      clientName: contact.name || displayName,
      contact,
      tickets,
    });
    const newTickets = parseTicketsFromFreshdeskText(text);

    if (opts.force || newTickets > existingTickets) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(freshdeskDest, text, "utf8");
      result.status = "upgraded";
      result.tickets = newTickets;
      summary.upgraded++;
      log(
        `  freshdesk.txt: upgraded (${existingTickets < 0 ? "none" : existingTickets} → ${newTickets} tickets)`,
      );
    } else {
      result.status = "skipped-no-improvement";
      result.tickets = existingTickets;
      summary.skipped++;
      log(`  freshdesk.txt: skip (no improvement, ${newTickets} tickets)`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.status = "failed";
    result.detail = msg;
    summary.failed++;
    log(`  freshdesk.txt: failed — ${msg}`);
  }
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();

  if (!opts.names.length && !opts.allZero) {
    console.log(
      'No names provided. Use --name="Full Name" (repeatable), --names-file=names.txt, or --all-zero.',
    );
    return;
  }

  if (!opts.dryRun) {
    fs.mkdirSync(opts.output, { recursive: true });
    logStream = fs.createWriteStream(
      path.join(opts.output, "_freshdesk-by-name-run.log"),
      { flags: "a" },
    );
  }

  const csvRows = readContactsCsv(opts.csvPath);
  const memberByFdId = buildMemberOutIndexByFdId(opts.output);

  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    dryRun: opts.dryRun,
    output: opts.output,
    namesProcessed: 0,
    upgraded: 0,
    skipped: 0,
    unresolved: 0,
    failed: 0,
    results: [],
  };

  if (opts.allZero) {
    let targets = findZeroTicketTargets(opts.output);
    if (opts.limit != null && opts.limit > 0) {
      targets = targets.slice(0, opts.limit);
    }
    log(
      opts.dryRun
        ? `Dry run — all-zero: ${targets.length} folder(s) with Tickets: 0 → ${opts.output}`
        : `All-zero: refetching freshdesk.txt for ${targets.length} folder(s) → ${opts.output}`,
    );

    if (opts.byName) log("  (resolving by name — best contact by ticket count)");

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      const displayName = readFolderDisplayName(t.outDir, t.folder);
      log(
        `[${i + 1}/${targets.length}] ${t.folder} (FD ${t.fdId})` +
          (opts.byName ? ` — name: "${displayName}"` : ""),
      );

      const result: NameSummary = {
        name: displayName,
        status: "unresolved",
        freshdesk_id: t.fdId,
        folder: t.folder,
        tickets: null,
      };

      let contact: FreshdeskContact | null = null;
      let preFetchedTickets: FreshdeskTicket[] | undefined;

      if (opts.byName) {
        const best = await resolveBestContactByName(
          displayName,
          csvRows,
          t.fdId,
        );
        if (best) {
          contact = best.contact;
          preFetchedTickets = best.tickets;
          if (String(best.contact.id) !== t.fdId) {
            log(
              `  best match: contact #${best.contact.id} (${best.tickets.length} tickets)`,
            );
          }
        }
      } else {
        try {
          contact = await withRateLimitRetry(`contact ${t.fdId}`, () =>
            getContactById(Number(t.fdId)),
          );
        } catch (e) {
          result.status = "failed";
          result.detail = e instanceof Error ? e.message : String(e);
          summary.failed++;
          summary.results.push(result);
          log(`  contact lookup failed — ${result.detail}`);
          summary.namesProcessed++;
          continue;
        }
      }

      if (!contact) {
        result.status = "unresolved";
        result.detail = "contact not found";
        summary.unresolved++;
        summary.results.push(result);
        log(`  unresolved — no Freshdesk contact found`);
        summary.namesProcessed++;
        continue;
      }

      await writeFreshdeskForContact({
        contact,
        displayName,
        outDir: t.outDir,
        opts,
        summary,
        result,
        preFetchedTickets,
      });
      summary.results.push(result);
      summary.namesProcessed++;
      if (!opts.dryRun) await sleep(CLIENT_DELAY_MS);
    }
  } else {
    log(
      opts.dryRun
        ? `Dry run — freshdesk.txt only for ${opts.names.length} name(s) → ${opts.output}`
        : `Fetching freshdesk.txt only for ${opts.names.length} name(s) → ${opts.output}`,
    );

    for (let i = 0; i < opts.names.length; i++) {
      const name = opts.names[i]!;
      log(`[${i + 1}/${opts.names.length}] ${name}`);

      const result: NameSummary = {
        name,
        status: "unresolved",
        freshdesk_id: null,
        folder: null,
        tickets: null,
      };

      const contact = await resolveContactByName(name, csvRows);
      if (!contact) {
        result.status = "unresolved";
        result.detail = "no Freshdesk contact found";
        summary.unresolved++;
        summary.results.push(result);
        log(`  unresolved — no Freshdesk contact found`);
        summary.namesProcessed++;
        continue;
      }

      const fdId = String(contact.id);
      const outDir = opts.folder
        ? path.isAbsolute(opts.folder)
          ? opts.folder
          : path.join(opts.output, opts.folder)
        : memberByFdId.get(fdId) ??
          path.join(opts.output, `${slugFromName(contact.name || name)}_${fdId}`);

      log(`  contact #${fdId} → ${path.basename(outDir)}`);

      await writeFreshdeskForContact({
        contact,
        displayName: name,
        outDir,
        opts,
        summary,
        result,
      });
      summary.results.push(result);
      summary.namesProcessed++;
      if (!opts.dryRun) await sleep(CLIENT_DELAY_MS);
    }
  }

  summary.finishedAt = new Date().toISOString();

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_freshdesk-by-name-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
  }

  log("");
  log("Done.");
  log(`  Processed:  ${summary.namesProcessed}`);
  log(`  Upgraded:   ${summary.upgraded}`);
  log(`  Skipped:    ${summary.skipped}`);
  log(`  Unresolved: ${summary.unresolved}`);
  log(`  Failed:     ${summary.failed}`);
  if (!opts.dryRun) {
    log(
      `  Summary: ${path.join(opts.output, "_freshdesk-by-name-summary.json")}`,
    );
  }

  logStream?.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
