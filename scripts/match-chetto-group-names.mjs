/**
 * Match Chetto group_ids → group_name (+ queendom) via GET /v1/groups and metadata cache.
 *
 * Usage:
 *   node scripts/match-chetto-group-names.mjs
 *   node scripts/match-chetto-group-names.mjs --input scripts/chetto-all-group-ids.json
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputArg = process.argv.find((a) => a.startsWith("--input="));
const inputPath = inputArg
  ? resolve(root, inputArg.slice("--input=".length))
  : resolve(root, "scripts/chetto-old-514-group-ids.json");

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

function stripConcierge(name) {
  if (!name) return null;
  return name.replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim() || name;
}

function atlasQueendom(orgName) {
  if (!orgName) return null;
  if (orgName.includes("Anishqa")) return "Anishqa Queendom";
  if (orgName.includes("Ananyshree")) return "Ananyshree Queendom";
  if (orgName.toLowerCase().includes("unassigned")) return "Unassigned";
  if (orgName.includes("Default")) return "Indulge Global Default";
  return orgName;
}

applyEnv(resolve(root, ".env.local"));
const key = process.env.CHETTO_API_KEY?.trim();
const parentOrgId = process.env.CHETTO_ORG_ID?.trim();
if (!key || !parentOrgId) {
  console.error("CHETTO_API_KEY and CHETTO_ORG_ID required in .env.local");
  process.exit(1);
}

const source = JSON.parse(readFileSync(inputPath, "utf8"));
const targetIds = source.group_ids ?? source;
if (!Array.isArray(targetIds)) {
  console.error("Input must have group_ids array");
  process.exit(1);
}

// Org tree → group_id → queendom
const orgRes = await fetch("https://apiv2.chetto.ai/joule/v1/organizations/", {
  headers: { "x-api-key": key },
});
const orgs = await orgRes.json();
const parent = orgs[0];
const queendomByGroupId = new Map();
for (const sub of parent.sub_orgs ?? []) {
  const q = atlasQueendom(sub.org_name);
  for (const gid of sub.group_ids ?? []) {
    if (typeof gid === "string") queendomByGroupId.set(gid, q);
  }
}

// Metadata cache names (partial)
const nameById = new Map();
const cachePath = resolve(root, "scripts/chetto-metadata-cache.json");
if (existsSync(cachePath)) {
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  for (const g of Object.values(cache.loaded ?? {})) {
    if (g?.group_id && g.group_name) {
      nameById.set(g.group_id, g.group_name);
    }
  }
}

// GET /v1/groups?org_id=parent — bulk names
const groupsRes = await fetch(
  `https://apiv2.chetto.ai/joule/v1/groups?${new URLSearchParams({ org_id: parentOrgId })}`,
  { headers: { "x-api-key": key } },
);
const groupsJson = await groupsRes.json();
const list = Array.isArray(groupsJson) ? groupsJson : [];
for (const g of list) {
  if (g?.group_id && g.group_name) {
    nameById.set(g.group_id, g.group_name);
  }
}

// Fetch missing names individually (rate-limit friendly)
const missing = targetIds.filter((id) => !nameById.has(id));
let fetched = 0;
for (const id of missing) {
  await new Promise((r) => setTimeout(r, 1100));
  try {
    const r = await fetch(
      `https://apiv2.chetto.ai/joule/v1/groups/${encodeURIComponent(id)}?${new URLSearchParams({ org_id: parentOrgId })}`,
      { headers: { "x-api-key": key } },
    );
    if (r.ok) {
      const g = await r.json();
      if (g?.group_id && g.group_name) {
        nameById.set(g.group_id, g.group_name);
        fetched += 1;
      }
    }
  } catch {
    /* skip */
  }
  if (fetched % 5 === 0 && fetched > 0) {
    console.log(`  … fetched ${fetched} / ${missing.length} missing names`);
  }
}

const groups = targetIds.map((group_id) => {
  const rawName = nameById.get(group_id) ?? null;
  return {
    group_id,
    group_name: rawName,
    display_name: stripConcierge(rawName),
    queendom: queendomByGroupId.get(group_id) ?? null,
  };
});

const withNames = groups.filter((g) => g.group_name);
const outBase = inputPath.replace(/\.json$/i, "");

const jsonOut = {
  count: groups.length,
  with_names: withNames.length,
  without_names: groups.length - withNames.length,
  groups,
};

writeFileSync(`${outBase}-with-names.json`, JSON.stringify(jsonOut, null, 2));

const csvLines = [
  "group_id,group_name,display_name,queendom",
  ...groups.map((g) =>
    [
      g.group_id,
      csvEscape(g.group_name ?? ""),
      csvEscape(g.display_name ?? ""),
      csvEscape(g.queendom ?? ""),
    ].join(","),
  ),
];
writeFileSync(`${outBase}-with-names.csv`, csvLines.join("\n") + "\n");

console.log(
  JSON.stringify(
    {
      input: inputPath,
      json: `${outBase}-with-names.json`,
      csv: `${outBase}-with-names.csv`,
      total: groups.length,
      with_names: withNames.length,
      without_names: groups.length - withNames.length,
      individually_fetched: fetched,
    },
    null,
    2,
  ),
);

function csvEscape(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
