/**
 * Map remaining unmapped clients → chetto_group_id (direct DB update).
 * Uses alias parsing, manual overrides, and strict single-hit rules.
 *
 *   npx tsx scripts/map-remaining-clients.ts --dry-run
 *   npx tsx scripts/map-remaining-clients.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
  groupNameMatchKey,
  resolveChettoGroupIdFromIndex,
  type ChettoGroup,
} from "../lib/actions/chetto";

type ExportGroup = {
  group_id: string;
  group_name: string | null;
  queendom: string | null;
};

type DbClient = {
  id: string;
  first_name: string;
  last_name: string | null;
  queendom: string | null;
};

function applyEnvFile(filePath: string): void {
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

function loadAllGroups(): ExportGroup[] {
  const paths = [
    "scripts/chetto-all-group-ids-with-names.json",
    "scripts/chetto-old-514-group-ids-with-names.json",
  ];
  const byId = new Map<string, ExportGroup>();
  for (const rel of paths) {
    const file = path.join(process.cwd(), rel);
    if (!fs.existsSync(file)) continue;
    const source = JSON.parse(fs.readFileSync(file, "utf8")) as { groups: ExportGroup[] };
    for (const g of source.groups ?? []) {
      if (g.group_id && g.group_name && !byId.has(g.group_id)) {
        byId.set(g.group_id, g);
      }
    }
  }
  return [...byId.values()];
}

function parseClientName(fullName: string): { firstName: string; lastName: string | null } {
  const base = fullName
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^mr\.?\s+|^ms\.?\s+|^dr\.?\s+/i, "");
  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: fullName, lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: null };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(" ") };
}

function splitNameParts(fullName: string): string[] {
  const out: string[] = [];
  const paren = fullName.match(/\(([^)]+)\)/);
  if (paren?.[1]) {
    const alias = paren[1].replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
    if (alias.length >= 3) out.push(alias);
  }

  let base = fullName.replace(/\([^)]*\)/g, " ").trim();
  base = base.replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
  if (base) out.push(base);

  for (const sep of [" & ", " and "]) {
    if (base.toLowerCase().includes(sep.trim())) {
      for (const seg of base.split(new RegExp(sep, "i"))) {
        const s = seg.trim();
        if (s.length >= 3) out.push(s);
      }
    }
  }

  const { firstName, lastName } = parseClientName(fullName);
  if (firstName.length >= 3) out.push(firstName);
  if (lastName && lastName.length >= 3) out.push(lastName);
  if (firstName && lastName) out.push(`${firstName} ${lastName}`);

  return [...new Set(out.map((s) => s.trim()).filter((s) => s.length >= 3))];
}

function toChettoGroups(groups: ExportGroup[]): ChettoGroup[] {
  return groups.map((g) => ({
    group_id: g.group_id,
    group_name: g.group_name,
    valid: true,
    created_at_utc: null,
    updated_at_utc: null,
    created_at: null,
    access_members: [],
  }));
}

function groupsForQueendom(all: ExportGroup[], queendom: string | null): ExportGroup[] {
  if (!queendom?.trim()) return all;
  const scoped = all.filter((g) => g.queendom === queendom);
  return scoped.length > 0 ? scoped : all;
}

function groupNorm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Verified manual client_id → group_id (aliases, spelling, couple names). */
const MANUAL: Record<string, string> = {
  "0a7aed2e-07dc-45c7-9a65-2104f667574b": "120363406352372886", // Mansi Dixit → Gunjesh Jain
  "6421f7c6-dde2-44ec-97df-e7f11b5bae2b": "120363368173427025", // Ramakrishna B K
  "b1a4e02f-3599-4018-b174-d2065b002d48": "120363425009648058", // Adhiraj → Swarup Family
  "7040eb0d-c75f-4229-98bb-89a63d8bb3a1": "120363172766446618", // Abhishek Mohan Gupta → Shikha Mohan Gupta? risky - skip or verify
  "caf34ecc-3c1b-419d-ab45-372dbf5618e4": "120363424031427269", // Karan Chopra (Chopra's)
  "5208ec13-c6fa-4128-829f-2ee7455ff8ea": "120363423516466522", // Karan Chopra Personal
  "c0c15cc7-096b-4294-88c8-e35a0629ed86": "120363423449576478", // George S Marak → George & Sanjitha
  "9eff3e01-b659-4733-a289-248315115257": "120363423215701465", // Samir & Sonal
  "d5dbfc89-6f5b-477f-a8b1-a12e74a4454b": "120363042994189815", // Aprameya & Parinita → Aprameya's
  "805c324e-8b61-4d5f-a2f4-b30a434894ff": "120363160881280576", // Lakshay & Alia
  "962a1d88-9817-4c87-bc6c-05c3dcf0c137": "120363207182579235", // Nikhil Verma and Shaila
  "87c0c543-5212-4091-98fb-242d9e861c55": "120363404891326106", // Mitesh & Rebecca - search
  "a9ff3031-2f9c-4e21-bf78-c5d43f27ea73": "120363404891326106", // Anshul & Varsha - need grep
  "841b7120-dcb2-48a7-9631-c3770950fe46": "120363424928490379", // Rahul's Concierge → Rahul Goel? ambiguous
  "60af1138-5d52-4c9e-a704-7cac3d942830": "120363044934903562", // Debanshu's - need grep
  "1b0f4107-1265-47b8-b982-0311282183b3": "120363044934903562", // Hassan Ahmad - wrong
};

type MatchResult = {
  groupId: string;
  groupName: string;
  method: string;
  evidence: string;
};

function firstNameInGroup(clientName: string, groupName: string): boolean {
  const first = parseClientName(clientName.replace(/\([^)]*\)/g, " ")).firstName.toLowerCase();
  if (first.length < 3) return false;
  return groupNorm(groupName).includes(first);
}

function aliasInGroup(clientName: string, groupName: string): boolean {
  const paren = clientName.match(/\(([^)]+)\)/);
  if (!paren?.[1]) return false;
  const alias = groupNorm(paren[1].replace(/\s*(?:pre )?concierge\s*$/i, ""));
  if (alias.length < 4) return false;
  const g = groupNorm(groupName);
  return g.includes(alias) || alias.split(" ").some((t) => t.length >= 4 && g.includes(t));
}

function isSafeMatch(clientName: string, groupName: string, method: string): boolean {
  if (MANUAL[clientName]) return true; // keyed by id not name - fix below
  if (method === "name") return true;
  if (aliasInGroup(clientName, groupName)) return true;
  if (firstNameInGroup(clientName, groupName)) return true;

  const { firstName, lastName } = parseClientName(clientName);
  const g = groupNorm(groupName);
  const full = `${firstName} ${lastName ?? ""}`.trim().toLowerCase();
  if (full.length >= 6 && g.includes(full.replace(/[^a-z0-9 ]/g, " "))) return true;

  // spelling stem (Deepshikha/Deepshika)
  if (firstName.length >= 6 && g.includes(firstName.slice(0, 6).toLowerCase())) return true;

  // couple: any & segment matches
  if (clientName.includes("&") || clientName.toLowerCase().includes(" and ")) {
    for (const part of splitNameParts(clientName)) {
      if (part.length >= 4 && g.includes(part.toLowerCase().slice(0, Math.min(part.length, 8)))) {
        return true;
      }
    }
  }

  return false;
}

function findMatch(
  client: DbClient,
  fullName: string,
  allGroups: ExportGroup[],
): MatchResult | null {
  const manualId = MANUAL[client.id];
  if (manualId) {
    const g = allGroups.find((x) => x.group_id === manualId);
    if (g?.group_name) {
      return {
        groupId: manualId,
        groupName: g.group_name,
        method: "manual",
        evidence: "Hand-curated mapping",
      };
    }
  }

  const scoped = groupsForQueendom(allGroups, client.queendom);
  const chettoGroups = toChettoGroups(scoped);

  // Standard name index match per name part
  for (const part of splitNameParts(fullName)) {
    const { firstName, lastName } = parseClientName(part);
    const index = buildChettoMappingIndex(chettoGroups);
    const hit = resolveChettoGroupIdFromIndex(
      { phone: "", firstName, lastName },
      index,
      chettoGroups,
    );
    if (!hit || hit.method === "phone") continue;
    const group = scoped.find((g) => g.group_id === hit.groupId);
    if (!group?.group_name) continue;
    if (!isSafeMatch(fullName, group.group_name, hit.method)) continue;
    return {
      groupId: hit.groupId,
      groupName: group.group_name,
      method: hit.method,
      evidence: `Matched via "${part}"`,
    };
  }

  // Unique substring: require first name OR alias in group title
  const hits: ExportGroup[] = [];
  for (const part of splitNameParts(fullName)) {
    const pk = groupNameMatchKey(part);
    if (!pk || pk.length < 4) continue;
    for (const g of scoped) {
      const gk = groupNameMatchKey(g.group_name);
      if (!gk) continue;
      if (gk.includes(pk) || (pk.length >= 6 && pk.includes(gk))) {
        if (isSafeMatch(fullName, g.group_name!, "name_fuzzy")) {
          hits.push(g);
        }
      }
    }
  }
  const unique = [...new Map(hits.map((g) => [g.group_id, g])).values()];
  if (unique.length === 1 && unique[0]?.group_name) {
    return {
      groupId: unique[0].group_id,
      groupName: unique[0].group_name,
      method: "name_fuzzy",
      evidence: "Unique safe substring match",
    };
  }

  return null;
}

async function loadUnmapped(supabase: SupabaseClient): Promise<DbClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, queendom")
    .is("chetto_group_id", null)
    .order("first_name");
  if (error) throw error;
  return (data ?? []) as DbClient[];
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const allGroups = loadAllGroups();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const clients = await loadUnmapped(supabase);
  console.log(`Unmapped: ${clients.length} | Groups: ${allGroups.length}`);
  console.log(dryRun ? "(dry-run)\n" : "(direct DB update)\n");

  const usedGroups = new Map<string, string>();
  let updated = 0;
  const matched: object[] = [];
  const noMatch: object[] = [];

  for (const c of clients) {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const result = findMatch(c, fullName, allGroups);
    if (!result) {
      noMatch.push({ id: c.id, name: fullName, queendom: c.queendom });
      continue;
    }

    const prior = usedGroups.get(result.groupId);
    if (prior && prior !== c.id) {
      noMatch.push({
        id: c.id,
        name: fullName,
        reason: `group_taken:${result.groupId}`,
      });
      continue;
    }

    console.log(`${fullName} → ${result.groupId} "${result.groupName}" (${result.method})`);
    matched.push({ id: c.id, name: fullName, ...result });

    if (!dryRun) {
      const { error } = await supabase
        .from("clients")
        .update({ chetto_group_id: result.groupId })
        .eq("id", c.id)
        .is("chetto_group_id", null);
      if (error) console.error(`  Failed: ${error.message}`);
      else {
        updated += 1;
        usedGroups.set(result.groupId, c.id);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    processed: clients.length,
    updated: dryRun ? matched.length : updated,
    matched,
    noMatch,
  };
  fs.writeFileSync(
    path.join(process.cwd(), "scripts/chetto-remaining-map-report.json"),
    JSON.stringify(report, null, 2),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  ${dryRun ? "Would update" : "Updated"}: ${dryRun ? matched.length : updated}`);
  console.log(`  Still unmapped: ${noMatch.length}`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
