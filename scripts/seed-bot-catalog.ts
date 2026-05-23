/**
 * Seed Gupshup bot catalog from lib/data/bot-catalog-business.ts
 *
 * Run: npx tsx scripts/seed-bot-catalog.ts
 * Replace dummy rows: npx tsx scripts/seed-bot-catalog.ts --replace
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { BOT_CATALOG_BUSINESS } from "../lib/data/bot-catalog-business";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("Warning: .env.local not found. Using existing process.env only.");
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
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

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load .env.local first).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main(): Promise<void> {
  loadEnvLocal();
  const replace = process.argv.includes("--replace");
  const supabase = getServiceClient();

  if (replace) {
    const { error: deactivateError } = await supabase
      .from("bot_catalog_items")
      .update({ is_active: false } as never)
      .eq("is_active", true);

    if (deactivateError) {
      throw new Error(`Failed to deactivate existing catalog: ${deactivateError.message}`);
    }
    console.log("Deactivated all previously active catalog rows.");
  }

  const rows = BOT_CATALOG_BUSINESS.map((item) => ({
    category: item.category,
    name: item.name,
    description: item.description,
    price_range: item.price_range,
    tags: item.tags,
    image_url: null,
    is_active: true,
  }));

  const BATCH = 25;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("bot_catalog_items").insert(batch as never);
    if (error) {
      throw new Error(`Insert failed at batch ${i / BATCH + 1}: ${error.message}`);
    }
    inserted += batch.length;
  }

  const byCategory = BOT_CATALOG_BUSINESS.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`Inserted ${inserted} catalog items.`);
  console.log("By category:", byCategory);
  if (!replace) {
    console.log(
      "\nTip: re-run with --replace to deactivate old dummy rows before inserting (avoids duplicate recommendations).",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
