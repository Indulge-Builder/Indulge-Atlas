/** Phone-match remaining unmapped clients from metadata cache. */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import {
  buildChettoMappingIndex,
  chettoPhoneLookupVariants,
  type ChettoGroup,
} from "../lib/actions/chetto";

function applyEnv(f: string) {
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[t.slice(0, eq).trim()] = v;
  }
}

async function main() {
  applyEnv(path.join(process.cwd(), ".env.local"));
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts/chetto-metadata-cache.json"), "utf8"),
  ) as { loaded: Record<string, ChettoGroup> };
  const groups = Object.values(cache.loaded ?? {});
  const index = buildChettoMappingIndex(groups);
  const names = new Map(groups.map((g) => [g.group_id, g.group_name]));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const dryRun = process.argv.includes("--dry-run");
  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number")
    .is("chetto_group_id", null);

  let updated = 0;
  for (const c of clients ?? []) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    let gid: string | undefined;
    for (const v of chettoPhoneLookupVariants(c.phone_number as string)) {
      const hit = index.byPhone.get(v);
      if (hit) {
        gid = hit;
        break;
      }
    }
    if (!gid) continue;
    console.log(`${name} → ${gid} "${names.get(gid)}" (phone)`);
    if (!dryRun) {
      const { error } = await supabase
        .from("clients")
        .update({ chetto_group_id: gid })
        .eq("id", c.id)
        .is("chetto_group_id", null);
      if (!error) updated++;
    } else updated++;
  }
  console.log(`\n${dryRun ? "Would update" : "Updated"}: ${updated}`);
}

main().catch(console.error);
