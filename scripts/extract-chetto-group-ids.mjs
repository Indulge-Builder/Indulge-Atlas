import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function applyEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, eq).trim()] = v;
  }
}

applyEnv(resolve(root, ".env.local"));

const key = process.env.CHETTO_API_KEY?.trim();
if (!key) {
  console.error("CHETTO_API_KEY missing");
  process.exit(1);
}

const res = await fetch("https://apiv2.chetto.ai/joule/v1/organizations/", {
  headers: { "x-api-key": key },
});
const orgs = await res.json();
const parent = orgs[0];
const byQueendom = {};
const all = new Set();

for (const sub of parent.sub_orgs ?? []) {
  const ids = (sub.group_ids ?? []).filter((x) => typeof x === "string");
  byQueendom[sub.org_name] = { org_id: sub.org_id, count: ids.length, group_ids: ids };
  for (const id of ids) all.add(id);
}

const out = {
  total_unique: all.size,
  parent_org_id: parent.org_id,
  by_sub_org: Object.fromEntries(
    Object.entries(byQueendom).map(([name, v]) => [
      name,
      { org_id: v.org_id, count: v.count },
    ]),
  ),
  group_ids: [...all].sort(),
};

const outPath = resolve(root, "scripts/chetto-all-group-ids.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ outPath, ...out.by_sub_org, total_unique: out.total_unique }, null, 2));
