import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const live = JSON.parse(
  readFileSync(resolve(root, "scripts/chetto-all-group-ids.json"), "utf8"),
);

const chetto = readFileSync(resolve(root, "lib/actions/chetto.ts"), "utf8");
const staticIds = [...new Set([...chetto.matchAll(/"(120363\d+)"/g)].map((m) => m[1]))];

// Fetch default org group_ids from live export metadata — re-fetch org for default list
import { existsSync } from "fs";
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
const res = await fetch("https://apiv2.chetto.ai/joule/v1/organizations/", {
  headers: { "x-api-key": key },
});
const orgs = await res.json();
const parent = orgs[0];

const defaultOrg = parent.sub_orgs.find(
  (s) => s.org_name === "Indulge Global Default",
);
const defaultIds = new Set(defaultOrg?.group_ids ?? []);

const liveSet = new Set(live.group_ids);
const clientOnly = [...liveSet].filter((id) => !defaultIds.has(id));

const staticOnly = staticIds.filter((id) => !liveSet.has(id));
const old514Candidate = new Set([...clientOnly, ...staticOnly]);

console.log({
  live: liveSet.size,
  default: defaultIds.size,
  clientOnly: clientOnly.length,
  staticOnly: staticOnly.length,
  old514Candidate: old514Candidate.size,
});

// Historical note: 214+212+88=514 was raw sub-org sum before Jul 2026 refresh
const out = {
  note:
    "Reconstructed 'old ~514' export: client queendoms (live, no Global Default) ∪ 6 static-only IDs. Historical Chetto sub-org sum was 214+212+88=514.",
  count: old514Candidate.size,
  group_ids: [...old514Candidate].sort(),
};

writeFileSync(
  resolve(root, "scripts/chetto-old-514-group-ids.json"),
  JSON.stringify(out, null, 2),
);
console.log("Wrote scripts/chetto-old-514-group-ids.json", out.count);
