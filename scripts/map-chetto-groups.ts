/**
 * Match Atlas clients to Chetto groups (phone, exact name, fuzzy name).
 * Usage:
 *   npx tsx scripts/map-chetto-groups.ts --dry-run
 *   npx tsx scripts/map-chetto-groups.ts
 *   npx tsx scripts/map-chetto-groups.ts --overwrite   # remap all clients
 *   npx tsx scripts/map-chetto-groups.ts --retry-only  # resume aggressive metadata retry from cache
 *   npx tsx scripts/map-chetto-groups.ts --use-cache-only  # map clients from cached metadata (no API fetch)
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
} from "../lib/actions/chetto";
import {
  cacheToLoadedGroups,
  DEFAULT_CHETTO_METADATA_CACHE_PATH,
  loadChettoMetadataCache,
  saveChettoMetadataCache,
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

function parseOrgIdFromArgv(): string | undefined {
  const eq = process.argv.find((a) => a.startsWith("--org-id="));
  if (eq) return eq.slice("--org-id=".length).trim() || undefined;
  const idx = process.argv.indexOf("--org-id");
  const next = process.argv[idx + 1];
  if (idx !== -1 && next && !next.startsWith("--")) return next.trim();
  return undefined;
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

type DbClient = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  queendom: string | null;
  chetto_group_id: string | null;
};

type MatchMethod = "phone" | "name" | "name_fuzzy";

async function main(): Promise<void> {
  loadDotEnvFiles();
  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");

  const orgFromArg = parseOrgIdFromArgv();
  if (orgFromArg) {
    process.env.CHETTO_ORG_ID = orgFromArg;
    console.log("Using --org-id from argv.\n");
  }

  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error("CHETTO_API_KEY is missing.");
  }

  const supabase = getServiceClient();
  let q = supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
    .order("id", { ascending: true });
  if (!overwrite) q = q.is("chetto_group_id", null);

  const { data: clients, error: cErr } = await q;
  if (cErr) throw cErr;
  const list = (clients ?? []) as DbClient[];
  console.log(
    `Clients to process: ${list.length}${overwrite ? " (overwrite)" : " (unmapped only)"}`,
  );

  // `includeStaticFallback` was removed from ListAllGroupIdsOptions; the static
  // fallback no longer exists, so the live API is the only source either way.
  const groupIds = await listAllGroupIds();
  console.log(`Chetto group ids (live API): ${groupIds.length}`);

  const cachePath = path.join(process.cwd(), DEFAULT_CHETTO_METADATA_CACHE_PATH);
  const existingCache = loadChettoMetadataCache(cachePath);
  const preloaded = existingCache ? cacheToLoadedGroups(existingCache) : [];
  const retryOnly = process.argv.includes("--retry-only");
  const useCacheOnly = process.argv.includes("--use-cache-only");

  if (preloaded.length > 0) {
    console.log(`Using metadata cache: ${preloaded.length} groups preloaded`);
  }

  let loadedGroups: Awaited<ReturnType<typeof fetchAllGroupMetadata>>["loaded"];
  let failedGroupIds: string[];

  if (useCacheOnly) {
    if (!existingCache || preloaded.length === 0) {
      throw new Error(
        "No metadata cache at scripts/chetto-metadata-cache.json — run a full fetch first.",
      );
    }
    loadedGroups = preloaded;
    failedGroupIds = groupIds.filter((id) => !existingCache.loaded[id]);
    console.log(
      `Skipping API fetch — mapping from cache (${loadedGroups.length} groups, ${failedGroupIds.length} without metadata)\n`,
    );
  } else {
  let lastCheckpointAt = 0;
  const fetchResult =
    await fetchAllGroupMetadata(groupIds, {
      concurrency: 3,
      preloaded,
      retryOnlyIds:
        retryOnly && existingCache
          ? groupIds.filter((id) => !existingCache.loaded[id])
          : undefined,
      retryLogEvery: 5,
      onCheckpoint: ({ loaded, failed }) => {
        const now = Date.now();
        if (now - lastCheckpointAt < 2000) return;
        lastCheckpointAt = now;
        const record: Record<string, (typeof loaded)[0]> = {};
        for (const g of loaded) record[g.group_id] = g;
        saveChettoMetadataCache(cachePath, {
          updatedAt: new Date().toISOString(),
          groupIdsListed: groupIds,
          loaded: record,
          failed,
        });
      },
    });

  loadedGroups = fetchResult.loaded;
  failedGroupIds = fetchResult.failed;

  saveChettoMetadataCache(cachePath, {
    updatedAt: new Date().toISOString(),
    groupIdsListed: groupIds,
    loaded: Object.fromEntries(loadedGroups.map((g) => [g.group_id, g])),
    failed: failedGroupIds,
    aggressiveRetryCompleted: true,
  });
  console.log(`Metadata cache: ${cachePath}`);
  }

  console.log(
    `Metadata loaded: ${loadedGroups.length} / ${groupIds.length} (${failedGroupIds.length} Chetto failures)`,
  );

  const index = buildChettoMappingIndex(loadedGroups);
  console.log(
    `Index: ${index.byPhone.size} phone keys, ${index.byName.size} exact names\n`,
  );

  const counts: Record<MatchMethod, number> = {
    phone: 0,
    name: 0,
    name_fuzzy: 0,
  };
  const proposed: { id: string; groupId: string; method: MatchMethod }[] = [];
  const unmatched: {
    id: string;
    name: string;
    phone: string;
    queendom: string | null;
    reason: string;
  }[] = [];

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
    if (!match) {
      unmatched.push({
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
      });
      continue;
    }
    counts[match.method] += 1;
    proposed.push({ id: c.id, groupId: match.groupId, method: match.method });
  }

  let updated = 0;
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

  const reportPath = path.join(process.cwd(), "scripts", "chetto-unmapped-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        groupsListed: groupIds.length,
        groupsLoaded: loadedGroups.length,
        groupsFailed: failedGroupIds,
        matched: proposed.length,
        unmatched,
      },
      null,
      2,
    ),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  ${dryRun ? "Would update" : "Updated"}: ${dryRun ? proposed.length : updated}`);
  console.log(`  Matched by phone: ${counts.phone}`);
  console.log(`  Matched by exact name: ${counts.name}`);
  console.log(`  Matched by fuzzy name: ${counts.name_fuzzy}`);
  console.log(`  Skipped (no match): ${unmatched.length}`);
  console.log(`  Groups Chetto could not load: ${failedGroupIds.length}`);
  console.log(`  Unmapped report: ${reportPath}`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});