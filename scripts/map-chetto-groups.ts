/**
 * One-off / cron-friendly: match Atlas clients to Chetto Joule groups by phone in
 * `access_members` on GET /v1/groups/{id}, then set `clients.chetto_group_id`.
 *
 * Loads `.env` then `.env.local` from the repo root (cwd). You can also set vars in the shell.
 *
 * Requires:
 *   CHETTO_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Recommended:
 *   CHETTO_ORG_ID   (parent org — unioned with queendom sub-orgs in lib/actions/chetto.ts)
 *   or pass `--org-id=<uuid>` once
 *
 * Usage:
 *   npx tsx scripts/map-chetto-groups.ts --dry-run
 *   npx tsx scripts/map-chetto-groups.ts --dry-run --org-id=733e0439253a44c58f5e4d231ad39b74
 *   npx tsx scripts/map-chetto-groups.ts           # fill only rows where chetto_group_id IS NULL
 *   npx tsx scripts/map-chetto-groups.ts --overwrite
 *
 * Unmatched clients: phone not found in any group's `access_members` (wrong number,
 * guest not added to WA group yet, or Chetto metadata missing members for that group).
 * Review on /clients/chetto-mapping.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fetchGroupMetadata, listAllGroupIds } from "../lib/actions/chetto";

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

/** `.env` first, then `.env.local` (later file wins per key). Run from repo root. */
function loadDotEnvFiles(): void {
  const root = process.cwd();
  applyEnvFile(path.join(root, ".env"));
  applyEnvFile(path.join(root, ".env.local"));
  if (
    !fs.existsSync(path.join(root, ".env")) &&
    !fs.existsSync(path.join(root, ".env.local"))
  ) {
    console.warn(
      "Warning: no .env or .env.local in cwd — using process.env only.",
    );
  }
}

function parseOrgIdFromArgv(): string | undefined {
  const eq = process.argv.find((a) => a.startsWith("--org-id="));
  if (eq) {
    const v = eq.slice("--org-id=".length).trim();
    return v.length > 0 ? v : undefined;
  }
  const idx = process.argv.indexOf("--org-id");
  if (idx !== -1) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith("--")) return next.trim() || undefined;
  }
  return undefined;
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

function chettoLookupKeyVariants(normalizedDigits: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (k.length === 0 || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  push(normalizedDigits);
  if (/^[6-9]\d{9}$/.test(normalizedDigits)) {
    push(`91${normalizedDigits}`);
  }
  if (/^91[6-9]\d{9}$/.test(normalizedDigits)) {
    push(normalizedDigits.slice(2));
  }
  if (/^0[6-9]\d{9}$/.test(normalizedDigits)) {
    const national = normalizedDigits.slice(1);
    push(national);
    push(`91${national}`);
  }
  return out;
}

type GroupMeta = {
  group_id: string;
  access_members: string[];
};

type DbClient = {
  id: string;
  phone_number: string;
  chetto_group_id: string | null;
};

async function main(): Promise<void> {
  loadDotEnvFiles();
  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");

  const orgFromArg = parseOrgIdFromArgv();
  if (orgFromArg) {
    process.env.CHETTO_ORG_ID = orgFromArg;
    console.log(
      "Using --org-id from argv (overrides CHETTO_ORG_ID for this run).\n",
    );
  } else if (!process.env.CHETTO_ORG_ID?.trim()) {
    console.warn(
      "CHETTO_ORG_ID not set — listing queendom sub-orgs + static fallback only.\n",
    );
  }

  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error(
      "CHETTO_API_KEY is missing. Add it to .env.local (or .env) in the project root, or export it in the shell.",
    );
  }

  const supabase = getServiceClient();

  let q = supabase
    .from("clients")
    .select("id, phone_number, chetto_group_id")
    .order("id", { ascending: true });
  if (!overwrite) {
    q = q.is("chetto_group_id", null);
  }

  const { data: clients, error: cErr } = await q;
  if (cErr) throw cErr;
  const list = (clients ?? []) as DbClient[];
  console.log(
    `Clients to process: ${list.length} (${overwrite ? "overwrite on" : "only unmapped"})`,
  );

  const groupIds = await listAllGroupIds();
  console.log(
    `Chetto groups (parent org + sub-orgs + static fallback): ${groupIds.length}`,
  );

  const chunkSize = 12;
  const groupMetaById = new Map<string, GroupMeta>();

  for (let i = 0; i < groupIds.length; i += chunkSize) {
    const chunk = groupIds.slice(i, i + chunkSize);
    const metas = await Promise.all(
      chunk.map((gid) => fetchGroupMetadata(gid)),
    );
    for (const m of metas) {
      if (m?.group_id) {
        groupMetaById.set(m.group_id, {
          group_id: m.group_id,
          access_members: m.access_members,
        });
      }
    }
    console.log(
      `  … metadata ${Math.min(i + chunkSize, groupIds.length)} / ${groupIds.length}`,
    );
  }

  /** phone variant → first group_id whose members list includes it */
  const variantToGroup = new Map<string, string>();
  for (const [, meta] of groupMetaById) {
    for (const raw of meta.access_members) {
      const k = normalizePhoneKey(raw);
      if (!k) continue;
      for (const v of chettoLookupKeyVariants(k)) {
        if (!variantToGroup.has(v)) variantToGroup.set(v, meta.group_id);
      }
    }
  }

  let skippedNoPhone = 0;
  let skippedNoMatch = 0;
  const proposed: { id: string; groupId: string }[] = [];

  for (const c of list) {
    const normalized = normalizePhoneKey(c.phone_number);
    if (!normalized) {
      skippedNoPhone += 1;
      continue;
    }
    const variants = new Set(chettoLookupKeyVariants(normalized));
    let matched: string | null = null;
    for (const v of variants) {
      const gid = variantToGroup.get(v);
      if (gid) {
        matched = gid;
        break;
      }
    }
    if (!matched) {
      skippedNoMatch += 1;
      continue;
    }
    proposed.push({ id: c.id, groupId: matched });
  }

  const byGroup = new Map<string, string[]>();
  for (const p of proposed) {
    const arr = byGroup.get(p.groupId) ?? [];
    arr.push(p.id);
    byGroup.set(p.groupId, arr);
  }
  const collisions = [...byGroup.entries()].filter(([, ids]) => ids.length > 1);

  let updated = 0;
  if (dryRun) {
    for (const p of proposed) {
      console.log(`[dry-run] ${p.id} → ${p.groupId}`);
    }
  } else {
    for (const p of proposed) {
      const { error: uErr } = await supabase
        .from("clients")
        .update({ chetto_group_id: p.groupId })
        .eq("id", p.id);
      if (uErr) {
        console.error(`Update failed ${p.id}:`, uErr.message);
      } else {
        updated += 1;
      }
    }
  }

  console.log("\n========== SUMMARY ==========");
  console.log(
    `  ${dryRun ? "Would update" : "Updated"}: ${dryRun ? proposed.length : updated}`,
  );
  console.log(`  Skipped (no phone): ${skippedNoPhone}`);
  console.log(`  Skipped (no Chetto match): ${skippedNoMatch}`);
  if (collisions.length > 0) {
    console.log(
      `\n  Same Chetto group linked to multiple clients: ${collisions.length} group(s) — often OK (household) or review if wrong.`,
    );
    const show = collisions.slice(0, 15);
    for (const [gid, ids] of show) {
      console.log(
        `    ${gid}  ←  ${ids.length} clients  ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? " …" : ""}`,
      );
    }
    if (collisions.length > show.length) {
      console.log(`    … and ${collisions.length - show.length} more`);
    }
  }
  console.log("=============================\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
