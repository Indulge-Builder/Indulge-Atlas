import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
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
applyEnv(resolve(root, ".env"));

const report = JSON.parse(
  readFileSync(resolve(root, "scripts/chetto-export-mapping-report.json"), "utf8"),
);
const ids = report.unmatched.map((u) => u.id);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: clients, error } = await supabase
  .from("clients")
  .select("id, first_name, last_name, phone_number, queendom, chetto_group_id, client_status, membership_type")
  .in("id", ids)
  .order("first_name");

if (error) throw error;

const byId = new Map((clients ?? []).map((c) => [c.id, c]));
const rows = report.unmatched.map((u) => {
  const c = byId.get(u.id);
  const name =
    c?.first_name && c?.last_name
      ? `${c.first_name} ${c.last_name}`.trim()
      : c?.first_name ?? u.name;
  return {
    client_id: u.id,
    name,
    phone: c?.phone_number ?? "",
    queendom: u.queendom ?? c?.queendom ?? "",
    status: c?.client_status ?? "",
    membership: c?.membership_type ?? "",
    reason: u.reason,
    atlas_url: `/clients/${u.id}`,
  };
});

rows.sort((a, b) => a.name.localeCompare(b.name));

const csvHeader =
  "client_id,name,phone,queendom,status,membership,reason,atlas_url\n";
const csvBody = rows
  .map((r) =>
    [
      r.client_id,
      `"${r.name.replace(/"/g, '""')}"`,
      r.phone,
      `"${r.queendom}"`,
      r.status,
      r.membership,
      r.reason,
      r.atlas_url,
    ].join(","),
  )
  .join("\n");

const outJson = resolve(root, "scripts/chetto-unmapped-92.json");
const outCsv = resolve(root, "scripts/chetto-unmapped-92.csv");
writeFileSync(outJson, JSON.stringify({ count: rows.length, clients: rows }, null, 2));
writeFileSync(outCsv, csvHeader + csvBody);

const byQueendom = {};
for (const r of rows) {
  byQueendom[r.queendom] = (byQueendom[r.queendom] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      count: rows.length,
      byQueendom,
      json: outJson,
      csv: outCsv,
    },
    null,
    2,
  ),
);
