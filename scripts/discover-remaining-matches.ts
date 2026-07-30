/**
 * Discover Chetto group candidates for all unmapped clients.
 *   npx tsx scripts/discover-remaining-matches.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
  chettoPhoneLookupVariants,
  groupNameMatchKey,
  resolveChettoGroupIdFromIndex,
  type ChettoGroup,
} from "../lib/actions/chetto";

function applyEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

type ExportGroup = { group_id: string; group_name: string | null; queendom: string | null };

function loadGroups(): ExportGroup[] {
  const byId = new Map<string, ExportGroup>();
  for (const rel of [
    "scripts/chetto-all-group-ids-with-names.json",
    "scripts/chetto-old-514-group-ids-with-names.json",
  ]) {
    const file = path.join(process.cwd(), rel);
    if (!fs.existsSync(file)) continue;
    const src = JSON.parse(fs.readFileSync(file, "utf8")) as { groups: ExportGroup[] };
    for (const g of src.groups ?? []) {
      if (g.group_id && g.group_name) byId.set(g.group_id, g);
    }
  }
  return [...byId.values()];
}

function loadCacheGroups(): ChettoGroup[] {
  const file = path.join(process.cwd(), "scripts/chetto-metadata-cache.json");
  if (!fs.existsSync(file)) return [];
  const cache = JSON.parse(fs.readFileSync(file, "utf8")) as { loaded?: Record<string, ChettoGroup> };
  return Object.values(cache.loaded ?? {});
}

function parts(name: string): string[] {
  const out: string[] = [];
  const p = name.match(/\(([^)]+)\)/);
  if (p?.[1]) out.push(p[1].replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim());
  const base = name.replace(/\([^)]*\)/g, " ").replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
  out.push(base);
  if (base.includes("&")) base.split("&").forEach((s) => out.push(s.trim()));
  if (base.toLowerCase().includes(" and ")) base.split(/ and /i).forEach((s) => out.push(s.trim()));
  base.split(/\s+/).filter((t) => t.length >= 4).forEach((t) => out.push(t));
  return [...new Set(out.filter((x) => x.length >= 3))];
}

function firstToken(name: string): string {
  return name.replace(/^mr\.?\s+|^ms\.?\s+|^dr\.?\s+/i, "").split(/\s+/)[0]?.toLowerCase() ?? "";
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const groups = loadGroups();
  const cacheGroups = loadCacheGroups();
  const phoneIndex = buildChettoMappingIndex(cacheGroups);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, queendom")
    .is("chetto_group_id", null)
    .order("first_name");

  const results: object[] = [];

  for (const c of clients ?? []) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const queendom = c.queendom as string | null;
    const scoped = groups.filter((g) => !queendom || g.queendom === queendom);
    const pool = scoped.length ? scoped : groups;

    const candidates = new Map<string, { id: string; name: string; via: string }>();

    // Phone from cache
    for (const v of chettoPhoneLookupVariants((c.phone_number as string) ?? "")) {
      const gid = phoneIndex.byPhone.get(v);
      if (gid) {
        const g = groups.find((x) => x.group_id === gid);
        if (g?.group_name) candidates.set(gid, { id: gid, name: g.group_name, via: "phone" });
      }
    }

    // Name parts
    const cg = pool.map((g) => ({
      group_id: g.group_id,
      group_name: g.group_name,
      valid: true,
      created_at_utc: null,
      updated_at_utc: null,
      created_at: null,
      access_members: [] as string[],
    }));
    const index = buildChettoMappingIndex(cg);

    for (const part of parts(name)) {
      const tokens = part.replace(/^mr\.?\s+|^ms\.?\s+|^dr\.?\s+/i, "").split(/\s+/);
      const hit = resolveChettoGroupIdFromIndex(
        { phone: "", firstName: tokens[0] ?? part, lastName: tokens.slice(1).join(" ") || null },
        index,
        cg,
      );
      if (hit && hit.method !== "phone") {
        const g = pool.find((x) => x.group_id === hit.groupId);
        if (g?.group_name) candidates.set(hit.groupId, { id: hit.groupId, name: g.group_name, via: `name:${part}` });
      }
    }

    // First-name filter: keep only candidates where first name or alias appears in group title
    const ft = firstToken(name);
    const alias = name.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? "";
    const filtered = [...candidates.values()].filter((cand) => {
      const gn = cand.name.toLowerCase();
      if (cand.via === "phone") return true;
      if (alias.length >= 4 && gn.includes(alias.slice(0, Math.min(alias.length, 12)))) return true;
      if (ft.length >= 4 && gn.includes(ft)) return true;
      for (const part of parts(name)) {
        if (part.length >= 5 && gn.includes(part.toLowerCase().slice(0, 6))) return true;
      }
      return false;
    });

    results.push({
      id: c.id,
      name,
      queendom,
      phone: c.phone_number,
      candidates: filtered,
      candidateCount: filtered.length,
    });
  }

  const autoApply = results.filter(
    (r) => (r as { candidateCount: number }).candidateCount === 1,
  );
  const multi = results.filter(
    (r) => (r as { candidateCount: number }).candidateCount > 1,
  );
  const none = results.filter((r) => (r as { candidateCount: number }).candidateCount === 0);

  fs.writeFileSync(
    path.join(process.cwd(), "scripts/chetto-remaining-discovery.json"),
    JSON.stringify({ autoApply, multi, none, all: results }, null, 2),
  );

  console.log(`Single candidate: ${autoApply.length}`);
  console.log(`Multiple: ${multi.length}`);
  console.log(`None: ${none.length}`);
  for (const r of autoApply) {
    const x = r as { name: string; candidates: { id: string; name: string; via: string }[] };
    console.log(`${x.name} → ${x.candidates[0]!.id} (${x.candidates[0]!.via})`);
  }
}

main().catch(console.error);
