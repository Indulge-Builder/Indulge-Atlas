/**
 * Resumable Chetto group metadata fetch + optional client mapping.
 *
 * Usage:
 *   npx tsx scripts/retry-chetto-metadata.ts --retry-only     # aggressive pass on cached failures
 *   npx tsx scripts/retry-chetto-metadata.ts                  # full fetch with cache
 *   npx tsx scripts/retry-chetto-metadata.ts --apply-mappings # after fetch, map unmapped clients
 *   npx tsx scripts/retry-chetto-metadata.ts --seed-from-report  # bootstrap failed list from unmapped report
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
  explainChettoMatchFailure,
  fetchAllGroupMetadata,
  listAllGroupIds,
  resolveChettoGroupIdFromIndex,
  type ChettoGroup,
} from "../lib/actions/chetto";
import {
  cacheToLoadedGroups,
  DEFAULT_CHETTO_METADATA_CACHE_PATH,
  loadChettoMetadataCache,
  saveChettoMetadataCache,
  type ChettoMetadataCacheFile,
} from "../lib/services/chettoMetadataCache";

function applyEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split("\n")) {
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

function loadDotEnvFiles(): void {
  const root = process.cwd();
  applyEnvFile(path.join(root, ".env"));
  applyEnvFile(path.join(root, ".env.local"));
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

function groupsToCacheRecord(groups: ChettoGroup[]): Record<string, ChettoGroup> {
  const out: Record<string, ChettoGroup> = {};
  for (const g of groups) out[g.group_id] = g;
  return out;
}

function writeCache(
  cachePath: string,
  groupIdsListed: string[],
  loaded: ChettoGroup[],
  failed: string[],
  aggressiveRetryCompleted: boolean,
): void {
  saveChettoMetadataCache(cachePath, {
    updatedAt: new Date().toISOString(),
    groupIdsListed,
    loaded: groupsToCacheRecord(loaded),
    failed,
    aggressiveRetryCompleted,
  });
}

function seedCacheFromReport(
  cachePath: string,
  groupIds: string[],
): ChettoMetadataCacheFile | null {
  const reportPath = path.join(process.cwd(), "scripts", "chetto-unmapped-report.json");
  if (!fs.existsSync(reportPath)) return null;

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
    groupsLoaded?: number;
    groupsFailed?: string[];
  };
  const failed = report.groupsFailed ?? [];
  const loadedCount = report.groupsLoaded ?? 0;
  if (failed.length === 0) return null;

  console.log(
    `Seeding cache from report: ${loadedCount} loaded (not cached), ${failed.length} failed to retry.`,
  );
  console.log("Initial pass will run to populate loaded groups, then retry failures.\n");

  const cache: ChettoMetadataCacheFile = {
    updatedAt: new Date().toISOString(),
    groupIdsListed: groupIds,
    loaded: {},
    failed,
    aggressiveRetryCompleted: false,
  };
  saveChettoMetadataCache(cachePath, cache);
  return cache;
}

async function applyClientMappings(
  supabase: SupabaseClient,
  loadedGroups: ChettoGroup[],
  failedGroupIds: string[],
  dryRun: boolean,
): Promise<void> {
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
    .is("chetto_group_id", null)
    .order("id", { ascending: true });

  if (error) throw error;
  const list = clients ?? [];
  const index = buildChettoMappingIndex(loadedGroups);

  let updated = 0;
  const proposed: { id: string; groupId: string; method: string }[] = [];

  for (const c of list) {
    const match = resolveChettoGroupIdFromIndex(
      {
        phone: c.phone_number,
        firstName: c.first_name,
        lastName: c.last_name,
      },
      index,
      loadedGroups,
    );
    if (!match) continue;
    proposed.push({ id: c.id, groupId: match.groupId, method: match.method });
  }

  if (dryRun) {
    for (const p of proposed) {
      console.log(`[dry-run] ${p.id} → ${p.groupId} (${p.method})`);
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

  const unmatched = list.filter(
    (c) => !proposed.some((p) => p.id === c.id),
  );
  const reportPath = path.join(process.cwd(), "scripts", "chetto-unmapped-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        groupsListed: loadedGroups.length + failedGroupIds.length,
        groupsLoaded: loadedGroups.length,
        groupsFailed: failedGroupIds,
        matched: proposed.length,
        unmatched: unmatched.map((c) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          phone: c.phone_number,
          queendom: c.queendom,
          reason: explainChettoMatchFailure(
            {
              phone: c.phone_number,
              firstName: c.first_name,
              lastName: c.last_name,
            },
            index,
            loadedGroups,
            failedGroupIds,
          ),
        })),
      },
      null,
      2,
    ),
  );

  console.log("\n========== MAPPING SUMMARY ==========");
  console.log(`  ${dryRun ? "Would update" : "Updated"}: ${dryRun ? proposed.length : updated}`);
  console.log(`  Still unmapped: ${unmatched.length}`);
  console.log(`  Report: ${reportPath}`);
  console.log("=====================================\n");
}

async function main(): Promise<void> {
  loadDotEnvFiles();
  const retryOnly = process.argv.includes("--retry-only");
  const applyMappings = process.argv.includes("--apply-mappings");
  const dryRun = process.argv.includes("--dry-run");
  const seedFromReport = process.argv.includes("--seed-from-report");

  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error("CHETTO_API_KEY is missing.");
  }

  const cachePath = path.join(process.cwd(), DEFAULT_CHETTO_METADATA_CACHE_PATH);
  // `includeStaticFallback` was removed from ListAllGroupIdsOptions; the static
  // fallback no longer exists, so the live API is the only source either way.
  const groupIds = await listAllGroupIds();
  console.log(`Chetto group ids (live API): ${groupIds.length}`);

  let cache = loadChettoMetadataCache(cachePath);
  if (!cache && seedFromReport) {
    cache = seedCacheFromReport(cachePath, groupIds);
  }

  if (retryOnly && !cache) {
    console.error(
      "No cache at scripts/chetto-metadata-cache.json. Run without --retry-only first, or use --seed-from-report.",
    );
    process.exit(1);
  }

  const preloaded = cache ? cacheToLoadedGroups(cache) : [];
  const retryOnlyIds =
    retryOnly && cache
      ? groupIds.filter((id) => !cache.loaded[id])
      : undefined;

  if (retryOnly) {
    console.log(
      `Resuming aggressive retry: ${retryOnlyIds?.length ?? 0} groups (${preloaded.length} already cached)\n`,
    );
  } else if (preloaded.length > 0) {
    console.log(`Cache hit: ${preloaded.length} groups loaded, resuming fetch.\n`);
  }

  let lastCheckpointAt = 0;
  const { loaded: loadedGroups, failed: failedGroupIds } =
    await fetchAllGroupMetadata(groupIds, {
      concurrency: 3,
      preloaded,
      retryOnlyIds,
      retryLogEvery: 5,
      onCheckpoint: ({ loaded, failed, phase }) => {
        const now = Date.now();
        if (now - lastCheckpointAt < 2000 && phase === "retry") return;
        lastCheckpointAt = now;
        writeCache(
          cachePath,
          groupIds,
          loaded,
          failed,
          phase === "retry" && failed.length === 0,
        );
      },
    });

  writeCache(
    cachePath,
    groupIds,
    loadedGroups,
    failedGroupIds,
    true,
  );

  console.log(
    `\nMetadata loaded: ${loadedGroups.length} / ${groupIds.length} (${failedGroupIds.length} Chetto failures)`,
  );
  console.log(`Cache saved: ${cachePath}`);

  if (applyMappings) {
    const supabase = getServiceClient();
    await applyClientMappings(supabase, loadedGroups, failedGroupIds, dryRun);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
