/**
 * Direct DB update: unique single-hit name matches for unmapped clients.
 *   npx tsx scripts/apply-single-hit-mappings.ts --dry-run
 *   npx tsx scripts/apply-single-hit-mappings.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

type ExportGroup = {
  group_id: string;
  group_name: string | null;
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

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitle(n: string): string {
  return norm(n)
    .replace(/\s*(?:pre )?concierge\s*$/i, "")
    .trim();
}

function nameParts(fullName: string): string[] {
  const out: string[] = [];
  const paren = fullName.match(/\(([^)]+)\)/);
  if (paren?.[1]) out.push(stripTitle(paren[1]));

  const base = stripTitle(fullName.replace(/\([^)]*\)/g, " "));
  out.push(base);

  if (base.includes(" and ")) {
    for (const seg of base.split(" and ")) {
      const s = stripTitle(seg);
      if (s.length >= 4) out.push(s);
    }
  }
  if (base.includes("&")) {
    for (const seg of base.split("&")) {
      const s = stripTitle(seg);
      if (s.length >= 4) out.push(s);
    }
  }

  for (const t of base.split(" ").filter((x) => x.length >= 4)) {
    out.push(t);
  }

  return [...new Set(out.filter((x) => x.length >= 4))];
}

/** Hand-curated high-confidence mappings (alias / spelling / couple names). */
const MANUAL: Record<string, string> = {
  "b1a4e02f-3599-4018-b174-d2065b002d48": "120363425009648058", // Adhiraj → Swarup Family
  "6421f7c6-dde2-44ec-97df-e7f11b5bae2b": "120363368173427025", // Ramakrishna B K
  "d5e39c7e-a07d-4c31-8b84-bf6ce6d50556": "120363407711507275", // Aniket Bharadia
  "cf066ad6-8d6f-40d6-b908-721a86526592": "120363425405106980", // Chandershekhar Chaurasia
  "3cce1321-bd73-403a-8530-fbbfffcf5bb6": "120363044934903562", // Amit Sadana → Amit's Concierge
  "7829c2a5-d4de-4295-b162-2d9ce5ed2125": "120363406437481493", // Mahesh Deshpande
  "557d0621-58b1-4d48-9f9b-f6c8a7a6b088": "120363407245978188", // Kumar Manglam Singhania
  "7075e6d1-bb8e-4f78-a56e-b7bd7f9901dc": "120363040330354282", // Adarsh N R
};

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env"));
  applyEnvFile(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const groups = (
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "scripts/chetto-all-group-ids-with-names.json"),
        "utf8",
      ),
    ) as { groups: ExportGroup[] }
  ).groups;

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

  let updated = 0;
  const applied: { name: string; groupId: string; groupName: string }[] = [];

  for (const c of clients ?? []) {
    const clientId = c.id as string;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    let groupId: string | null = MANUAL[clientId] ?? null;

    if (!groupId) {
      const queendom = c.queendom as string | null;
      const scoped = groups.filter((g) => !queendom || g.queendom === queendom);
      const pool = scoped.length > 0 ? scoped : groups;
      const hits = new Map<string, ExportGroup>();

      for (const part of nameParts(name)) {
        for (const gr of pool) {
          const gn = stripTitle(gr.group_name ?? "");
          if (!gn || gn.length < 3) continue;
          if (gn.includes(part) || (part.length >= 6 && part.includes(gn))) {
            hits.set(gr.group_id, gr);
          }
        }
      }

      if (hits.size === 1) {
        groupId = [...hits.keys()][0]!;
      }
    }

    if (!groupId) continue;
    const group = byId.get(groupId);
    if (!group?.group_name) continue;

    console.log(`${name} → ${groupId} "${group.group_name}"`);
    applied.push({ name, groupId, groupName: group.group_name });

    if (!dryRun) {
      const { error: uErr } = await supabase
        .from("clients")
        .update({ chetto_group_id: groupId })
        .eq("id", clientId)
        .is("chetto_group_id", null);
      if (uErr) console.error(`  Failed: ${uErr.message}`);
      else updated += 1;
    }
  }

  console.log(`\n${dryRun ? "Would update" : "Updated"}: ${dryRun ? applied.length : updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
