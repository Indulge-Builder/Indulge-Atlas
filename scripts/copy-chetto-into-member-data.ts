/**
 * Copy real chetto.txt from client-data / unified into member-data by name+phone match.
 */
import * as fs from "fs";
import * as path from "path";

const MEMBER = "exports/member-data-2026-07-03";
const SOURCES = [
  "exports/client-data-2026-07-03",
  "exports/unified-client-data-2026-07-03",
];

function isRealChetto(text: string): boolean {
  if (
    text.startsWith("No Chetto") ||
    text.startsWith("Chetto timeline not available") ||
    text.startsWith("No Chetto group linked")
  ) {
    return false;
  }
  return (
    text.split(/\n/).length > 5 &&
    (text.includes("Group ID:") || text.includes("Messages:"))
  );
}

function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\b(mr|ms|mrs|dr|and|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKey(s: string): string {
  return normName(s).replace(/\s+/g, "");
}

function phoneKeys(raw: string): string[] {
  const d = digits(raw);
  if (d.length < 8) return [];
  const out = new Set<string>([d]);
  if (d.length === 10) out.add("91" + d);
  if (d.startsWith("91") && d.length === 12) out.add(d.slice(2));
  out.add(d.slice(-10));
  return [...out];
}

function readIdentity(dir: string): { name: string; phones: string[] } {
  const phones: string[] = [];
  let name = "";
  for (const file of ["freshdesk.txt", "profile.txt", "chetto.txt"]) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (!name) {
      name =
        (text.match(/^Name:\s*(.+)$/m) || [])[1]?.trim() ||
        (text.match(/^Freshdesk Export — (.+)$/m) || [])[1]?.trim() ||
        (text.match(/^Atlas Profile Export — (.+)$/m) || [])[1]?.trim() ||
        "";
      const fn = (text.match(/^First name:\s*(.+)$/m) || [])[1]?.trim();
      const ln = (text.match(/^Last name:\s*(.+)$/m) || [])[1]?.trim();
      if (fn) name = [fn, ln].filter(Boolean).join(" ");
    }
    for (const label of ["Phone", "Mobile"]) {
      const v = (text.match(new RegExp(`^${label}:\\s*(.+)$`, "m")) || [])[1]
        ?.trim();
      if (v && v !== "—") phones.push(...phoneKeys(v));
    }
  }
  if (!name) {
    name = path
      .basename(dir)
      .replace(/_[0-9a-f]{8}$/i, "")
      .replace(/_\d{10,}$/, "")
      .replace(/_/g, " ");
  }
  return { name, phones: [...new Set(phones)] };
}

type Src = { folder: string; path: string; name: string; nameKey: string; phones: string[]; lines: number };

function indexSource(srcRoot: string): Src[] {
  if (!fs.existsSync(srcRoot)) return [];
  const out: Src[] = [];
  for (const d of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const chetto = path.join(srcRoot, d.name, "chetto.txt");
    if (!fs.existsSync(chetto)) continue;
    const text = fs.readFileSync(chetto, "utf8");
    if (!isRealChetto(text)) continue;
    const id = readIdentity(path.join(srcRoot, d.name));
    out.push({
      folder: d.name,
      path: chetto,
      name: id.name,
      nameKey: nameKey(id.name),
      phones: id.phones,
      lines: text.split(/\n/).length,
    });
  }
  return out;
}

const dryRun = process.argv.includes("--dry-run");
const sources = SOURCES.flatMap(indexSource);
console.log(`Source chetto files: ${sources.length}`);

const byPhone = new Map<string, Src[]>();
const byName = new Map<string, Src[]>();
for (const s of sources) {
  for (const p of s.phones) {
    const arr = byPhone.get(p) ?? [];
    arr.push(s);
    byPhone.set(p, arr);
  }
  if (s.nameKey.length >= 4) {
    const arr = byName.get(s.nameKey) ?? [];
    arr.push(s);
    byName.set(s.nameKey, arr);
  }
}

const memberDirs = fs
  .readdirSync(MEMBER, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"));

let copied = 0;
let skippedHas = 0;
let unmatched = 0;
const results: Array<Record<string, unknown>> = [];

for (const d of memberDirs) {
  const dir = path.join(MEMBER, d.name);
  const dest = path.join(dir, "chetto.txt");
  if (fs.existsSync(dest) && isRealChetto(fs.readFileSync(dest, "utf8"))) {
    skippedHas++;
    continue;
  }

  const id = readIdentity(dir);
  const nk = nameKey(id.name);
  let hit: Src | null = null;
  let method = "";

  for (const p of id.phones) {
    const cands = byPhone.get(p) ?? [];
    if (cands.length === 1) {
      hit = cands[0];
      method = "phone";
      break;
    }
    if (cands.length > 1 && nk.length >= 4) {
      const named = cands.filter(
        (c) => c.nameKey === nk || c.nameKey.includes(nk),
      );
      if (named.length === 1) {
        hit = named[0];
        method = "phone+name";
        break;
      }
    }
  }

  if (!hit && nk.length >= 5) {
    const cands = byName.get(nk) ?? [];
    if (cands.length === 1) {
      hit = cands[0];
      method = "name";
    } else if (cands.length > 1) {
      // pick richest
      hit = [...cands].sort((a, b) => b.lines - a.lines)[0];
      method = "name_richest";
    }
  }

  if (!hit) {
    unmatched++;
    results.push({ folder: d.name, name: id.name, status: "unmatched" });
    continue;
  }

  if (dryRun) {
    console.log(`dry-run ${d.name} ← ${hit.folder} [${method}] (${hit.lines} lines)`);
    results.push({
      folder: d.name,
      name: id.name,
      status: "dry-run",
      from: hit.folder,
      method,
      lines: hit.lines,
    });
    copied++;
    continue;
  }

  fs.copyFileSync(hit.path, dest);
  console.log(`copied ${d.name} ← ${hit.folder} [${method}] (${hit.lines} lines)`);
  results.push({
    folder: d.name,
    name: id.name,
    status: "copied",
    from: hit.folder,
    method,
    lines: hit.lines,
  });
  copied++;
}

const summary = {
  dryRun,
  sourceFiles: sources.length,
  copied,
  skippedHas,
  unmatched,
  results,
};
fs.writeFileSync(
  path.join(MEMBER, "_chetto-copy-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify(
    { copied, skippedHas, unmatched, totalMember: memberDirs.length },
    null,
    2,
  ),
);
