/**
 * Seed wa_client_groups from the existing Chetto mappings — VERIFIED ONLY.
 *
 * Prerequisite: apply supabase/migrations/119_wa_archive.sql
 *
 * Usage:
 *   npx tsx scripts/wa-seed-groups.ts --dry-run
 *   npx tsx scripts/wa-seed-groups.ts
 *
 * ── WHY THIS IS NOT A STRAIGHT COPY OF clients.chetto_group_id ───────────────
 *
 * `clients.chetto_group_id` is NOT a record of explicit human mappings. It was
 * populated substantially by NAME matching — the mapping tooling carries an explicit
 * `name_fuzzy` counter (scripts/chetto-export-mapping-report.json) and
 * scripts/discover-remaining-matches.ts tokenises names into first/last to match.
 *
 * The damage is visible in the data: 21 group ids are mapped to more than one client,
 * and the collisions are first-name collisions between DIFFERENT PEOPLE with different
 * phone numbers — "Vaibhav Anant / Vaibhav Vardhan / Vaibhav Goyal" on one group,
 * "Arpit Parakh / Arpit Agrawal / Arpit Goyal" on another, "Aakash Anand / Akash Mayur"
 * on a third. Surname matches did the same to families (Goel x4, Kedia x3, Bansal x3),
 * where only ONE member is actually in the group.
 *
 * Copying those into wa_client_groups.client_id would make a guess the authorization
 * anchor for the most sensitive data in Atlas, and a wrong one silently hands a
 * client's private conversation to another client's agent — invariant #3, violated on
 * day one, with no error to notice.
 *
 * ── THE VERIFIER ────────────────────────────────────────────────────────────
 *
 * Chetto group metadata carries `access_members`: the group's member phone numbers.
 * A mapping is CONFIRMED when the client's own phone is present in their group's member
 * list. That is a fact, not a guess.
 *
 * Presence proves membership; ABSENCE PROVES NOTHING — `access_members` is capped at 20
 * (the length distribution tops out at exactly 20 across 526 groups, 103 of them at
 * exactly 20, none above), so a real member can be truncated out of the list. Absence is
 * therefore treated as UNPROVEN, not as wrong: those groups are seeded with client_id
 * NULL and wait for a human, rather than being dropped or guessed.
 *
 * ── OUTCOME (as of writing) ─────────────────────────────────────────────────
 *   333 groups  exactly one phone-confirmed client -> client_id set
 *    43 groups  zero confirmed                     -> client_id NULL (quarantine)
 *     3 groups  multiple confirmed (duplicate client records) -> client_id NULL
 *
 * Re-runnable: inserts are ignore-on-conflict against the group_jid unique key, so this
 * never overwrites a mapping a human has since made or corrected. Clearing a quarantined
 * group is a human act performed in /clients/chetto-mapping, and this script must not
 * undo it.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

type ChettoGroup = {
  group_id: string;
  group_name: string;
  access_members?: string[];
};

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  chetto_group_id: string | null;
};

type SeedRow = {
  group_jid: string;
  group_name: string;
  client_id: string | null;
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
    if (!process.env[key]) process.env[key] = val;
  }
}

/**
 * Compare on the last 10 digits. Atlas stores E.164 but the Chetto member list is bare
 * digits with a country prefix, and client rows carry a mix of local and +country forms.
 * The last 10 is the stable overlap between the two.
 */
function last10(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

function fullName(c: ClientRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
}

async function main(): Promise<void> {
  applyEnvFile(path.join(process.cwd(), ".env.local"));
  const dryRun = process.argv.includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const supabase: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ── load Chetto group metadata (group name + member phones) ───────────────
  const groupsPath = path.join(process.cwd(), "scripts", "chetto-live-groups.json");
  if (!fs.existsSync(groupsPath)) throw new Error(`missing ${groupsPath}`);
  const chettoGroups = JSON.parse(fs.readFileSync(groupsPath, "utf8")) as ChettoGroup[];
  const byGroupId = new Map<string, ChettoGroup>();
  for (const g of chettoGroups) byGroupId.set(String(g.group_id).trim(), g);

  // ── load every client that carries a mapping attempt ──────────────────────
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number, chetto_group_id")
    .not("chetto_group_id", "is", null)
    .limit(2000);
  if (error) throw new Error(`clients read failed: ${error.message}`);

  const clientsByGroup = new Map<string, ClientRow[]>();
  for (const c of (clients ?? []) as ClientRow[]) {
    const gid = String(c.chetto_group_id).trim();
    const list = clientsByGroup.get(gid) ?? [];
    list.push(c);
    clientsByGroup.set(gid, list);
  }

  // ── verify each group against member phones ───────────────────────────────
  const rows: SeedRow[] = [];
  const quarantined: string[] = [];
  let confirmedCount = 0;
  let contestedCount = 0;
  let unprovenCount = 0;

  for (const [gid, candidates] of clientsByGroup) {
    const group = byGroupId.get(gid);
    const members = new Set((group?.access_members ?? []).map(last10));

    const confirmed = candidates.filter((c) => {
      const p = last10(c.phone_number);
      return p !== "" && members.has(p);
    });

    // group_jid is the FULL WhatsApp JID — what the listener sees on key.remoteJid.
    // clients.chetto_group_id stores the bare 18-digit user part (verified: all 407 are
    // bare numeric, none already carry a suffix).
    const groupJid = `${gid}@g.us`;
    const groupName = group?.group_name ?? `${fullName(candidates[0])} (unnamed)`;

    if (confirmed.length === 1) {
      confirmedCount++;
      rows.push({ group_jid: groupJid, group_name: groupName, client_id: confirmed[0].id });
      continue;
    }

    // Everything else lands UNMAPPED — visible to admins for triage, invisible to agents,
    // and never attached to a client on a guess.
    if (confirmed.length > 1) {
      contestedCount++;
      quarantined.push(`  contested  ${groupName} — ${confirmed.map(fullName).join(" + ")}`);
    } else {
      unprovenCount++;
      quarantined.push(`  unproven   ${groupName} — candidates: ${candidates.map(fullName).join(", ")}`);
    }
    rows.push({ group_jid: groupJid, group_name: groupName, client_id: null });
  }

  console.log("=== wa_client_groups seed ===");
  console.log(`clients with a mapping attempt : ${clients?.length ?? 0}`);
  console.log(`distinct groups                : ${clientsByGroup.size}`);
  console.log(`  phone-CONFIRMED -> client_id : ${confirmedCount}`);
  console.log(`  contested       -> NULL      : ${contestedCount}`);
  console.log(`  unproven        -> NULL      : ${unprovenCount}`);
  console.log(`total rows to upsert           : ${rows.length}`);
  console.log("\n--- quarantined (await an explicit human mapping) ---");
  for (const line of quarantined.slice(0, 15)) console.log(line);
  if (quarantined.length > 15) console.log(`  … and ${quarantined.length - 15} more`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written");
    return;
  }

  // ignoreDuplicates: a re-run must never clobber a mapping a human has since corrected.
  const { data: written, error: upsertError } = await supabase
    .from("wa_client_groups")
    .upsert(rows, { onConflict: "group_jid", ignoreDuplicates: true })
    .select("id");
  if (upsertError) throw new Error(`seed failed: ${upsertError.message}`);

  console.log(`\ninserted ${written?.length ?? 0} new group rows (existing rows left untouched)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
