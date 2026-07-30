/**
 * Second-pass resolver for "hard" folders the main resolver missed. Handles the
 * two failure modes seen (e.g. Kunal Chhabra): (1) non-Indian phones not put in
 * E.164 (+CC) form, (2) name spelling drift (folder "Chabbra" vs FD "Chhabra").
 *
 * Strategy per folder: gather candidate contacts from E.164 phone searches AND
 * name-token autocomplete (full / first / last), then AUTO-WRITE only when a
 * candidate's phone/mobile last-9 digits match the profile phone (high
 * confidence). Otherwise print candidates for manual review — never guess.
 *
 * Writes freshdesk.txt (skip-conversations) into existing folders only.
 *
 * Usage: npx tsx scripts/resolve-hard.ts --folders-file=<list>
 */
import * as fs from "fs";
import * as path from "path";
import {
  findFreshdeskContactForClient,
  searchContactsByName,
  getContactById,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import type { FreshdeskContact } from "../lib/freshdesk/types";
import { buildFreshdeskExportText } from "./lib/export-formatters";

const OUTPUT = "exports/member-data-2026-07-03";
const RETRY = [5000, 15000, 30000, 60000, 90000];

function applyEnv(f: string): void {
  if (!fs.existsSync(f)) return;
  for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e <= 0) continue;
    let v = t.slice(e + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, e).trim()] = v;
  }
}
const arg = (p: string) => process.argv.find((x) => x.startsWith(p))?.slice(p.length).trim() ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRetriable = (e: unknown) => e instanceof Error && /429|status 429|fetch failed|econnreset|etimedout|socket|network|timeout|und_err|terminated/i.test(e.message);
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let a = 0; a <= RETRY.length; a++) {
    try { return await fn(); } catch (e) { last = e; if (isRetriable(e) && a < RETRY.length) { await sleep(RETRY[a]!); continue; } throw e; }
  }
  throw last;
}
const digits = (s: string | null | undefined) => (s ? s.replace(/\D/g, "") : "");
const last9 = (s: string | null | undefined) => { const d = digits(s); return d.length >= 9 ? d.slice(-9) : ""; };

function readProfile(dir: string): { name: string | null; phone: string | null } {
  const p = path.join(dir, "profile.txt");
  if (!fs.existsSync(p)) return { name: null, phone: null };
  const t = fs.readFileSync(p, "utf8");
  const name = t.match(/^Atlas Profile Export — (.+)$/m)?.[1]?.trim() ?? null;
  const raw = t.match(/^\s*Phone:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const phone = raw && raw !== "—" && /\d/.test(raw) ? raw.replace(/[‪‬‎‏]/g, "").trim() : null;
  return { name, phone };
}

function phoneCandidates(phone: string | null): string[] {
  if (!phone) return [];
  const d = digits(phone);
  const out = new Set<string>();
  if (d) { out.add("+" + d); out.add(d); }
  if (d.length === 10) { out.add("+91" + d); out.add("91" + d); }
  if (d.length > 10) out.add("+" + d);
  return [...out];
}

async function main() {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));
  const out = path.resolve(process.cwd(), OUTPUT);
  const ff = arg("--folders-file=");
  if (!ff) { console.log("Missing --folders-file="); process.exit(1); }
  const folders = fs.readFileSync(path.resolve(process.cwd(), ff), "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/\s/.test(s) && !s.startsWith("#"));

  for (const folder of folders) {
    const dir = path.join(out, folder);
    if (fs.existsSync(path.join(dir, "freshdesk.txt"))) { console.log(`SKIP ${folder} (has fd)`); continue; }
    const { name, phone } = readProfile(dir);
    const pk = last9(phone);
    console.log(`\n### ${folder} — "${name}" phone:${phone} (last9:${pk})`);

    const candidates = new Map<number, FreshdeskContact>();
    // phone searches
    for (const pv of phoneCandidates(phone)) {
      try { const c = await withRetry(() => findFreshdeskContactForClient({ phone: pv, firstName: null, lastName: null })); if (c) candidates.set(c.id, c); } catch (e) { console.log(`  phone(${pv}) err ${e instanceof Error ? e.message : e}`); }
      await sleep(1200);
    }
    // name-token searches
    const tokens = new Set<string>();
    if (name) { tokens.add(name); for (const t of name.split(/[\s&,]+/)) if (t.length >= 3) tokens.add(t); }
    for (const term of tokens) {
      try { const r = await withRetry(() => searchContactsByName(term)); for (const c of r) candidates.set(c.id, c); } catch (e) { console.log(`  name(${term}) err ${e instanceof Error ? e.message : e}`); }
      await sleep(1200);
    }

    const list = [...candidates.values()];
    console.log(`  candidates: ${list.length}`);
    for (const c of list) {
      const rec = c as unknown as { phone?: string; mobile?: string };
      const match = pk && (last9(rec.phone) === pk || last9(rec.mobile) === pk);
      console.log(`    #${c.id} "${c.name}" ph:${rec.phone} mob:${rec.mobile}${match ? "  <== PHONE MATCH" : ""}`);
    }

    // auto-write only on a phone-confirmed match
    const confirmed = list.filter((c) => { const rec = c as unknown as { phone?: string; mobile?: string }; return pk && (last9(rec.phone) === pk || last9(rec.mobile) === pk); });
    if (confirmed.length === 1) {
      const c = confirmed[0]!;
      const contact = (await withRetry(() => getContactById(c.id))) ?? c;
      const tickets = await withRetry(() => listTicketsForRequester(c.id));
      const text = await buildFreshdeskExportText({ clientName: contact.name || name || folder, contact, tickets, skipConversations: true });
      fs.writeFileSync(path.join(dir, "freshdesk.txt"), text, "utf8");
      console.log(`  ✓ AUTO-WROTE #${c.id} "${contact.name}" — ${tickets.length} tickets`);
    } else if (confirmed.length > 1) {
      console.log(`  ⚠ ${confirmed.length} phone-confirmed candidates — MANUAL REVIEW`);
    } else {
      console.log(`  ✗ no phone-confirmed match — ${list.length ? "review name candidates above" : "nothing found"}`);
    }
    await sleep(1500);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
