/**
 * Tier-2 Chetto suggestions: message search, timeline scan, org insights.
 * Writes to client_chetto_suggestions (pending) — accept via UI or accept in DB manually.
 *
 * Usage:
 *   npx tsx scripts/resolve-chetto-suggestions.ts --dry-run
 *   npx tsx scripts/resolve-chetto-suggestions.ts --limit=20
 *   npx tsx scripts/resolve-chetto-suggestions.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { resolveClientChettoTier2 } from "../lib/services/chettoResolve";

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

function parseLimitFromArgv(): number | undefined {
  const eq = process.argv.find((a) => a.startsWith("--limit="));
  if (eq) {
    const n = Number(eq.slice("--limit=".length));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const idx = process.argv.indexOf("--limit");
  const next = process.argv[idx + 1];
  if (idx !== -1 && next && !next.startsWith("--")) {
    const n = Number(next);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
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

async function upsertPendingSuggestion(
  supabase: SupabaseClient,
  clientId: string,
  groupId: string,
  confidence: number,
  method: string,
  evidence: string,
): Promise<boolean> {
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

  return !error;
}

async function main(): Promise<void> {
  loadDotEnvFiles();
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = parseLimitFromArgv();

  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error("CHETTO_API_KEY is missing.");
  }

  const supabase = getServiceClient();
  let q = supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
    .is("chetto_group_id", null)
    .order("first_name", { ascending: true });

  if (limitArg) q = q.limit(limitArg);

  const { data: clients, error: cErr } = await q;
  if (cErr) throw cErr;
  const list = (clients ?? []) as DbClient[];

  console.log(`Unmapped clients to resolve: ${list.length}${dryRun ? " (dry-run)" : ""}\n`);

  const matched: {
    id: string;
    name: string;
    groupId: string;
    method: string;
    confidence: number;
  }[] = [];
  const noMatch: { id: string; name: string }[] = [];

  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    process.stdout.write(`[${i + 1}/${list.length}] ${name || c.id}… `);

    const result = await resolveClientChettoTier2({
      phone: c.phone_number,
      firstName: c.first_name,
      lastName: c.last_name,
      queendom: c.queendom,
    });

    if (!result) {
      console.log("no match");
      noMatch.push({ id: c.id, name });
      continue;
    }

    console.log(`${result.method} → ${result.groupId} (${result.confidence}%)`);
    matched.push({
      id: c.id,
      name,
      groupId: result.groupId,
      method: result.method,
      confidence: result.confidence,
    });

    if (!dryRun) {
      const ok = await upsertPendingSuggestion(
        supabase,
        c.id,
        result.groupId,
        result.confidence,
        result.method,
        result.evidence,
      );
      if (!ok) console.error("  (DB upsert failed)");
    }
  }

  const reportPath = path.join(
    process.cwd(),
    "scripts",
    "chetto-suggestions-report.json",
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        processed: list.length,
        matched,
        noMatch,
      },
      null,
      2,
    ),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  Processed: ${list.length}`);
  console.log(`  Matched: ${matched.length}`);
  console.log(`  No match: ${noMatch.length}`);
  console.log(`  Report: ${reportPath}`);
  console.log(`  Review pending rows at /clients/chetto-mapping`);
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
