/**
 * Export Chetto WhatsApp group members to CSV (name + phone enrichment).
 *
 * Usage:
 *   npx tsx scripts/export-chetto-group-members.ts --dry-run
 *   npx tsx scripts/export-chetto-group-members.ts
 *   npx tsx scripts/export-chetto-group-members.ts --group-id=120363047586126589
 *   npx tsx scripts/export-chetto-group-members.ts --skip-timeline --output=exports/shop.csv
 */

import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import {
  chettoPhoneLookupVariants,
  fetchGroupMetadata,
  getGroupTimeline,
  type ChettoMessage,
} from "../lib/actions/chetto";

const CHETTO_BASE = "https://apiv2.chetto.ai/joule";
const DEFAULT_GROUP_ID = "120363047586126589";

type Source = "group_metadata" | "timeline" | "atlas" | "unknown";

type ParsedMember = {
  member_id: string;
  metaName: string;
  metaPhone: string;
};

type ExportRow = {
  member_id: string;
  name: string;
  phone: string;
  source: Source;
};

type CliOptions = {
  dryRun: boolean;
  groupId: string;
  output: string | null;
  skipTimeline: boolean;
  skipAtlas: boolean;
  includeSmallGroup: boolean;
};

const SMALL_GROUP_ID = "120363047113849371";

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

function parseCli(): CliOptions {
  const groupArg = process.argv.find((a) => a.startsWith("--group-id="));
  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  return {
    dryRun: process.argv.includes("--dry-run"),
    groupId: groupArg?.slice("--group-id=".length) ?? DEFAULT_GROUP_ID,
    output: outputArg ? outputArg.slice("--output=".length) : null,
    skipTimeline: process.argv.includes("--skip-timeline"),
    skipAtlas: process.argv.includes("--skip-atlas"),
    includeSmallGroup: process.argv.includes("--include-small-group"),
  };
}

function getChettoApiKey(): string {
  const key = process.env.CHETTO_API_KEY?.trim();
  if (!key) throw new Error("CHETTO_API_KEY is missing in .env.local");
  return key;
}

async function chettoGet(path: string): Promise<Response> {
  return fetch(`${CHETTO_BASE}${path}`, {
    headers: { "x-api-key": getChettoApiKey() },
    cache: "no-store",
  });
}

async function fetchGroupMembersList(groupId: string): Promise<ParsedMember[]> {
  const orgId = process.env.CHETTO_ORG_ID?.trim();
  const attempts: (string | undefined)[] = orgId ? [orgId, undefined] : [undefined];

  for (const tryOrgId of attempts) {
    const q = new URLSearchParams();
    if (tryOrgId) q.set("org_id", tryOrgId);
    const qs = q.toString();
    const res = await chettoGet(
      `/v1/groups/${encodeURIComponent(groupId)}/members${qs ? `?${qs}` : ""}`,
    );
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) continue;
    const list = Array.isArray(json.members) ? json.members : [];
    if (!list.length) continue;

    return list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const member_id = String(o.phone_no ?? o.member_id ?? o.id ?? "").trim();
        if (!member_id) return null;
        const apiName = String(o.name ?? o.display_name ?? "").trim();
        const metaName =
          !apiName || isLidId(apiName) || apiName === member_id ? "" : apiName;
        const metaPhone = isLidId(member_id) ? "" : displayPhone(member_id);
        return { member_id, metaName, metaPhone };
      })
      .filter((m): m is ParsedMember => m != null);
  }
  return [];
}

async function fetchRawGroupJson(
  groupId: string,
): Promise<Record<string, unknown> | null> {
  const orgId = process.env.CHETTO_ORG_ID?.trim();
  const attempts: (string | undefined)[] = orgId ? [orgId, undefined] : [undefined];

  for (const tryOrgId of attempts) {
    const q = new URLSearchParams();
    if (tryOrgId) q.set("org_id", tryOrgId);
    const qs = q.toString();
    const res = await chettoGet(
      `/v1/groups/${encodeURIComponent(groupId)}${qs ? `?${qs}` : ""}`,
    );
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as unknown;
    if (json && typeof json === "object") {
      return json as Record<string, unknown>;
    }
  }
  return null;
}

function extractMemberName(o: Record<string, unknown>): string {
  for (const key of [
    "name",
    "display_name",
    "sender_name",
    "push_name",
    "profile_name",
    "member_name",
  ] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractMemberPhone(o: Record<string, unknown>): string {
  for (const key of [
    "phone_number",
    "phone",
    "phone_no",
    "mobile",
    "wa_id",
  ] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractMemberId(o: Record<string, unknown>): string | null {
  for (const key of ["lid", "member_id", "id", "jid", "user_id"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const phone = extractMemberPhone(o);
  return phone || null;
}

function isLidId(value: string): boolean {
  return value.includes("@lid");
}

function displayPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || isLidId(trimmed)) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10) {
    return trimmed.startsWith("+") ? trimmed : `+${digits}`;
  }
  return trimmed;
}

function parseMembersFromRawGroup(
  json: Record<string, unknown>,
): ParsedMember[] {
  const memberArrays: unknown[][] = [];
  for (const key of ["access_members", "members", "participants"] as const) {
    const v = json[key];
    if (Array.isArray(v)) memberArrays.push(v);
  }

  const seen = new Set<string>();
  const out: ParsedMember[] = [];

  for (const arr of memberArrays) {
    for (const item of arr) {
      if (typeof item === "string" && item.trim()) {
        const member_id = item.trim();
        if (seen.has(member_id)) continue;
        seen.add(member_id);
        out.push({
          member_id,
          metaName: "",
          metaPhone: isLidId(member_id) ? "" : displayPhone(member_id),
        });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const member_id = extractMemberId(o);
      if (!member_id || seen.has(member_id)) continue;
      seen.add(member_id);
      out.push({
        member_id,
        metaName: extractMemberName(o),
        metaPhone: displayPhone(extractMemberPhone(o)),
      });
    }
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TimelineMineResult = {
  byPhone: Map<string, string>;
  byLid: Map<string, string>;
  senders: Array<{ phone: string; name: string }>;
};

async function mineTimeline(groupId: string): Promise<TimelineMineResult> {
  const byPhone = new Map<string, string>();
  const byLid = new Map<string, string>();
  const senderByCanonical = new Map<string, string>();
  let cursor: string | null = null;
  let pageNum = 0;

  while (true) {
    pageNum++;
    const page = await getGroupTimeline(
      groupId,
      200,
      cursor ?? undefined,
    );
    for (const m of page.messages) {
      ingestTimelineMessage(byPhone, byLid, m);
      const phone = m.phone_no?.trim();
      if (!phone || m.from_me) continue;
      const variants = chettoPhoneLookupVariants(phone);
      const canonical = variants.sort((a, b) => b.length - a.length)[0] ?? phone;
      const name = m.sender_name?.trim() ?? "";
      const prev = senderByCanonical.get(canonical) ?? "";
      if (name.length > prev.length) senderByCanonical.set(canonical, name);
    }
    process.stdout.write(
      `\r  Timeline page ${pageNum}: ${senderByCanonical.size} senders, ${byLid.size} lid names`,
    );
    cursor =
      typeof page.nextCursor === "string" && page.nextCursor.length > 0
        ? page.nextCursor
        : null;
    if (!cursor) break;
    await sleep(250);
  }
  process.stdout.write("\n");

  const senders = [...senderByCanonical.entries()].map(([phone, name]) => ({
    phone: displayPhone(phone),
    name,
  }));

  return { byPhone, byLid, senders };
}

function ingestTimelineMessage(
  byPhone: Map<string, string>,
  byLid: Map<string, string>,
  m: ChettoMessage,
): void {
  if (m.from_me) return;
  const phone = m.phone_no?.trim();
  if (!phone) return;
  const name = m.sender_name?.trim() ?? "";
  if (isLidId(phone)) {
    if (!name) return;
    const prev = byLid.get(phone) ?? "";
    if (name.length > prev.length) byLid.set(phone, name);
    return;
  }
  for (const variant of chettoPhoneLookupVariants(phone)) {
    if (!name) continue;
    const prev = byPhone.get(variant) ?? "";
    if (name.length > prev.length) byPhone.set(variant, name);
  }
}

type AtlasClient = {
  id: string;
  name: string;
  phone: string;
};

async function loadAtlasClients(): Promise<Map<string, AtlasClient>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("clients")
    .select("id, first_name, last_name, phone_number");
  if (error) throw new Error(`Atlas clients fetch failed: ${error.message}`);

  const index = new Map<string, AtlasClient>();
  for (const row of data ?? []) {
    const phone = String(row.phone_number ?? "").trim();
    if (!phone) continue;
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    const client: AtlasClient = {
      id: String(row.id),
      name,
      phone,
    };
    for (const variant of chettoPhoneLookupVariants(phone)) {
      index.set(variant, client);
    }
  }
  return index;
}

function lookupTimelineName(
  byPhone: Map<string, string>,
  phoneCandidates: string[],
): string {
  let best = "";
  for (const raw of phoneCandidates) {
    for (const variant of chettoPhoneLookupVariants(raw)) {
      const name = byPhone.get(variant);
      if (name && name.length > best.length) best = name;
    }
  }
  return best;
}

function lookupAtlas(
  atlasByPhone: Map<string, AtlasClient>,
  phoneCandidates: string[],
): AtlasClient | null {
  for (const raw of phoneCandidates) {
    for (const variant of chettoPhoneLookupVariants(raw)) {
      const hit = atlasByPhone.get(variant);
      if (hit) return hit;
    }
  }
  return null;
}

function memberPhonesRepresented(rows: ExportRow[]): Set<string> {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const raw of [row.phone, row.member_id]) {
      if (!raw || isLidId(raw)) continue;
      for (const v of chettoPhoneLookupVariants(raw)) seen.add(v);
    }
  }
  return seen;
}

function appendTimelineOnlyRows(
  metadataRows: ExportRow[],
  senders: Array<{ phone: string; name: string }>,
  atlasByPhone: Map<string, AtlasClient>,
): ExportRow[] {
  const represented = memberPhonesRepresented(metadataRows);
  const extra: ExportRow[] = [];
  const seenCanonical = new Set<string>();

  for (const { phone, name } of senders) {
    if (!phone) continue;
    const variants = chettoPhoneLookupVariants(phone);
    const canonical = variants.sort((a, b) => b.length - a.length)[0] ?? phone;
    if (seenCanonical.has(canonical)) continue;
    seenCanonical.add(canonical);

    const alreadyInGroup = variants.some((v) => represented.has(v));
    if (alreadyInGroup) continue;

    let resolvedName = name;
    let source: Source = "timeline";
    const atlas = lookupAtlas(atlasByPhone, [phone]);
    if (!resolvedName && atlas) {
      resolvedName = atlas.name;
      source = "atlas";
    } else if (atlas && resolvedName === atlas.name) {
      source = "atlas";
    }

    extra.push({
      member_id: phone,
      name: resolvedName,
      phone,
      source,
    });
  }

  return extra;
}

function mergeMemberRow(
  member: ParsedMember,
  timelineByPhone: Map<string, string>,
  timelineByLid: Map<string, string>,
  atlasByPhone: Map<string, AtlasClient>,
): ExportRow {
  const phoneCandidates = [
    member.metaPhone,
    isLidId(member.member_id) ? "" : member.member_id,
  ].filter(Boolean);

  let name = member.metaName;
  let phone = member.metaPhone || displayPhone(member.member_id);
  let source: Source =
    member.metaName || member.metaPhone ? "group_metadata" : "unknown";

  if (isLidId(member.member_id)) {
    const lidName = timelineByLid.get(member.member_id);
    if (lidName) {
      name = lidName;
      source = "timeline";
    }
  }

  const timelineName = lookupTimelineName(timelineByPhone, phoneCandidates);
  if (timelineName) {
    if (!name || timelineName.length >= name.length) {
      name = timelineName;
      source = "timeline";
    }
  }

  const atlas = lookupAtlas(atlasByPhone, phoneCandidates);
  if (atlas) {
    if (!name) {
      name = atlas.name;
      source = "atlas";
    }
    if (!phone) phone = displayPhone(atlas.phone);
    if (source === "unknown") source = "atlas";
  }

  return {
    member_id: member.member_id,
    name,
    phone: isLidId(phone) ? "" : phone,
    source,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function defaultOutputPath(): string {
  const date = format(new Date(), "yyyy-MM-dd");
  return path.join(
    process.cwd(),
    "exports",
    `indulge-shop-members-${date}.csv`,
  );
}

async function exportGroup(
  groupId: string,
  timelineByPhone: Map<string, string>,
  timelineByLid: Map<string, string>,
  atlasByPhone: Map<string, AtlasClient>,
): Promise<{
  rows: ExportRow[];
  groupName: string | null;
  memberApiUsed: boolean;
}> {
  const meta = await fetchGroupMetadata(groupId);
  let members = await fetchGroupMembersList(groupId);
  let memberApiUsed = members.length > 0;

  if (!members.length) {
    const raw = await fetchRawGroupJson(groupId);
    if (raw) members = parseMembersFromRawGroup(raw);
  }
  if (!members.length && meta?.access_members.length) {
    members = meta.access_members.map((member_id) => ({
      member_id,
      metaName: "",
      metaPhone: isLidId(member_id) ? "" : displayPhone(member_id),
    }));
  }

  const rows = members.map((m) =>
    mergeMemberRow(m, timelineByPhone, timelineByLid, atlasByPhone),
  );

  return {
    rows,
    groupName: meta?.group_name ?? null,
    memberApiUsed,
  };
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();
  const outputPath = path.resolve(process.cwd(), opts.output ?? defaultOutputPath());
  const groupIds = opts.includeSmallGroup
    ? [opts.groupId, SMALL_GROUP_ID]
    : [opts.groupId];

  console.log(`Group ID(s): ${groupIds.join(", ")}`);

  let timelineByPhone = new Map<string, string>();
  let timelineByLid = new Map<string, string>();
  let timelineSenders: Array<{ phone: string; name: string }> = [];
  if (!opts.skipTimeline) {
    console.log("Mining timeline for sender names…");
    for (const gid of groupIds) {
      const mined = await mineTimeline(gid);
      for (const [k, v] of mined.byPhone) {
        const prev = timelineByPhone.get(k) ?? "";
        if (v.length > prev.length) timelineByPhone.set(k, v);
      }
      for (const [k, v] of mined.byLid) {
        const prev = timelineByLid.get(k) ?? "";
        if (v.length > prev.length) timelineByLid.set(k, v);
      }
      for (const s of mined.senders) {
        const variants = chettoPhoneLookupVariants(s.phone);
        const canonical =
          variants.sort((a, b) => b.length - a.length)[0] ?? s.phone;
        const existing = timelineSenders.find((x) => {
          const xv = chettoPhoneLookupVariants(x.phone);
          const xc = xv.sort((a, b) => b.length - a.length)[0];
          return xc === canonical;
        });
        if (!existing) timelineSenders.push(s);
        else if (s.name.length > existing.name.length) existing.name = s.name;
      }
    }
    console.log(
      `Timeline senders: ${timelineSenders.length} (${timelineByPhone.size} phone keys, ${timelineByLid.size} lid names)`,
    );
  }

  let atlasByPhone = new Map<string, AtlasClient>();
  if (!opts.skipAtlas) {
    console.log("Loading Atlas clients for phone join…");
    atlasByPhone = await loadAtlasClients();
    console.log(`Atlas phone index keys: ${atlasByPhone.size}`);
  }

  const allRows: ExportRow[] = [];
  let groupName: string | null = null;
  let memberApiUsed = false;

  for (const gid of groupIds) {
    console.log(`Fetching members for ${gid}…`);
    const result = await exportGroup(
      gid,
      timelineByPhone,
      timelineByLid,
      atlasByPhone,
    );
    groupName = result.groupName ?? groupName;
    memberApiUsed = result.memberApiUsed || memberApiUsed;
    console.log(
      `  Members: ${result.rows.length}${result.memberApiUsed ? " (via /members API)" : ""}`,
    );
    allRows.push(...result.rows);
  }

  if (!opts.skipTimeline && timelineSenders.length) {
    const extra = appendTimelineOnlyRows(
      allRows,
      timelineSenders,
      atlasByPhone,
    );
    if (extra.length) {
      console.log(`  Timeline-only rows appended: ${extra.length}`);
      allRows.push(...extra);
    }
  }

  const withName = allRows.filter((r) => r.name.trim()).length;
  const withPhone = allRows.filter((r) => r.phone.trim()).length;
  const bySource: Record<Source, number> = {
    group_metadata: 0,
    timeline: 0,
    atlas: 0,
    unknown: 0,
  };
  for (const r of allRows) bySource[r.source]++;

  const withNameAndPhone = allRows.filter(
    (r) => r.name.trim() && r.phone.trim(),
  ).length;

  console.log("\nSummary:");
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  With name:  ${withName}`);
  console.log(`  With phone: ${withPhone}`);
  console.log(`  With both:  ${withNameAndPhone}`);
  console.log(`  Sources:    ${JSON.stringify(bySource)}`);
  if (withName < allRows.length * 0.5) {
    console.log(
      "\n  Note: Most members are WhatsApp @lid IDs — Chetto/WhatsApp do not expose",
    );
    console.log(
      "  real names or phone numbers for silent broadcast-group members.",
    );
    console.log(
      "  Only people who have messaged (or exist in Atlas) can be enriched.",
    );
  }

  if (opts.dryRun) {
    console.log("\nDry run — no file written.");
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const header = "member_id,name,phone,source\n";
  const body = allRows
    .map((r) =>
      [
        csvEscape(r.member_id),
        csvEscape(r.name),
        csvEscape(r.phone),
        csvEscape(r.source),
      ].join(","),
    )
    .join("\n");
  fs.writeFileSync(outputPath, header + body + "\n", "utf8");

  const contactPath = outputPath.replace(/\.csv$/i, "-with-contact.csv");
  const contactRows = allRows.filter((r) => r.name.trim() || r.phone.trim());
  const contactBody = contactRows
    .map((r) =>
      [
        csvEscape(r.member_id),
        csvEscape(r.name),
        csvEscape(r.phone),
        csvEscape(r.source),
      ].join(","),
    )
    .join("\n");
  fs.writeFileSync(contactPath, header + contactBody + "\n", "utf8");

  const summaryPath = outputPath.replace(/\.csv$/i, "-summary.json");
  const completedAt = new Date();
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        groupIds,
        groupName,
        outputPath,
        contactPath,
        memberApiUsed,
        limitation:
          "WhatsApp broadcast groups store most participants as @lid only; Chetto GET /v1/groups/{id}/members returns lid as name/phone for silent members.",
        counts: {
          total: allRows.length,
          withName,
          withPhone,
          withNameAndPhone,
          contactRows: contactRows.length,
          timelineSenders: timelineSenders.length,
          timelinePhoneKeys: timelineByPhone.size,
          timelineLidNames: timelineByLid.size,
          atlasIndexKeys: atlasByPhone.size,
          bySource,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\nWrote ${outputPath}`);
  console.log(`Contact rows: ${contactPath} (${contactRows.length} rows)`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
