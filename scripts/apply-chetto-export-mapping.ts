/**
 * Map Atlas clients → Chetto group_id using a local id+name export (no Chetto API).
 *
 * Usage:
 *   npx tsx scripts/apply-chetto-export-mapping.ts --dry-run
 *   npx tsx scripts/apply-chetto-export-mapping.ts
 *   npx tsx scripts/apply-chetto-export-mapping.ts --input scripts/chetto-all-group-ids-with-names.json
 *   npx tsx scripts/apply-chetto-export-mapping.ts --overwrite
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
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
  phone_number: string;
  queendom: string | null;
  chetto_group_id: string | null;
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

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseInputPath(): string {
  const eq = process.argv.find((a) => a.startsWith("--input="));
  if (eq) return path.resolve(process.cwd(), eq.slice("--input=".length));
  return path.resolve(process.cwd(), "scripts/chetto-old-514-group-ids-with-names.json");
}

function toChettoGroups(exportGroups: ExportGroup[]): ChettoGroup[] {
  return exportGroups
    .filter((g) => g.group_id && g.group_name)
    .map((g) => ({
      group_id: g.group_id,
      group_name: g.group_name,
      valid: true,
      created_at_utc: null,
      updated_at_utc: null,
      created_at: null,
      access_members: [],
    }));
}

function groupsForClient(
  all: ExportGroup[],
  client: DbClient,
): ExportGroup[] {
  if (!client.queendom?.trim()) return all;
  const q = client.queendom.trim();
  const scoped = all.filter((g) => g.queendom === q);
  return scoped.length > 0 ? scoped : all;
}

function resolveWithQueendom(
  client: DbClient,
  allExport: ExportGroup[],
  includeFuzzy: boolean,
): { groupId: string; method: "name" | "name_fuzzy"; groupName: string } | null {
  const scopedExport = groupsForClient(allExport, client);
  const groups = toChettoGroups(scopedExport);
  const index = buildChettoMappingIndex(groups);
  const match = resolveChettoGroupIdFromIndex(
    {
      phone: client.phone_number ?? "",
      firstName: client.first_name,
      lastName: client.last_name,
    },
    index,
    groups,
  );
  if (!match || match.method === "phone") return null;
  if (match.method === "name_fuzzy" && !includeFuzzy) return null;

  if (match.method === "name_fuzzy") {
    const first = client.first_name.trim().toLowerCase();
    const hit = scopedExport.find((g) => g.group_id === match.groupId);
    const gKey = (hit?.group_name ?? "")
      .toLowerCase()
      .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "");
    const last = (client.last_name ?? "").trim().toLowerCase();
    const full = [first, last].filter(Boolean).join(" ");
    const firstOk = first.length >= 3 && gKey.includes(first);
    const fullOk = full.length >= 5 && gKey.includes(full);
    const coupleOk =
      full.includes("&") &&
      full
        .split("&")
        .map((p) => p.trim())
        .filter((p) => p.length >= 3)
        .some((p) => gKey.includes(p));
    if (!firstOk && !fullOk && !coupleOk) return null;
  }

  const hit = scopedExport.find((g) => g.group_id === match.groupId);
  return {
    groupId: match.groupId,
    method: match.method,
    groupName: hit?.group_name ?? match.groupId,
  };
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");
  const includeFuzzy = process.argv.includes("--include-fuzzy");
  const inputPath = parseInputPath();

  const source = JSON.parse(fs.readFileSync(inputPath, "utf8")) as {
    groups: ExportGroup[];
  };
  const exportGroups = (source.groups ?? []).filter(
    (g) => g.group_id && g.group_name,
  );
  console.log(`Export: ${inputPath}`);
  console.log(`Groups with names: ${exportGroups.length}\n`);

  const supabase = getServiceClient();
  let q = supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
    .order("id", { ascending: true });
  if (!overwrite) q = q.is("chetto_group_id", null);

  const { data: clients, error } = await q;
  if (error) throw error;
  const list = (clients ?? []) as DbClient[];
  console.log(
    `Clients to process: ${list.length}${overwrite ? " (overwrite)" : " (unmapped only)"}`,
  );

  const counts = { name: 0, name_fuzzy: 0 };
  const proposed: {
    id: string;
    clientName: string;
    groupId: string;
    groupName: string;
    method: "name" | "name_fuzzy";
    queendom: string | null;
  }[] = [];
  const unmatched: {
    id: string;
    name: string;
    queendom: string | null;
    reason: string;
  }[] = [];

  const usedGroupIds = new Map<string, string>();

  for (const c of list) {
    const match = resolveWithQueendom(c, exportGroups, includeFuzzy);
    const clientName = [c.first_name, c.last_name].filter(Boolean).join(" ");
    if (!match) {
      unmatched.push({
        id: c.id,
        name: clientName,
        queendom: c.queendom,
        reason: "no_name_match",
      });
      continue;
    }

    const priorClient = usedGroupIds.get(match.groupId);
    if (priorClient && priorClient !== c.id) {
      unmatched.push({
        id: c.id,
        name: clientName,
        queendom: c.queendom,
        reason: `group_already_assigned:${match.groupId}`,
      });
      continue;
    }

    counts[match.method] += 1;
    usedGroupIds.set(match.groupId, c.id);
    proposed.push({
      id: c.id,
      clientName,
      groupId: match.groupId,
      groupName: match.groupName,
      method: match.method,
      queendom: c.queendom,
    });
  }

  let updated = 0;
  if (dryRun) {
    for (const p of proposed) {
      console.log(
        `[dry-run] ${p.clientName} (${p.queendom ?? "?"}) → ${p.groupId} "${p.groupName}" (${p.method})`,
      );
    }
  } else {
    for (const p of proposed) {
      const { error: uErr } = await supabase
        .from("clients")
        .update({ chetto_group_id: p.groupId })
        .eq("id", p.id);
      if (uErr) console.error(`Update failed ${p.id}:`, uErr.message);
      else updated += 1;
    }
  }

  const reportPath = path.join(
    process.cwd(),
    "scripts",
    "chetto-export-mapping-report.json",
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        input: inputPath,
        dryRun,
        overwrite,
        groupsInExport: exportGroups.length,
        clientsProcessed: list.length,
        matched: proposed.length,
        updated: dryRun ? 0 : updated,
        counts,
        proposed,
        unmatched,
      },
      null,
      2,
    ),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  ${dryRun ? "Would update" : "Updated"}: ${dryRun ? proposed.length : updated}`);
  console.log(`  Exact name: ${counts.name}`);
  console.log(`  Fuzzy name: ${counts.name_fuzzy}`);
  console.log(`  Skipped: ${unmatched.length}`);
  console.log(`  Report: ${reportPath}`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
