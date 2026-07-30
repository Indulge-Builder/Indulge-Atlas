/**
 * Bulk export Atlas client data to per-client folders (profile, Freshdesk, Chetto).
 *
 * Usage:
 *   npx tsx scripts/export-all-clients-data.ts --dry-run --limit=5
 *   npx tsx scripts/export-all-clients-data.ts --limit=3
 *   npx tsx scripts/export-all-clients-data.ts --client-id=<uuid>
 *   npx tsx scripts/export-all-clients-data.ts --status=active
 *   npx tsx scripts/export-all-clients-data.ts --skip-freshdesk --output=exports/my-run
 */

import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import { getGroupTimeline } from "../lib/actions/chetto";
import {
  findFreshdeskContactForClient,
  listTicketsForRequester,
} from "../lib/freshdesk/client";
import {
  buildFreshdeskExportText,
  buildProfileExportText,
  formatChettoMessagesText,
  type ExportClientProfile,
} from "./lib/export-formatters";

const CLIENT_EXPORT_SELECT = `
  id,
  first_name,
  last_name,
  phone_number,
  chetto_group_id,
  email,
  queendom,
  former_queendom,
  client_status,
  membership_type,
  membership_start,
  membership_end,
  membership_amount_paid,
  membership_interval,
  membership_status,
  external_id,
  assigned_agent_id,
  notes,
  created_at,
  updated_at,
  client_profiles (
    id,
    personality_type,
    date_of_birth,
    blood_group,
    marital_status,
    wedding_anniversary,
    primary_city,
    company_designation,
    social_handles,
    travel,
    lifestyle,
    passions,
    elia_notes,
    elia_profile,
    elia_version,
    elia_analyzed_at,
    elia_messages_through,
    profile_completeness,
    last_enriched_at,
    updated_at
  )
`;

type FileKind = "profile" | "freshdesk" | "chetto";
type FileResult = "success" | "skip" | "fail";

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  clientId: string | null;
  status: "active" | "expired" | "all";
  skipProfile: boolean;
  skipFreshdesk: boolean;
  skipChetto: boolean;
  output: string | null;
};

type RawClientRow = Record<string, unknown>;

type SummaryCounts = Record<FileKind, Record<FileResult, number>>;

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
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const clientIdArg = process.argv.find((a) => a.startsWith("--client-id="));
  const statusArg = process.argv.find((a) => a.startsWith("--status="));
  const outputArg = process.argv.find((a) => a.startsWith("--output="));

  const statusRaw = statusArg?.slice("--status=".length) ?? "all";
  if (!["active", "expired", "all"].includes(statusRaw)) {
    throw new Error(`Invalid --status=${statusRaw} (use active|expired|all)`);
  }

  return {
    dryRun: process.argv.includes("--dry-run"),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    clientId: clientIdArg ? clientIdArg.slice("--client-id=".length) : null,
    status: statusRaw as CliOptions["status"],
    skipProfile: process.argv.includes("--skip-profile"),
    skipFreshdesk: process.argv.includes("--skip-freshdesk"),
    skipChetto: process.argv.includes("--skip-chetto"),
    output: outputArg ? outputArg.slice("--output=".length) : null,
  };
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function clientFolderName(
  firstName: string,
  lastName: string | null,
  id: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const safe =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "client";
  return `${safe}_${id.slice(0, 8)}`;
}

function mapClientRow(row: RawClientRow): ExportClientProfile {
  const profRaw = row.client_profiles;
  const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
  const p =
    prof && typeof prof === "object"
      ? (prof as Record<string, unknown>)
      : null;

  return {
    id: String(row.id),
    first_name: String(row.first_name ?? ""),
    last_name: (row.last_name as string | null) ?? null,
    phone_number: (row.phone_number as string | null) ?? null,
    chetto_group_id: (row.chetto_group_id as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    queendom: (row.queendom as string | null) ?? null,
    former_queendom: (row.former_queendom as string | null) ?? null,
    client_status: String(row.client_status ?? ""),
    membership_type: (row.membership_type as string | null) ?? null,
    membership_start: (row.membership_start as string | null) ?? null,
    membership_end: (row.membership_end as string | null) ?? null,
    membership_amount_paid:
      row.membership_amount_paid != null
        ? Number(row.membership_amount_paid)
        : null,
    membership_interval: (row.membership_interval as string | null) ?? null,
    membership_status: (row.membership_status as string | null) ?? null,
    external_id: (row.external_id as string | null) ?? null,
    assigned_agent_id: (row.assigned_agent_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    profile: p
      ? {
          personality_type: (p.personality_type as string | null) ?? null,
          date_of_birth: (p.date_of_birth as string | null) ?? null,
          blood_group: (p.blood_group as string | null) ?? null,
          marital_status: (p.marital_status as string | null) ?? null,
          wedding_anniversary:
            (p.wedding_anniversary as string | null) ?? null,
          primary_city: (p.primary_city as string | null) ?? null,
          company_designation:
            (p.company_designation as string | null) ?? null,
          social_handles: (p.social_handles as string | null) ?? null,
          travel: p.travel ?? null,
          lifestyle: p.lifestyle ?? null,
          passions: p.passions ?? null,
          elia_notes: p.elia_notes ?? null,
          elia_profile: p.elia_profile ?? null,
          elia_version:
            typeof p.elia_version === "number" ? p.elia_version : null,
          elia_analyzed_at: (p.elia_analyzed_at as string | null) ?? null,
          elia_messages_through:
            (p.elia_messages_through as string | null) ?? null,
          profile_completeness:
            p.profile_completeness != null
              ? Number(p.profile_completeness)
              : null,
          last_enriched_at: (p.last_enriched_at as string | null) ?? null,
          updated_at: (p.updated_at as string | null) ?? null,
        }
      : null,
  };
}

function defaultOutputRoot(): string {
  const date = format(new Date(), "yyyy-MM-dd");
  return path.join(process.cwd(), "exports", `client-data-${date}`);
}

function symbolFor(result: FileResult): string {
  if (result === "success") return "✓";
  if (result === "skip") return "−";
  return "✗";
}

async function fetchClients(opts: CliOptions): Promise<ExportClientProfile[]> {
  const supabase = getServiceClient();
  let q = supabase
    .from("clients")
    .select(CLIENT_EXPORT_SELECT)
    .order("first_name");

  if (opts.clientId) {
    q = q.eq("id", opts.clientId);
  }
  if (opts.status !== "all") {
    q = q.eq("client_status", opts.status);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);

  let rows = (data ?? []).map((r) => mapClientRow(r as RawClientRow));
  if (opts.limit != null && opts.limit > 0) {
    rows = rows.slice(0, opts.limit);
  }
  return rows;
}

async function exportChettoText(
  client: ExportClientProfile,
): Promise<{ text: string; result: FileResult }> {
  const groupId = client.chetto_group_id?.trim();
  if (!groupId) {
    return {
      text: "No Chetto group linked for this client.\n",
      result: "skip",
    };
  }

  const allMessages = [];
  let cursor: string | null = null;
  let timelineNotAvailable = false;

  while (true) {
    const page = await getGroupTimeline(
      groupId,
      200,
      cursor ?? undefined,
      { queendom: client.queendom?.trim() || undefined },
    );
    if (page.timelineNotAvailable) {
      timelineNotAvailable = true;
      if (!allMessages.length) break;
    }
    allMessages.push(...page.messages);
    cursor =
      typeof page.nextCursor === "string" && page.nextCursor.length > 0
        ? page.nextCursor
        : null;
    if (!cursor) break;
  }

  if (timelineNotAvailable && allMessages.length === 0) {
    return {
      text: "Chetto timeline not available for this group.\n",
      result: "skip",
    };
  }

  return {
    text: formatChettoMessagesText(allMessages, { groupId }),
    result: "success",
  };
}

async function exportFreshdeskText(
  client: ExportClientProfile,
): Promise<{ text: string; result: FileResult }> {
  const contact = await findFreshdeskContactForClient({
    phone: client.phone_number,
    firstName: client.first_name,
    lastName: client.last_name,
  });

  if (!contact) {
    return {
      text: "No Freshdesk contact found for this client.\n",
      result: "skip",
    };
  }

  const tickets = await listTicketsForRequester(contact.id);
  const fullName = [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const text = await buildFreshdeskExportText({
    clientName: fullName || "Client",
    contact,
    tickets,
  });

  return { text, result: "success" };
}

async function processClient(
  client: ExportClientProfile,
  clientDir: string,
  opts: CliOptions,
  counts: SummaryCounts,
  errors: Array<{
    clientId: string;
    folder: string;
    file: FileKind;
    error: string;
  }>,
): Promise<Record<FileKind, FileResult>> {
  const results: Record<FileKind, FileResult> = {
    profile: "skip",
    freshdesk: "skip",
    chetto: "skip",
  };
  const statusLines: string[] = [];

  if (!opts.dryRun) {
    fs.mkdirSync(clientDir, { recursive: true });
  }

  const writeFile = (name: string, content: string) => {
    if (!opts.dryRun) {
      fs.writeFileSync(path.join(clientDir, name), content, "utf8");
    }
  };

  if (!opts.skipProfile) {
    try {
      const text = buildProfileExportText(client);
      writeFile("profile.txt", text);
      results.profile = "success";
      counts.profile.success++;
      statusLines.push("profile: success");
    } catch (e) {
      results.profile = "fail";
      counts.profile.fail++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        clientId: client.id,
        folder: path.basename(clientDir),
        file: "profile",
        error: msg,
      });
      statusLines.push(`profile: fail — ${msg}`);
    }
  }

  if (!opts.skipFreshdesk) {
    try {
      const { text, result } = await exportFreshdeskText(client);
      writeFile("freshdesk.txt", text);
      results.freshdesk = result;
      counts.freshdesk[result]++;
      statusLines.push(`freshdesk: ${result}`);
    } catch (e) {
      results.freshdesk = "fail";
      counts.freshdesk.fail++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        clientId: client.id,
        folder: path.basename(clientDir),
        file: "freshdesk",
        error: msg,
      });
      statusLines.push(`freshdesk: fail — ${msg}`);
    }
  }

  if (!opts.skipChetto) {
    try {
      const { text, result } = await exportChettoText(client);
      writeFile("chetto.txt", text);
      results.chetto = result;
      counts.chetto[result]++;
      statusLines.push(`chetto: ${result}`);
    } catch (e) {
      results.chetto = "fail";
      counts.chetto.fail++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        clientId: client.id,
        folder: path.basename(clientDir),
        file: "chetto",
        error: msg,
      });
      statusLines.push(`chetto: fail — ${msg}`);
    }
  }

  if (!opts.dryRun && statusLines.length) {
    writeFile("_export-status.txt", statusLines.join("\n") + "\n");
  }

  return results;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const opts = parseCli();
  const startedAt = new Date();
  const outputRoot = path.resolve(
    process.cwd(),
    opts.output ?? defaultOutputRoot(),
  );

  if (!opts.dryRun) {
    fs.mkdirSync(outputRoot, { recursive: true });
  }

  const clients = await fetchClients(opts);
  if (!clients.length) {
    console.log("No clients matched the filters.");
    return;
  }

  const counts: SummaryCounts = {
    profile: { success: 0, skip: 0, fail: 0 },
    freshdesk: { success: 0, skip: 0, fail: 0 },
    chetto: { success: 0, skip: 0, fail: 0 },
  };
  const errors: Array<{
    clientId: string;
    folder: string;
    file: FileKind;
    error: string;
  }> = [];

  console.log(
    opts.dryRun
      ? `Dry run — ${clients.length} client(s), output root: ${outputRoot}`
      : `Exporting ${clients.length} client(s) → ${outputRoot}`,
  );

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]!;
    const folder = clientFolderName(
      client.first_name,
      client.last_name,
      client.id,
    );
    const clientDir = path.join(outputRoot, folder);

    if (opts.dryRun) {
      console.log(
        `[${i + 1}/${clients.length}] ${folder}/ → profile.txt, freshdesk.txt, chetto.txt`,
      );
      continue;
    }

    const results = await processClient(
      client,
      clientDir,
      opts,
      counts,
      errors,
    );

    const parts: string[] = [];
    if (!opts.skipProfile) parts.push(`profile ${symbolFor(results.profile)}`);
    if (!opts.skipFreshdesk)
      parts.push(`freshdesk ${symbolFor(results.freshdesk)}`);
    if (!opts.skipChetto) parts.push(`chetto ${symbolFor(results.chetto)}`);

    console.log(`[${i + 1}/${clients.length}] ${folder} — ${parts.join(" ")}`);
  }

  const completedAt = new Date();
  const summary = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    dryRun: opts.dryRun,
    outputRoot,
    clientsProcessed: clients.length,
    filters: {
      clientId: opts.clientId,
      status: opts.status,
      limit: opts.limit,
      skipProfile: opts.skipProfile,
      skipFreshdesk: opts.skipFreshdesk,
      skipChetto: opts.skipChetto,
    },
    counts,
    errors,
  };

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(outputRoot, "_summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
  }

  console.log(
    opts.dryRun
      ? "Dry run complete (no files written)."
      : `Done in ${summary.durationMs}ms. Summary: ${path.join(outputRoot, "_summary.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
