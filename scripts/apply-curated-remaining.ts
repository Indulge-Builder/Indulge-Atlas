/**
 * Apply verified Chetto mappings for remaining unmapped clients (direct DB).
 * Rules: hand-curated map OR unique group where client's first name appears in title.
 *
 *   npx tsx scripts/apply-curated-remaining.ts --dry-run
 *   npx tsx scripts/apply-curated-remaining.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

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

type Group = { group_id: string; group_name: string | null; queendom: string | null };

function loadGroups(): Group[] {
  const byId = new Map<string, Group>();
  for (const rel of [
    "scripts/chetto-all-group-ids-with-names.json",
    "scripts/chetto-old-514-group-ids-with-names.json",
  ]) {
    const file = path.join(process.cwd(), rel);
    if (!fs.existsSync(file)) continue;
    const src = JSON.parse(fs.readFileSync(file, "utf8")) as { groups: Group[] };
    for (const g of src.groups ?? []) {
      if (g.group_id && g.group_name) byId.set(g.group_id, g);
    }
  }
  return [...byId.values()];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripConcierge(name: string): string {
  return norm(name).replace(/\s*(?:pre )?concierge\s*$/i, "").trim();
}

function parseFirstLast(fullName: string): { first: string; last: string; alias: string | null } {
  const aliasMatch = fullName.match(/\(([^)]+)\)/);
  const alias = aliasMatch?.[1]?.replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim() ?? null;
  const base = fullName.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const cleaned = base.replace(/^mr\.?\s+|^ms\.?\s+|^dr\.?\s+/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return {
    first: parts[0]?.toLowerCase() ?? "",
    last: parts.slice(1).join(" ").toLowerCase(),
    alias: alias ? alias.toLowerCase() : null,
  };
}

/** Verified client_id → group_id (first name / alias clearly matches group title). */
const CURATED: Record<string, string> = {
  "72a3d397-2a2f-4ba0-b361-761f4e664b1c": "120363427989602570", // Manushi Chillar
  "f2d3e3e8-e00c-43ca-8784-41cf748705c0": "120363412082315545", // Ashish Singhania → Aashish
  "ae085ed9-4a1a-4616-810e-9057d4d87898": "120363424164475345", // Arpit Parakh → Arpit's
  "8837cab7-79de-4d59-8efd-50639e09e26b": "120363402701536997", // Vaibhav Goyal → Vaibhav's
  "98b8168a-0621-484f-af29-e3bf42c4d99e": "120363422390499285", // Sailesh → Shailesh Dalmia
  "0a7aed2e-07dc-45c7-9a65-2104f667574b": "120363406352372886", // Mansi Dixit (Gunjesh Jain)
  "6421f7c6-dde2-44ec-97df-e7f11b5bae2b": "120363368173427025", // Ramakrishna B K
  "d5e39c7e-a07d-4c31-8b84-bf6ce6d50556": "120363407711507275", // Aniket Bharadia
  "cf066ad6-8d6f-40d6-b908-721a86526592": "120363425405106980", // Chandershekhar Chaurasia
  "b1a4e02f-3599-4018-b174-d2065b002d48": "120363425009648058", // Adhiraj → Swarup Family
  "caf34ecc-3c1b-419d-ab45-372dbf5618e4": "120363424031427269", // Karan Chopra (Chopra's)
  "5208ec13-c6fa-4128-829f-2ee7455ff8ea": "120363423516466522", // Karan Chopra Personal
  "805c324e-8b61-4d5f-a2f4-b30a434894ff": "120363160881280576", // Lakshay & Alia
  "962a1d88-9817-4c87-bc6c-05c3dcf0c137": "120363207182579235", // Nikhil Verma and Shaila
  "c0c15cc7-096b-4294-88c8-e35a0629ed86": "120363423449576478", // George → George & Sanjitha
  "9eff3e01-b659-4733-a289-248315115257": "120363423215701465", // Samir & Sonal
  "d5dbfc89-6f5b-477f-a8b1-a12e74a4454b": "120363042994189815", // Aprameya & Parinita
};

function findUniqueFirstNameMatch(
  fullName: string,
  queendom: string | null,
  groups: Group[],
): Group | null {
  const { first, last, alias } = parseFirstLast(fullName);
  const pool = groups.filter((g) => !queendom || g.queendom === queendom || !g.queendom);
  const scoped = pool.filter((g) => g.queendom === queendom);
  const searchIn = scoped.length > 0 ? scoped : pool;

  const hits: Group[] = [];
  for (const g of searchIn) {
    const title = stripConcierge(g.group_name ?? "");
    if (!title) continue;

    const aliasHit =
      alias &&
      alias.length >= 4 &&
      (title.includes(alias) ||
        alias.split(/\s+/).some((t) => t.length >= 4 && title.includes(t)));
    const fullHit =
      last.length >= 3 && title.includes(`${first} ${last}`.trim());
    const lastHit = last.length >= 4 && title.includes(last);
    const firstOnlyOk = first.length >= 4 && title.includes(first) && last.length < 3;
    const firstHit = firstOnlyOk || (first.length >= 4 && title.includes(first) && lastHit);

    if (fullHit || aliasHit || firstHit) {
      hits.push(g);
    }
  }

  const unique = [...new Map(hits.map((g) => [g.group_id, g])).values()];
  return unique.length === 1 ? unique[0]! : null;
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const groups = loadGroups();
  const byId = new Map(groups.map((g) => [g.group_id, g]));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, queendom")
    .is("chetto_group_id", null)
    .order("first_name");

  if (error) throw error;

  const usedGroups = new Set<string>();
  let updated = 0;
  const applied: object[] = [];
  const skipped: object[] = [];

  for (const c of clients ?? []) {
    const id = c.id as string;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const queendom = (c.queendom as string | null) ?? null;

    let groupId = CURATED[id] ?? null;
    let method = groupId ? "curated" : "";

    if (!groupId) {
      const hit = findUniqueFirstNameMatch(name, queendom, groups);
      if (hit) {
        groupId = hit.group_id;
        method = "first_name_unique";
      }
    }

    if (!groupId) {
      skipped.push({ id, name, queendom });
      continue;
    }

    if (usedGroups.has(groupId)) {
      skipped.push({ id, name, reason: "group_already_used", groupId });
      continue;
    }

    const g = byId.get(groupId);
    console.log(`${name} → ${groupId} "${g?.group_name}" (${method})`);

    if (!dryRun) {
      const { error: uErr } = await supabase
        .from("clients")
        .update({ chetto_group_id: groupId })
        .eq("id", id)
        .is("chetto_group_id", null);
      if (uErr) {
        console.error(`  Failed: ${uErr.message}`);
        continue;
      }
    }

    usedGroups.add(groupId);
    updated += 1;
    applied.push({ id, name, groupId, groupName: g?.group_name, method });
  }

  fs.writeFileSync(
    path.join(process.cwd(), "scripts/chetto-final-apply-report.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), dryRun, updated, applied, skipped },
      null,
      2,
    ),
  );

  console.log(`\n${dryRun ? "Would update" : "Updated"}: ${updated}`);
  console.log(`Skipped (no safe match): ${skipped.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
