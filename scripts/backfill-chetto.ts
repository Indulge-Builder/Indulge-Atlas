/**
 * Backfill chetto.txt IN PLACE for member-data folders that have Freshdesk
 * (Tickets > 1) but no Chetto timeline yet.
 *
 * Resolution (strict — no surname-only fuzzy):
 *   1. Atlas clients.chetto_group_id via phone
 *   2. Atlas clients.chetto_group_id via exact name key
 *   3. Live Chetto access_members via phone
 *   4. Chetto group name exact key / full-name containment (score >= 95)
 *
 * Usage:
 *   npx tsx scripts/backfill-chetto.ts --dry-run
 *   npx tsx scripts/backfill-chetto.ts --resume
 *   npx tsx scripts/backfill-chetto.ts --resume --limit=10
 *   npx tsx scripts/backfill-chetto.ts --folders-file=exports/member-data-2026-07-03/_list-fd-gt1-no-chetto.json
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
  chettoPhoneLookupVariants,
  clientNameMatchKey,
  getGroupTimeline,
  groupNameMatchKey,
  type ChettoGroup,
} from "../lib/actions/chetto";
import { formatChettoMessagesText } from "./lib/export-formatters";

const DEFAULT_OUTPUT = "exports/member-data-2026-07-03";
const DEFAULT_LIVE_GROUPS =
  "C:/Users/manum/.cursor/projects/c-Users-manum-OneDrive-Desktop-atlas/agent-tools/74131ed4-4818-4279-8468-39fc940f1f3c.txt";
const CLIENT_DELAY_MS = 1200;
const PAGE_DELAY_MS = 200;

type CliOptions = {
  output: string;
  dryRun: boolean;
  resume: boolean;
  force: boolean;
  writeStubs: boolean;
  /** Target every folder missing real chetto.txt (ignore FD ticket filter). */
  allMissing: boolean;
  limit: number | null;
  only: string | null;
  foldersFile: string | null;
  liveGroupsFile: string | null;
};

type FolderTarget = {
  folder: string;
  name: string;
  phone: string;
  mobile: string;
  tickets: number;
};

type Match = {
  groupId: string;
  method: string;
  groupName: string | null;
  queendom: string | null;
};

type FolderResult = {
  folder: string;
  name: string;
  status:
    | "written"
    | "stub"
    | "skipped-resume"
    | "skipped-no-match"
    | "failed"
    | "dry-run";
  method?: string;
  groupId?: string;
  groupName?: string | null;
  messages?: number;
  detail?: string;
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
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function parseCli(): CliOptions {
  return {
    output: argValue("--output=") ?? DEFAULT_OUTPUT,
    dryRun: process.argv.includes("--dry-run"),
    resume: process.argv.includes("--resume"),
    force: process.argv.includes("--force"),
    writeStubs: process.argv.includes("--write-stubs"),
    allMissing: process.argv.includes("--all-missing"),
    limit: argValue("--limit=")
      ? Number(argValue("--limit="))
      : null,
    only: argValue("--only="),
    foldersFile: argValue("--folders-file="),
    liveGroupsFile: argValue("--live-groups=") ?? DEFAULT_LIVE_GROUPS,
  };
}

function digits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function pickPhone(...vals: string[]): string {
  for (const v of vals) {
    const t = (v || "").trim();
    if (!t || t === "—" || t === "-") continue;
    if (digits(t).length >= 8) return t;
  }
  return "";
}

function splitName(full: string): { first: string; last: string | null } {
  const cleaned = full.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || cleaned, last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** True only for real WhatsApp timeline exports (not stubs / empty). */
function hasChettoData(dir: string): boolean {
  const p = path.join(dir, "chetto.txt");
  if (!fs.existsSync(p)) return false;
  const text = fs.readFileSync(p, "utf8");
  if (
    text.startsWith("No Chetto") ||
    text.startsWith("Chetto timeline not available") ||
    text.startsWith("No Chetto group linked")
  ) {
    return false;
  }
  const lines = text.split(/\r?\n/).length;
  return lines > 5 && (text.includes("Group ID:") || text.includes("Messages:"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadTargets(opts: CliOptions): FolderTarget[] {
  const outAbs = path.resolve(opts.output);

  if (opts.foldersFile) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(opts.foldersFile), "utf8"));
    if (Array.isArray(raw) && raw[0]?.folder) {
      return (raw as FolderTarget[]).map((row) => {
        const dir = path.join(outAbs, row.folder);
        if (row.name && row.name !== row.folder && (row.phone || row.mobile)) {
          return row;
        }
        const fdPath = path.join(dir, "freshdesk.txt");
        const profilePath = path.join(dir, "profile.txt");
        let name = row.name || row.folder;
        let phone = row.phone || "";
        let mobile = row.mobile || "";
        let tickets = row.tickets || 0;
        if (fs.existsSync(fdPath)) {
          const text = fs.readFileSync(fdPath, "utf8");
          name =
            (text.match(/^Name:\s*(.+)$/m) || [])[1]?.trim() ||
            (text.match(/^Freshdesk Export — (.+)$/m) || [])[1]?.trim() ||
            name;
          phone = phone || (text.match(/^Phone:\s*(.+)$/m) || [])[1]?.trim() || "";
          mobile =
            mobile || (text.match(/^Mobile:\s*(.+)$/m) || [])[1]?.trim() || "";
          const m = text.match(/^Tickets:\s*(\d+)/m);
          if (m) tickets = Number(m[1]);
        } else if (fs.existsSync(profilePath)) {
          const text = fs.readFileSync(profilePath, "utf8");
          const fn = (text.match(/^First name:\s*(.+)$/m) || [])[1]?.trim();
          const ln = (text.match(/^Last name:\s*(.+)$/m) || [])[1]?.trim();
          if (fn) name = [fn, ln].filter(Boolean).join(" ");
        }
        return { folder: row.folder, name, phone, mobile, tickets };
      });
    }
    if (Array.isArray(raw) && typeof raw[0] === "string") {
      return (raw as string[]).map((folder) => {
        const fdPath = path.join(outAbs, folder, "freshdesk.txt");
        let name = folder;
        let phone = "";
        let mobile = "";
        let tickets = 0;
        if (fs.existsSync(fdPath)) {
          const text = fs.readFileSync(fdPath, "utf8");
          name = (text.match(/^Name:\s*(.+)$/m) || [])[1]?.trim() || folder;
          phone = (text.match(/^Phone:\s*(.+)$/m) || [])[1]?.trim() || "";
          mobile = (text.match(/^Mobile:\s*(.+)$/m) || [])[1]?.trim() || "";
          const m = text.match(/^Tickets:\s*(\d+)/m);
          tickets = m
            ? Number(m[1])
            : (text.match(/^TICKET #/gm) || []).length;
        }
        return { folder, name, phone, mobile, tickets };
      });
    }
  }

  // Auto-detect folders missing real chetto data
  const dirs = fs
    .readdirSync(outAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"));
  const targets: FolderTarget[] = [];
  for (const d of dirs) {
    const dir = path.join(outAbs, d.name);
    if (hasChettoData(dir) && !opts.force) continue;

    const fdPath = path.join(dir, "freshdesk.txt");
    const profilePath = path.join(dir, "profile.txt");
    let name = d.name;
    let phone = "";
    let mobile = "";
    let tickets = 0;

    if (fs.existsSync(fdPath)) {
      const text = fs.readFileSync(fdPath, "utf8");
      const m = text.match(/^Tickets:\s*(\d+)/m);
      tickets = m
        ? Number(m[1])
        : (text.match(/^TICKET #/gm) || []).length;
      name =
        (text.match(/^Name:\s*(.+)$/m) || [])[1]?.trim() ||
        (text.match(/^Freshdesk Export — (.+)$/m) || [])[1]?.trim() ||
        name;
      phone = (text.match(/^Phone:\s*(.+)$/m) || [])[1]?.trim() || "";
      mobile = (text.match(/^Mobile:\s*(.+)$/m) || [])[1]?.trim() || "";
    } else if (fs.existsSync(profilePath)) {
      const text = fs.readFileSync(profilePath, "utf8");
      const fn = (text.match(/^First name:\s*(.+)$/m) || [])[1]?.trim();
      const ln = (text.match(/^Last name:\s*(.+)$/m) || [])[1]?.trim();
      if (fn) name = [fn, ln].filter(Boolean).join(" ");
      else
        name =
          (text.match(/^Atlas Profile Export — (.+)$/m) || [])[1]?.trim() ||
          name;
      phone = (text.match(/^Phone:\s*(.+)$/m) || [])[1]?.trim() || "";
    } else if (!opts.allMissing) {
      continue;
    }

    if (!opts.allMissing && tickets <= 1 && !fs.existsSync(profilePath)) {
      continue;
    }

    targets.push({ folder: d.name, name, phone, mobile, tickets });
  }
  return targets;
}

function normalizeMembers(
  members: Array<string | { phone_number?: string; phone?: string }> | undefined,
): string[] {
  if (!members?.length) return [];
  return members
    .map((m) => {
      if (typeof m === "string") return m;
      return m.phone_number || m.phone || "";
    })
    .filter((p) => digits(p).length >= 8);
}

function loadLiveGroups(file: string | null): ChettoGroup[] {
  const candidates = [
    file,
    "scripts/chetto-live-groups.json",
    DEFAULT_LIVE_GROUPS,
  ].filter(Boolean) as string[];

  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.groups;
    if (!Array.isArray(arr)) continue;
    return arr.map(
      (g: {
        group_id: string;
        group_name: string | null;
        access_members?: Array<string | { phone_number?: string; phone?: string }>;
      }) =>
        ({
          group_id: g.group_id,
          group_name: g.group_name,
          access_members: normalizeMembers(g.access_members),
          org_id: null,
          platform: null,
          created_at: null,
          updated_at: null,
        }) as ChettoGroup,
    );
  }

  // Fallback: names-only list
  const namesPath = "scripts/chetto-all-group-ids-with-names.json";
  if (fs.existsSync(namesPath)) {
    const src = JSON.parse(fs.readFileSync(namesPath, "utf8"));
    return (src.groups ?? []).map(
      (g: { group_id: string; group_name: string | null }) =>
        ({
          group_id: g.group_id,
          group_name: g.group_name,
          access_members: [],
          org_id: null,
          platform: null,
          created_at: null,
          updated_at: null,
        }) as ChettoGroup,
    );
  }
  return [];
}

type AtlasEntry = {
  id: string;
  name: string;
  groupId: string;
  queendom: string | null;
};

async function loadAtlasIndex(): Promise<{
  byPhone: Map<string, AtlasEntry>;
  byName: Map<string, AtlasEntry>;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const byPhone = new Map<string, AtlasEntry>();
  const byName = new Map<string, AtlasEntry>();
  if (!url || !key) {
    console.warn("Supabase env missing — Atlas resolution skipped");
    return { byPhone, byName };
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, chetto_group_id, queendom")
    .not("chetto_group_id", "is", null);
  if (error) throw new Error(error.message);

  for (const c of data ?? []) {
    const groupId = (c.chetto_group_id as string)?.trim();
    if (!groupId) continue;
    const entry: AtlasEntry = {
      id: c.id as string,
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      groupId,
      queendom: (c.queendom as string | null) ?? null,
    };
    for (const v of chettoPhoneLookupVariants((c.phone_number as string) || "")) {
      if (!byPhone.has(v)) byPhone.set(v, entry);
    }
    const nk = clientNameMatchKey(
      (c.first_name as string) || "",
      (c.last_name as string | null) ?? null,
    );
    if (nk && !byName.has(nk)) byName.set(nk, entry);
  }
  return { byPhone, byName };
}

function buildPhoneToGroups(groups: ChettoGroup[]): Map<string, ChettoGroup[]> {
  const map = new Map<string, ChettoGroup[]>();
  for (const g of groups) {
    for (const m of g.access_members) {
      for (const v of chettoPhoneLookupVariants(m)) {
        const arr = map.get(v);
        if (arr) {
          if (!arr.includes(g)) arr.push(g);
        } else {
          map.set(v, [g]);
        }
      }
    }
  }
  return map;
}

function groupsForPhone(
  phone: string,
  phoneIndex: Map<string, ChettoGroup[]>,
): ChettoGroup[] {
  const seen = new Set<string>();
  const hits: ChettoGroup[] = [];
  for (const v of chettoPhoneLookupVariants(phone)) {
    for (const g of phoneIndex.get(v) ?? []) {
      if (seen.has(g.group_id)) continue;
      seen.add(g.group_id);
      hits.push(g);
    }
  }
  return hits;
}

function pickGroupForPhone(
  phone: string,
  nameKey: string,
  firstNameKey: string,
  phoneIndex: Map<string, ChettoGroup[]>,
): ChettoGroup | null {
  const hits = groupsForPhone(phone, phoneIndex);
  if (!hits.length) return null;

  const nameOk = (g: ChettoGroup): boolean => {
    const gk = groupNameMatchKey(g.group_name);
    if (!gk) return false;
    if (nameKey.length >= 6 && gk.includes(nameKey)) return true;
    if (
      firstNameKey.length >= 4 &&
      (gk === firstNameKey || gk.startsWith(firstNameKey))
    ) {
      return true;
    }
    return false;
  };

  const named = hits.filter(nameOk);
  if (named.length === 1) return named[0];
  return null;
}

/** Strict resolve: phone (disambiguated), exact name, or full-name-in-group. */
function resolveStrict(
  target: FolderTarget,
  atlas: { byPhone: Map<string, AtlasEntry>; byName: Map<string, AtlasEntry> },
  index: ReturnType<typeof buildChettoMappingIndex>,
  groups: ChettoGroup[],
  nameById: Map<string, string | null>,
  phoneIndex: Map<string, ChettoGroup[]>,
): Match | null {
  const phone = pickPhone(target.mobile, target.phone);
  const { first, last } = splitName(target.name);
  const nameKey = clientNameMatchKey(first, last);

  for (const v of chettoPhoneLookupVariants(phone)) {
    const a = atlas.byPhone.get(v);
    if (a) {
      return {
        groupId: a.groupId,
        method: "atlas_phone",
        groupName: nameById.get(a.groupId) ?? null,
        queendom: a.queendom,
      };
    }
  }

  const phoneGroup = pickGroupForPhone(
    phone,
    nameKey,
    clientNameMatchKey(first, null),
    phoneIndex,
  );
  if (phoneGroup) {
    return {
      groupId: phoneGroup.group_id,
      method: "chetto_phone",
      groupName: phoneGroup.group_name,
      queendom: null,
    };
  }

  if (nameKey) {
    const a = atlas.byName.get(nameKey);
    if (a) {
      const gName = nameById.get(a.groupId) ?? null;
      const gKey = groupNameMatchKey(gName);
      // Require group title to contain the full client name key.
      if (!gKey || gKey.includes(nameKey) || gKey === nameKey) {
        return {
          groupId: a.groupId,
          method: "atlas_name",
          groupName: gName,
          queendom: a.queendom,
        };
      }
    }
    const gid = index.byName.get(nameKey);
    if (gid) {
      return {
        groupId: gid,
        method: "chetto_name",
        groupName: nameById.get(gid) ?? null,
        queendom: null,
      };
    }
  }

  // Only: group title contains the FULL client name key (never reverse /
  // mid-string — "alpesh" must not hit "kalpeshpadshala").
  if (nameKey.length < 6) return null;
  const hits: string[] = [];
  for (const group of groups) {
    const gKey = groupNameMatchKey(group.group_name);
    if (!gKey) continue;
    const ok = last
      ? gKey.includes(nameKey)
      : gKey === nameKey || gKey.startsWith(nameKey);
    if (ok) hits.push(group.group_id);
  }
  if (hits.length !== 1) return null;
  return {
    groupId: hits[0],
    method: "chetto_fullname_full",
    groupName: nameById.get(hits[0]) ?? null,
    queendom: null,
  };
}

async function fetchChettoText(
  groupId: string,
  groupName: string | null,
  queendom: string | null,
): Promise<{ text: string; messages: number; timelineNotAvailable: boolean }> {
  const allMessages = [];
  let cursor: string | null = null;
  let timelineNotAvailable = false;

  while (true) {
    const page = await getGroupTimeline(groupId, 200, cursor ?? undefined, {
      queendom: queendom?.trim() || undefined,
    });
    if (page.timelineNotAvailable) {
      timelineNotAvailable = true;
      if (!allMessages.length) break;
    }
    allMessages.push(...page.messages);
    cursor =
      typeof page.nextCursor === "string" && page.nextCursor.length > 0
        ? page.nextCursor
        : null;
    if (!cursor) break;
    await sleep(PAGE_DELAY_MS);
  }

  if (timelineNotAvailable && allMessages.length === 0) {
    return {
      text: "Chetto timeline not available for this group.\n",
      messages: 0,
      timelineNotAvailable: true,
    };
  }

  return {
    text: formatChettoMessagesText(allMessages, {
      groupId,
      groupName: groupName ?? undefined,
    }),
    messages: allMessages.length,
    timelineNotAvailable: false,
  };
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env"));
  applyEnv(path.join(process.cwd(), ".env.local"));

  const opts = parseCli();
  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error("CHETTO_API_KEY missing in .env.local");
  }

  const outAbs = path.resolve(opts.output);
  let targets = loadTargets(opts);
  if (opts.only) {
    const needle = opts.only.toLowerCase();
    targets = targets.filter(
      (t) =>
        t.folder.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle),
    );
  }
  if (opts.limit != null && opts.limit > 0) {
    targets = targets.slice(0, opts.limit);
  }

  console.log(
    `Backfill Chetto — ${targets.length} folder(s) → ${outAbs}` +
      (opts.dryRun ? " (dry-run)" : ""),
  );

  const groups = loadLiveGroups(opts.liveGroupsFile);
  console.log(`Live/name groups loaded: ${groups.length}`);
  const index = buildChettoMappingIndex(groups);
  const phoneIndex = buildPhoneToGroups(groups);
  const nameById = new Map<string, string | null>();
  for (const g of groups) nameById.set(g.group_id, g.group_name);

  const atlas = await loadAtlasIndex();
  console.log(
    `Atlas indexed: phone=${atlas.byPhone.size} name=${atlas.byName.size}`,
  );
  console.log(`Phone index keys: ${phoneIndex.size}`);

  // Persist a cleaned live dump for future runs
  const liveDumpPath = path.join(outAbs, "_chetto-live-groups.json");
  if (groups.length && !fs.existsSync("scripts/chetto-live-groups.json")) {
    try {
      if (opts.liveGroupsFile && fs.existsSync(opts.liveGroupsFile)) {
        fs.copyFileSync(opts.liveGroupsFile, "scripts/chetto-live-groups.json");
        console.log("Cached live groups → scripts/chetto-live-groups.json");
      }
    } catch {
      /* ignore */
    }
  }

  const results: FolderResult[] = [];
  let written = 0;
  let stubs = 0;
  let skipped = 0;
  let failed = 0;
  let unmatched = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dir = path.join(outAbs, t.folder);
    const dest = path.join(dir, "chetto.txt");

    process.stdout.write(
      `[${i + 1}/${targets.length}] ${t.folder} — "${t.name}" … `,
    );

    if (!opts.force && opts.resume && hasChettoData(dir)) {
      console.log("skip (resume)");
      results.push({
        folder: t.folder,
        name: t.name,
        status: "skipped-resume",
      });
      skipped++;
      continue;
    }

    const match = resolveStrict(t, atlas, index, groups, nameById, phoneIndex);

    if (!match) {
      unmatched++;
      if (opts.writeStubs) {
        const stub =
          "No Chetto WhatsApp group found for this client.\n" +
          `Client: ${t.name}\n` +
          `Phone: ${pickPhone(t.mobile, t.phone) || "—"}\n` +
          `Generated: ${new Date().toISOString()}\n`;
        if (opts.dryRun) {
          console.log("dry-run stub (no match)");
          results.push({
            folder: t.folder,
            name: t.name,
            status: "dry-run",
            detail: "no-match-stub",
          });
        } else {
          fs.writeFileSync(dest, stub, "utf8");
          console.log("stub (no match)");
          results.push({
            folder: t.folder,
            name: t.name,
            status: "stub",
            detail: "no-match",
          });
          stubs++;
        }
      } else {
        console.log("no match");
        results.push({
          folder: t.folder,
          name: t.name,
          status: "skipped-no-match",
        });
        skipped++;
      }
      continue;
    }

    if (opts.dryRun) {
      console.log(
        `dry-run → ${match.groupName || match.groupId} [${match.method}]`,
      );
      results.push({
        folder: t.folder,
        name: t.name,
        status: "dry-run",
        method: match.method,
        groupId: match.groupId,
        groupName: match.groupName,
      });
      continue;
    }

    try {
      const { text, messages, timelineNotAvailable } = await fetchChettoText(
        match.groupId,
        match.groupName,
        match.queendom,
      );
      fs.writeFileSync(dest, text, "utf8");
      if (timelineNotAvailable || messages === 0) {
        console.log(
          `written 0 msgs (${timelineNotAvailable ? "timeline N/A" : "empty"}) [${match.method}] ${match.groupName || match.groupId}`,
        );
      } else {
        console.log(
          `written ${messages} msgs [${match.method}] ${match.groupName || match.groupId}`,
        );
      }
      results.push({
        folder: t.folder,
        name: t.name,
        status: "written",
        method: match.method,
        groupId: match.groupId,
        groupName: match.groupName,
        messages,
      });
      written++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAILED — ${msg}`);
      results.push({
        folder: t.folder,
        name: t.name,
        status: "failed",
        method: match.method,
        groupId: match.groupId,
        groupName: match.groupName,
        detail: msg,
      });
      failed++;
    }

    await sleep(CLIENT_DELAY_MS);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    output: outAbs,
    dryRun: opts.dryRun,
    writeStubs: opts.writeStubs,
    targets: targets.length,
    written,
    stubs,
    skipped,
    failed,
    unmatched,
    results,
  };

  fs.writeFileSync(
    path.join(outAbs, "_chetto-backfill-139-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  // silence unused
  void liveDumpPath;

  console.log("\n=== SUMMARY ===");
  console.log(`targets:    ${targets.length}`);
  console.log(`written:    ${written}`);
  console.log(`stubs:      ${stubs}`);
  console.log(`skipped:    ${skipped}`);
  console.log(`failed:     ${failed}`);
  console.log(`unmatched:  ${unmatched}`);
  console.log(`summary → ${path.join(outAbs, "_chetto-backfill-139-summary.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
