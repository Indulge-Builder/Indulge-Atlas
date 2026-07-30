/**
 * Extract Chetto timelines into member-data folders that have profile.txt
 * (Atlas client id) but no real chetto.txt yet.
 *
 *   npx tsx scripts/extract-chetto-for-member-profiles.ts --dry-run
 *   npx tsx scripts/extract-chetto-for-member-profiles.ts --resume
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { getGroupTimeline } from "../lib/actions/chetto";
import { formatChettoMessagesText } from "./lib/export-formatters";

const OUTPUT = "exports/member-data-2026-07-03";
const CLIENT_DELAY_MS = 1200;
const PAGE_DELAY_MS = 200;

function applyEnv(filePath: string): void {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

function parseProfile(dir: string): {
  clientId: string | null;
  name: string;
  queendom: string | null;
} {
  const p = path.join(dir, "profile.txt");
  const text = fs.readFileSync(p, "utf8");
  const clientId =
    (text.match(/^Client ID:\s*([0-9a-f-]{36})$/im) || [])[1]?.trim() ?? null;
  const fn = (text.match(/^First name:\s*(.+)$/m) || [])[1]?.trim();
  const ln = (text.match(/^Last name:\s*(.+)$/m) || [])[1]?.trim();
  const name =
    (fn ? [fn, ln].filter(Boolean).join(" ") : null) ||
    (text.match(/^Atlas Profile Export — (.+)$/m) || [])[1]?.trim() ||
    path.basename(dir);
  const queendom =
    (text.match(/^Queendom:\s*(.+)$/m) || [])[1]?.trim() || null;
  return { clientId, name, queendom };
}

async function fetchText(
  groupId: string,
  groupName: string | null,
  queendom: string | null,
): Promise<{ text: string; messages: number }> {
  const all = [];
  let cursor: string | null = null;
  let timelineNotAvailable = false;
  while (true) {
    const page = await getGroupTimeline(groupId, 200, cursor ?? undefined, {
      queendom: queendom?.trim() || undefined,
    });
    if (page.timelineNotAvailable) {
      timelineNotAvailable = true;
      if (!all.length) break;
    }
    all.push(...page.messages);
    cursor =
      typeof page.nextCursor === "string" && page.nextCursor.length > 0
        ? page.nextCursor
        : null;
    if (!cursor) break;
    await sleep(PAGE_DELAY_MS);
  }
  if (timelineNotAvailable && all.length === 0) {
    return {
      text: "Chetto timeline not available for this group.\n",
      messages: 0,
    };
  }
  return {
    text: formatChettoMessagesText(all, {
      groupId,
      groupName: groupName ?? undefined,
    }),
    messages: all.length,
  };
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env"));
  applyEnv(path.join(process.cwd(), ".env.local"));

  const dryRun = process.argv.includes("--dry-run");
  const resume = process.argv.includes("--resume");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase env");
  if (!process.env.CHETTO_API_KEY?.trim()) {
    throw new Error("Missing CHETTO_API_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const outAbs = path.resolve(OUTPUT);
  const dirs = fs
    .readdirSync(outAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"));

  type Target = {
    folder: string;
    clientId: string;
    name: string;
    queendom: string | null;
  };
  const targets: Target[] = [];

  for (const d of dirs) {
    const dir = path.join(outAbs, d.name);
    const profilePath = path.join(dir, "profile.txt");
    if (!fs.existsSync(profilePath)) continue;
    const chettoPath = path.join(dir, "chetto.txt");
    if (
      resume &&
      fs.existsSync(chettoPath) &&
      isRealChetto(fs.readFileSync(chettoPath, "utf8"))
    ) {
      continue;
    }
    const { clientId, name, queendom } = parseProfile(dir);
    if (!clientId) continue;
    targets.push({ folder: d.name, clientId, name, queendom });
  }

  const slice =
    limit != null && limit > 0 ? targets.slice(0, limit) : targets;
  console.log(
    `Extract Chetto for profile folders — ${slice.length}/${targets.length}` +
      (dryRun ? " (dry-run)" : ""),
  );

  // Batch fetch Atlas chetto_group_id
  const ids = slice.map((t) => t.clientId);
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, chetto_group_id, queendom")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const byId = new Map(
    (clients ?? []).map((c) => [
      c.id as string,
      {
        groupId: ((c.chetto_group_id as string) || "").trim() || null,
        queendom: (c.queendom as string | null) ?? null,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      },
    ]),
  );

  // Optional group name map
  const nameById = new Map<string, string>();
  for (const rel of [
    "scripts/chetto-live-groups.json",
    "scripts/chetto-all-group-ids-with-names.json",
  ]) {
    if (!fs.existsSync(rel)) continue;
    const raw = JSON.parse(fs.readFileSync(rel, "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.groups ?? [];
    for (const g of arr) {
      if (g.group_id && g.group_name) nameById.set(g.group_id, g.group_name);
    }
  }

  let written = 0;
  let noGroup = 0;
  let failed = 0;
  let zero = 0;
  const results = [];

  for (let i = 0; i < slice.length; i++) {
    const t = slice[i];
    const atlas = byId.get(t.clientId);
    const groupId = atlas?.groupId ?? null;
    const queendom = atlas?.queendom ?? t.queendom;
    const groupName = groupId ? nameById.get(groupId) ?? null : null;

    process.stdout.write(
      `[${i + 1}/${slice.length}] ${t.folder} — "${t.name}" … `,
    );

    if (!groupId) {
      console.log("no chetto_group_id");
      noGroup++;
      results.push({
        folder: t.folder,
        name: t.name,
        status: "no-group",
      });
      continue;
    }

    if (dryRun) {
      console.log(`dry-run → ${groupName || groupId}`);
      results.push({
        folder: t.folder,
        name: t.name,
        status: "dry-run",
        groupId,
        groupName,
      });
      continue;
    }

    try {
      const { text, messages } = await fetchText(groupId, groupName, queendom);
      fs.writeFileSync(path.join(outAbs, t.folder, "chetto.txt"), text, "utf8");
      if (messages === 0) {
        console.log(`written 0 msgs (${groupName || groupId})`);
        zero++;
      } else {
        console.log(`written ${messages} msgs (${groupName || groupId})`);
        written++;
      }
      results.push({
        folder: t.folder,
        name: t.name,
        status: messages > 0 ? "written" : "empty",
        groupId,
        groupName,
        messages,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAILED — ${msg}`);
      failed++;
      results.push({
        folder: t.folder,
        name: t.name,
        status: "failed",
        groupId,
        detail: msg,
      });
    }
    await sleep(CLIENT_DELAY_MS);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun,
    targets: slice.length,
    written,
    empty: zero,
    noGroup,
    failed,
    results,
  };
  fs.writeFileSync(
    path.join(outAbs, "_chetto-extract-profiles-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ written, empty: zero, noGroup, failed }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
