/**
 * Import Chetto group suggestions for unmapped clients into Atlas
 * (client_chetto_suggestions → review at /clients/chetto-mapping).
 *
 * Usage:
 *   npx tsx scripts/import-unmapped-to-atlas.ts --dry-run
 *   npx tsx scripts/import-unmapped-to-atlas.ts
 *   npx tsx scripts/import-unmapped-to-atlas.ts --input scripts/chetto-unmapped-92.txt
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

type UnmappedClient = {
  id: string;
  name: string;
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

function parseUnmappedFromReport(): UnmappedClient[] {
  const reportPath = path.join(process.cwd(), "scripts/chetto-export-mapping-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    unmatched: UnmappedClient[];
  };
  return report.unmatched;
}

function parseUnmappedFromTxt(txtPath: string): UnmappedClient[] {
  const lines = fs.readFileSync(txtPath, "utf8").split("\n");
  const out: UnmappedClient[] = [];
  for (const line of lines) {
    const m = line.match(
      /^\d+\s\|\s(.+?)\s\|\s(.+?)\s\|\s([0-9a-f-]{36})\s\|\s\/clients\//,
    );
    if (!m) continue;
    out.push({ name: m[1], queendom: m[2], id: m[3] });
  }
  return out;
}

function loadExportGroups(): ExportGroup[] {
  const exportPath = path.join(
    process.cwd(),
    "scripts/chetto-all-group-ids-with-names.json",
  );
  const fallback = path.join(
    process.cwd(),
    "scripts/chetto-old-514-group-ids-with-names.json",
  );
  const file = fs.existsSync(exportPath) ? exportPath : fallback;
  const source = JSON.parse(fs.readFileSync(file, "utf8")) as { groups: ExportGroup[] };
  return (source.groups ?? []).filter((g) => g.group_id && g.group_name);
}

function splitNameParts(fullName: string): string[] {
  const parts: string[] = [];
  const paren = fullName.match(/\(([^)]+)\)/);
  if (paren?.[1]) parts.push(paren[1].trim());

  let base = fullName.replace(/\([^)]*\)/g, " ").trim();
  base = base.replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
  if (base) parts.push(base);

  if (base.includes("&")) {
    for (const seg of base.split("&")) {
      const s = seg.trim();
      if (s.length >= 3) parts.push(s);
    }
  }

  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    parts.push(`${tokens[0]} ${tokens[tokens.length - 1]}`);
    parts.push(tokens[0]!);
    parts.push(tokens[tokens.length - 1]!);
  } else if (tokens.length === 1 && tokens[0]!.length >= 3) {
    parts.push(tokens[0]!);
  }

  return [...new Set(parts.filter((p) => p.length >= 3))];
}

function parseClientName(fullName: string): { firstName: string; lastName: string | null } {
  const base = fullName.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const withoutPrefix = base.replace(/^mr\.?\s+|^ms\.?\s+|^dr\.?\s+/i, "").trim();
  const tokens = withoutPrefix.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: fullName, lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: null };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(" ") };
}

function toChettoGroups(exportGroups: ExportGroup[]): ChettoGroup[] {
  return exportGroups.map((g) => ({
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

type MatchResult = {
  groupId: string;
  groupName: string;
  method: "name" | "name_fuzzy";
  confidence: number;
  evidence: string;
};

function findBestMatch(
  client: UnmappedClient,
  allExport: ExportGroup[],
  minConfidence: number,
): MatchResult | null {
  const nameParts = splitNameParts(client.name);
  const scoped = groupsForQueendom(allExport, client.queendom);
  const groups = toChettoGroups(scoped);

  for (const part of nameParts) {
    const { firstName, lastName } = parseClientName(part);
    const index = buildChettoMappingIndex(groups);
    const hit = resolveChettoGroupIdFromIndex(
      { phone: "", firstName, lastName },
      index,
      groups,
    );
    if (!hit || hit.method === "phone") continue;

    const group = scoped.find((g) => g.group_id === hit.groupId);
    if (!group?.group_name) continue;

    const confidence =
      hit.method === "name"
        ? part === client.name.replace(/\([^)]*\)/g, "").trim()
          ? 95
          : 88
        : 72;

    if (confidence < minConfidence) continue;

    return {
      groupId: hit.groupId,
      groupName: group.group_name,
      method: hit.method,
      confidence,
      evidence: `Export name match via "${part}" → ${group.group_name}`,
    };
  }

  // Substring scan: client token appears in group title
  const clientKey = groupNameMatchKey(client.name.replace(/\([^)]*\)/g, ""));
  if (clientKey && clientKey.length >= 4) {
    const hits: { group: ExportGroup; score: number }[] = [];
    for (const g of scoped) {
      const gKey = groupNameMatchKey(g.group_name);
      if (!gKey) continue;
      if (gKey.includes(clientKey) || clientKey.includes(gKey)) {
        hits.push({ group: g, score: gKey.length });
      }
    }
    if (hits.length === 1) {
      const g = hits[0]!.group;
      const confidence = 65;
      if (confidence < minConfidence) return null;
      return {
        groupId: g.group_id,
        groupName: g.group_name!,
        method: "name_fuzzy",
        confidence: 65,
        evidence: `Single substring match: ${g.group_name}`,
      };
    }
  }

  return null;
}

function isSafeDirectMatch(clientName: string, result: MatchResult): boolean {
  if (result.confidence >= 88) return true;
  if (result.method === "name") return true;

  const { firstName } = parseClientName(clientName.replace(/\([^)]*\)/g, " ").trim());
  const first = firstName.trim().toLowerCase();
  const gKey = result.groupName
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "");

  if (first.length >= 4 && gKey.includes(first)) return true;

  const paren = clientName.match(/\(([^)]+)\)/);
  if (paren?.[1]) {
    const alias = paren[1].replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
    const aliasFirst = alias.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (aliasFirst.length >= 4 && gKey.includes(aliasFirst)) return true;
    if (alias.length >= 5 && gKey.includes(alias.toLowerCase())) return true;
  }

  // Allow close spelling (e.g. Deepshikha → Deepshika)
  if (first.length >= 6) {
    const stem = first.slice(0, 6);
    if (gKey.includes(stem)) return true;
  }

  return false;
}

async function loadUnmappedFromDb(
  supabase: SupabaseClient,
): Promise<UnmappedClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, queendom, chetto_group_id")
    .is("chetto_group_id", null)
    .order("first_name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    queendom: (c.queendom as string | null) ?? null,
  }));
}

async function upsertPendingSuggestion(
  supabase: SupabaseClient,
  clientId: string,
  groupId: string,
  confidence: number,
  method: string,
  evidence: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: existingPending } = await supabase
    .from("client_chetto_suggestions")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "pending");

  if (existingPending?.length) {
    const ids = existingPending.map((r) => r.id as string).filter(Boolean);
    if (ids.length > 0) {
      await supabase
        .from("client_chetto_suggestions")
        .update({ status: "rejected" })
        .in("id", ids);
    }
  }

  const { error } = await supabase.from("client_chetto_suggestions").upsert(
    {
      client_id: clientId,
      chetto_group_id: groupId,
      confidence,
      method,
      evidence: evidence.slice(0, 2000),
      status: "pending",
      resolved_by: null,
    },
    { onConflict: "client_id,chetto_group_id" },
  );

  return { ok: !error, error: error?.message ?? null };
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const directOnly = process.argv.includes("--direct-only");
  const applyDirect = directOnly || process.argv.includes("--apply-direct");
  const fromDb = process.argv.includes("--from-db") || directOnly;
  const txtArg = process.argv.find((a) => a.startsWith("--input="));
  const minConfArg = process.argv.find((a) => a.startsWith("--min-confidence="));
  const minConfidence = minConfArg
    ? Number(minConfArg.slice("--min-confidence=".length))
    : directOnly
      ? 70
      : 80;

  const supabase = getServiceClient();
  const unmapped = fromDb
    ? await loadUnmappedFromDb(supabase)
    : txtArg
      ? parseUnmappedFromTxt(
          path.resolve(process.cwd(), txtArg.slice("--input=".length)),
        )
      : parseUnmappedFromReport();

  const exportGroups = loadExportGroups();
  console.log(`Unmapped clients: ${unmapped.length}`);
  console.log(`Chetto groups in export: ${exportGroups.length}`);
  console.log(`${dryRun ? "(dry-run)" : directOnly ? "(direct DB update)" : "(writing to Atlas)"}\n`);

  const matched: (MatchResult & { clientId: string; clientName: string })[] = [];
  const noMatch: UnmappedClient[] = [];
  const skippedUnsafe: UnmappedClient[] = [];
  let suggestionsWritten = 0;
  let directUpdated = 0;

  for (const client of unmapped) {
    const result = findBestMatch(client, exportGroups, minConfidence);
    if (!result) {
      noMatch.push(client);
      continue;
    }

    if (applyDirect && !isSafeDirectMatch(client.name, result)) {
      skippedUnsafe.push(client);
      console.log(`SKIP (unsafe): ${client.name} → ${result.groupName}`);
      continue;
    }

    matched.push({ ...result, clientId: client.id, clientName: client.name });
    console.log(
      `${client.name} → ${result.groupId} "${result.groupName}" (${result.confidence}%)`,
    );

    if (dryRun) continue;

    if (directOnly) {
      const { error: uErr } = await supabase
        .from("clients")
        .update({ chetto_group_id: result.groupId })
        .eq("id", client.id)
        .is("chetto_group_id", null);
      if (uErr) console.error(`  Direct update failed: ${uErr.message}`);
      else {
        directUpdated += 1;
        console.log("  ✓ chetto_group_id saved");
      }
      continue;
    }

    const upsert = await upsertPendingSuggestion(
      supabase,
      client.id,
      result.groupId,
      result.confidence,
      result.method,
      result.evidence,
    );
    if (upsert.ok) {
      suggestionsWritten += 1;
    } else {
      console.error(`  Suggestion upsert failed: ${upsert.error}`);
      if (applyDirect && result.confidence >= 88) {
        const { error: uErr } = await supabase
          .from("clients")
          .update({ chetto_group_id: result.groupId })
          .eq("id", client.id)
          .is("chetto_group_id", null);
        if (uErr) console.error(`  Direct update failed: ${uErr.message}`);
        else {
          directUpdated += 1;
          console.log("  Applied chetto_group_id directly on client");
        }
      }
    }
  }

  const reportPath = path.join(process.cwd(), "scripts/chetto-unmapped-import-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        processed: unmapped.length,
        suggestions: matched.length,
        suggestionsWritten,
        directUpdated,
        skippedUnsafe,
        noMatch,
        matched,
      },
      null,
      2,
    ),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  Processed: ${unmapped.length}`);
  console.log(`  Suggestions ${dryRun ? "found" : "written"}: ${dryRun ? matched.length : suggestionsWritten}`);
  if (directUpdated > 0) console.log(`  Direct DB updates: ${directUpdated}`);
  if (skippedUnsafe.length > 0) console.log(`  Skipped (unsafe fuzzy): ${skippedUnsafe.length}`);
  console.log(`  Still no match: ${noMatch.length}`);
  console.log(`  Report: ${reportPath}`);
  console.log(`  Review at: /clients/chetto-mapping (filter Unmapped only)`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
