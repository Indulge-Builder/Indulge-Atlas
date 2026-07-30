/**
 * Seed client_chetto_unmapped_queue from scripts/chetto-unmapped-remaining.txt
 *
 * Prerequisite: apply supabase/migrations/105_client_chetto_unmapped_queue.sql
 *
 * Usage:
 *   npx tsx scripts/seed-chetto-unmapped-queue.ts --dry-run
 *   npx tsx scripts/seed-chetto-unmapped-queue.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

type QueueRow = {
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

function parseUnmappedTxt(txtPath: string): QueueRow[] {
  const lines = fs.readFileSync(txtPath, "utf8").split("\n");
  const out: QueueRow[] = [];
  for (const line of lines) {
    const m = line.match(
      /^\d+\s\|\s(.+?)\s\|\s(.+?)\s\|\s([0-9a-f-]{36})\s\|\s\/clients\//,
    );
    if (!m) continue;
    out.push({ name: m[1], queendom: m[2], id: m[3] });
  }
  return out;
}

async function tableExists(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase
    .from("client_chetto_unmapped_queue")
    .select("client_id")
    .limit(1);
  return !error;
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const txtPath = path.join(process.cwd(), "scripts/chetto-unmapped-remaining.txt");
  const rows = parseUnmappedTxt(txtPath);

  if (rows.length === 0) {
    throw new Error(`No clients parsed from ${txtPath}`);
  }

  const supabase = getServiceClient();
  const exists = await tableExists(supabase);
  if (!exists) {
    console.error("client_chetto_unmapped_queue does not exist. Apply migration 105 first:");
    console.error("  supabase/migrations/105_client_chetto_unmapped_queue.sql");
    process.exit(1);
  }

  const { data: clients, error: cErr } = await supabase
    .from("clients")
    .select("id, chetto_group_id")
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (cErr) throw new Error(cErr.message);

  const clientById = new Map(
    (clients ?? []).map((c) => [c.id as string, c.chetto_group_id as string | null]),
  );

  let inserted = 0;
  let updated = 0;
  let resolved = 0;
  let pending = 0;
  let missingClient = 0;

  for (const row of rows) {
    const mapped = clientById.get(row.id);
    if (mapped === undefined) {
      missingClient += 1;
      console.warn(`SKIP (no client row): ${row.name} ${row.id}`);
      continue;
    }

    const status = mapped ? "resolved" : "pending";
    if (status === "resolved") resolved += 1;
    else pending += 1;

    const payload = {
      client_id: row.id,
      display_name: row.name,
      queendom: row.queendom,
      source: "chetto-unmapped-remaining.txt",
      status,
      resolved_at: mapped ? new Date().toISOString() : null,
    };

    if (dryRun) {
      console.log(`${status === "pending" ? "QUEUE" : "DONE"}: ${row.name}`);
      continue;
    }

    const { data: existing } = await supabase
      .from("client_chetto_unmapped_queue")
      .select("client_id, status")
      .eq("client_id", row.id)
      .maybeSingle();

    const { error } = await supabase.from("client_chetto_unmapped_queue").upsert(payload, {
      onConflict: "client_id",
    });
    if (error) {
      console.error(`Failed ${row.name}: ${error.message}`);
      continue;
    }

    if (!existing) inserted += 1;
    else if (existing.status !== status) updated += 1;
  }

  const jsonOut = path.join(process.cwd(), "scripts/chetto-unmapped-remaining.json");
  if (!dryRun) {
    fs.writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: "scripts/chetto-unmapped-remaining.txt",
          clients: rows,
        },
        null,
        2,
      ),
    );
  }

  const { count: pendingCount } = await supabase
    .from("client_chetto_unmapped_queue")
    .select("client_id", { count: "exact", head: true })
    .eq("status", "pending");

  console.log("\n========== SUMMARY ==========");
  console.log(`  Parsed from txt: ${rows.length}`);
  if (dryRun) {
    console.log(`  Would queue (pending): ${pending}`);
    console.log(`  Already mapped: ${resolved}`);
  } else {
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Pending in queue: ${pendingCount ?? "?"}`);
  }
  console.log(`  Missing client rows: ${missingClient}`);
  if (!dryRun) console.log(`  JSON: ${jsonOut}`);
  console.log(`  Atlas: /clients/chetto-unmapped`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
