/**
 * Consolidate Freshdesk export (499 contacts) + Atlas client export (profile, Chetto).
 *
 * Usage:
 *   npx tsx scripts/consolidate-unified-export.ts --dry-run
 *   npx tsx scripts/consolidate-unified-export.ts
 *   npx tsx scripts/consolidate-unified-export.ts --force
 *   npx tsx scripts/consolidate-unified-export.ts --client-id=<atlas-uuid>
 *   npx tsx scripts/consolidate-unified-export.ts --include-atlas-only
 */

import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";

type CliOptions = {
  dryRun: boolean;
  force: boolean;
  clientId: string | null;
  includeAtlasOnly: boolean;
  fdRoot: string;
  clientRoot: string;
  output: string;
};

type ContactRow = {
  freshdesk_id: string;
  name: string;
  phone: string;
  mobile: string;
  email: string;
  active: string;
  ticket_count: number;
  atlas_client_id: string;
  atlas_client_name: string;
};

type FreshdeskPick = "fd" | "morning" | "fd_only";

type Summary = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  outputRoot: string;
  freshdeskContactsTotal: number;
  withAtlasProfileChetto: number;
  freshdeskOnly: number;
  atlasOnlyNoFreshdesk: number;
  freshdeskSourceFd: number;
  freshdeskSourceMorning: number;
  duplicateAtlasIds: Array<{ atlas_client_id: string; freshdesk_ids: string[] }>;
  errors: Array<{ freshdesk_id: string; error: string }>;
};

function parseCli(): CliOptions {
  const clientIdArg = process.argv.find((a) => a.startsWith("--client-id="));
  const fdRootArg = process.argv.find((a) => a.startsWith("--fd-root="));
  const clientRootArg = process.argv.find((a) =>
    a.startsWith("--client-root="),
  );
  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const date = format(new Date(), "yyyy-MM-dd");

  return {
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force"),
    clientId: clientIdArg ? clientIdArg.slice("--client-id=".length) : null,
    includeAtlasOnly: process.argv.includes("--include-atlas-only"),
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
    output: path.resolve(
      process.cwd(),
      outputArg?.slice("--output=".length) ??
        `exports/unified-client-data-${date}`,
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
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const rows: ContactRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    if (cols.length < 9) continue;
    rows.push({
      freshdesk_id: cols[0]!.trim(),
      name: cols[1] ?? "",
      phone: cols[2] ?? "",
      mobile: cols[3] ?? "",
      email: cols[4] ?? "",
      active: cols[5] ?? "",
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
  const history = text.match(
    /SERVICE HISTORY — (\d+) ticket/,
  );
  if (history) return Number(history[1]);
  return 0;
}

function isMorningSkip(text: string | null): boolean {
  if (!text) return true;
  return text.includes("No Freshdesk contact found");
}

function pickFreshdeskSource(params: {
  fdText: string | null;
  morningText: string | null;
  csvTicketCount: number;
  force: boolean;
}): { source: FreshdeskPick; reason: string } {
  const { fdText, morningText, csvTicketCount, force } = params;

  if (force && fdText) {
    return { source: "fd", reason: "--force" };
  }

  const fdTickets = parseTicketsFromFreshdeskText(fdText);
  const morningTickets = parseTicketsFromFreshdeskText(morningText);
  const morningSkip = isMorningSkip(morningText);

  if (!morningText || morningSkip) {
    if (fdText) return { source: "fd", reason: "morning missing or skip" };
    return { source: "fd_only", reason: "no freshdesk files" };
  }

  if (!fdText) {
    return { source: "morning", reason: "fd freshdesk.txt missing" };
  }

  const fdScore = Math.max(fdTickets, csvTicketCount);
  const morningScore = morningTickets;

  if (fdScore === 0 && morningScore > 0) {
    return { source: "morning", reason: "fd empty (likely 429), morning has tickets" };
  }

  if (morningScore > fdScore) {
    return { source: "morning", reason: `morning tickets ${morningScore} > fd ${fdScore}` };
  }

  if (fdScore > morningScore) {
    return { source: "fd", reason: `fd tickets ${fdScore} > morning ${morningScore}` };
  }

  if ((fdText?.length ?? 0) >= (morningText?.length ?? 0)) {
    return { source: "fd", reason: "tie — prefer fd (full export)" };
  }

  return { source: "morning", reason: "tie — prefer morning (larger file)" };
}

function copyFile(
  src: string,
  dest: string,
  dryRun: boolean,
): void {
  if (!fs.existsSync(src)) return;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function processContactRow(
  row: ContactRow,
  fdFolder: string | null,
  clientFolder: string | null,
  outDir: string,
  opts: CliOptions,
  stats: {
    withAtlas: number;
    fdOnly: number;
    sourceFd: number;
    sourceMorning: number;
  },
): void {
  const unifiedName =
    (fdFolder ? path.basename(fdFolder) : null) ??
    safeFolderName(row.name, row.freshdesk_id);
  const targetDir = path.join(outDir, unifiedName);

  if (!opts.dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const fdContact = fdFolder
    ? path.join(fdFolder, "contact.txt")
    : null;
  const fdFreshdesk = fdFolder
    ? path.join(fdFolder, "freshdesk.txt")
    : null;
  const morningFreshdesk = clientFolder
    ? path.join(clientFolder, "freshdesk.txt")
    : null;

  const fdText = fdFreshdesk ? readIfExists(fdFreshdesk) : null;
  const morningText = morningFreshdesk ? readIfExists(morningFreshdesk) : null;

  const pick = pickFreshdeskSource({
    fdText,
    morningText,
    csvTicketCount: row.ticket_count,
    force: opts.force,
  });

  if (fdContact) {
    copyFile(fdContact, path.join(targetDir, "contact.txt"), opts.dryRun);
  }

  if (pick.source === "morning" && morningFreshdesk) {
    copyFile(morningFreshdesk, path.join(targetDir, "freshdesk.txt"), opts.dryRun);
    stats.sourceMorning++;
  } else if (fdFreshdesk && fs.existsSync(fdFreshdesk)) {
    copyFile(fdFreshdesk, path.join(targetDir, "freshdesk.txt"), opts.dryRun);
    stats.sourceFd++;
  } else if (morningFreshdesk && fs.existsSync(morningFreshdesk)) {
    copyFile(morningFreshdesk, path.join(targetDir, "freshdesk.txt"), opts.dryRun);
    stats.sourceMorning++;
  }

  let hasAtlas = false;
  if (clientFolder && row.atlas_client_id) {
    const profile = path.join(clientFolder, "profile.txt");
    const chetto = path.join(clientFolder, "chetto.txt");
    if (fs.existsSync(profile)) {
      copyFile(profile, path.join(targetDir, "profile.txt"), opts.dryRun);
      hasAtlas = true;
    }
    if (fs.existsSync(chetto)) {
      copyFile(chetto, path.join(targetDir, "chetto.txt"), opts.dryRun);
      hasAtlas = true;
    }
  }

  if (hasAtlas) stats.withAtlas++;
  else stats.fdOnly++;

  const manifest = [
    `Unified export manifest`,
    `Freshdesk ID: ${row.freshdesk_id}`,
    `Name: ${row.name}`,
    `Atlas client ID: ${row.atlas_client_id || "—"}`,
    `Atlas client name: ${row.atlas_client_name || "—"}`,
    `CSV ticket_count: ${row.ticket_count}`,
    `FD folder: ${fdFolder ?? "—"}`,
    `Atlas folder: ${clientFolder ?? "—"}`,
    `freshdesk.txt source: ${pick.source} (${pick.reason})`,
    `FD tickets parsed: ${parseTicketsFromFreshdeskText(fdText)}`,
    `Morning tickets parsed: ${parseTicketsFromFreshdeskText(morningText)}`,
    "",
  ].join("\n");

  if (!opts.dryRun) {
    fs.writeFileSync(path.join(targetDir, "_manifest.txt"), manifest, "utf8");
  }
}

function writeAtlasOnlyCsv(
  clientRoot: string,
  matchedAtlasPrefixes: Set<string>,
  outPath: string,
  dryRun: boolean,
): string[] {
  const unmatched: string[] = [];
  for (const entry of fs.readdirSync(clientRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/_([a-f0-9]{8})$/i);
    if (!match) continue;
    const prefix = match[1]!.toLowerCase();
    if (!matchedAtlasPrefixes.has(prefix)) {
      unmatched.push(entry.name);
    }
  }

  if (!dryRun) {
    const header = "client_folder\n";
    const body = unmatched.map((f) => f).join("\n");
    fs.writeFileSync(outPath, `${header}${body}\n`, "utf8");
  }

  return unmatched;
}

function copyAtlasOnlyFolders(
  clientRoot: string,
  atlasOnlyFolders: string[],
  outDir: string,
  dryRun: boolean,
): void {
  const atlasOnlyRoot = path.join(outDir, "atlas_only");
  for (const folder of atlasOnlyFolders) {
    const src = path.join(clientRoot, folder);
    const dest = path.join(atlasOnlyRoot, folder);
    if (!dryRun) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const file of ["profile.txt", "chetto.txt", "freshdesk.txt", "_export-status.txt"]) {
      const srcFile = path.join(src, file);
      if (fs.existsSync(srcFile)) {
        copyFile(srcFile, path.join(dest, file), dryRun);
      }
    }
  }
}

async function main(): Promise<void> {
  const opts = parseCli();
  const startedAt = new Date();

  const csvPath = path.join(opts.fdRoot, "_contacts.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing ${csvPath}`);
  }
  if (!fs.existsSync(opts.clientRoot)) {
    throw new Error(`Missing client root ${opts.clientRoot}`);
  }

  let rows = readContactsCsv(csvPath);
  if (opts.clientId) {
    const prefix = opts.clientId.slice(0, 8).toLowerCase();
    rows = rows.filter(
      (r) =>
        r.atlas_client_id.toLowerCase().startsWith(prefix) ||
        r.atlas_client_id.toLowerCase() === opts.clientId!.toLowerCase(),
    );
    if (!rows.length) {
      console.log(`No Freshdesk rows for client ${opts.clientId}`);
      return;
    }
  }

  const fdIndex = buildFdFolderIndex(opts.fdRoot);
  const clientIndex = buildClientFolderIndex(opts.clientRoot);

  if (!opts.dryRun) {
    fs.mkdirSync(opts.output, { recursive: true });
    fs.copyFileSync(csvPath, path.join(opts.output, "_contacts.csv"));
  }

  const stats = {
    withAtlas: 0,
    fdOnly: 0,
    sourceFd: 0,
    sourceMorning: 0,
  };
  const errors: Summary["errors"] = [];
  const atlasIdToFd = new Map<string, string[]>();
  const matchedAtlasPrefixes = new Set<string>();

  console.log(
    opts.dryRun
      ? `Dry run — consolidating ${rows.length} FD contact(s) → ${opts.output}`
      : `Consolidating ${rows.length} FD contact(s) → ${opts.output}`,
  );

  for (const row of rows) {
    const fdFolder = fdIndex.get(row.freshdesk_id) ?? null;
    const atlasPrefix = row.atlas_client_id
      ? row.atlas_client_id.slice(0, 8).toLowerCase()
      : "";
    const clientFolder = atlasPrefix
      ? (clientIndex.get(atlasPrefix) ?? null)
      : null;

    if (!fdFolder) {
      errors.push({
        freshdesk_id: row.freshdesk_id,
        error: "FD folder not found",
      });
    }

    if (row.atlas_client_id) {
      const list = atlasIdToFd.get(row.atlas_client_id) ?? [];
      list.push(row.freshdesk_id);
      atlasIdToFd.set(row.atlas_client_id, list);
      matchedAtlasPrefixes.add(atlasPrefix);
    }

    try {
      processContactRow(row, fdFolder, clientFolder, opts.output, opts, stats);
    } catch (e) {
      errors.push({
        freshdesk_id: row.freshdesk_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const duplicateAtlasIds = [...atlasIdToFd.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([atlas_client_id, freshdesk_ids]) => ({
      atlas_client_id,
      freshdesk_ids,
    }));

  const atlasOnlyFolders = writeAtlasOnlyCsv(
    opts.clientRoot,
    matchedAtlasPrefixes,
    path.join(opts.output, "clients_without_freshdesk.csv"),
    opts.dryRun,
  );

  if (opts.includeAtlasOnly) {
    copyAtlasOnlyFolders(
      opts.clientRoot,
      atlasOnlyFolders,
      opts.output,
      opts.dryRun,
    );
  }

  const finishedAt = new Date();
  const summary: Summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    dryRun: opts.dryRun,
    outputRoot: opts.output,
    freshdeskContactsTotal: rows.length,
    withAtlasProfileChetto: stats.withAtlas,
    freshdeskOnly: stats.fdOnly,
    atlasOnlyNoFreshdesk: atlasOnlyFolders.length,
    freshdeskSourceFd: stats.sourceFd,
    freshdeskSourceMorning: stats.sourceMorning,
    duplicateAtlasIds,
    errors,
  };

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(opts.output, "_unified-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );
  }

  console.log("");
  console.log("Done.");
  console.log(`  FD contacts:     ${rows.length}`);
  console.log(`  With Atlas files:  ${stats.withAtlas}`);
  console.log(`  FD-only:           ${stats.fdOnly}`);
  console.log(`  freshdesk from FD: ${stats.sourceFd}`);
  console.log(`  freshdesk morning: ${stats.sourceMorning}`);
  console.log(`  Atlas no FD match: ${atlasOnlyFolders.length}`);
  console.log(`  Errors:            ${errors.length}`);
  if (!opts.dryRun) {
    console.log(`  Output: ${opts.output}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
