/**
 * Elia WhatsApp Profile Analysis Service.
 *
 * NOT a "use server" module — this is a pure service consumed by both:
 *   - lib/actions/elia.ts  (server action — manual trigger)
 *   - app/api/elia/analyse-client/route.ts  (cron / automation)
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { getGroupTimeline, findClientGroup } from "@/lib/actions/chetto";
import {
  buildWhatsAppProfilePrompt,
  parseEliaProfileFromModelText,
} from "@/lib/elia/chat-prompt";
import { sanitizeText } from "@/lib/utils/sanitize";
import { e164LookupVariants } from "@/lib/utils/phone";
import type { EliaProfile } from "@/lib/types/database";

// ── Internal helpers ─────────────────────────────────────────────────────────

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Returns true when any variant of `clientPhone` (E.164 or digits-only) matches
 * the sender phone from Chetto messages. Chetto stores phones as digit strings
 * like `919818799928`; Atlas stores E.164 like `+919818799928` or `9818799928`.
 */
function isClientPhone(senderPhone: string | null, clientPhone: string): boolean {
  if (!senderPhone) return false;
  const senderDigits = normalizePhoneDigits(senderPhone);
  if (!senderDigits) return false;

  const variants = e164LookupVariants(clientPhone);
  for (const v of variants) {
    const vDigits = normalizePhoneDigits(v);
    if (vDigits && (senderDigits === vDigits || senderDigits.endsWith(vDigits) || vDigits.endsWith(senderDigits))) {
      return true;
    }
  }
  return false;
}

function parseTimestampToMs(ts: string | null): number {
  if (!ts) return 0;
  const n = Number(ts);
  if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  try {
    return new Date(ts).getTime();
  } catch {
    return 0;
  }
}

function timestampToISO(ts: string | null): string | null {
  if (!ts) return null;
  const ms = parseTimestampToMs(ts);
  if (!ms) return null;
  return new Date(ms).toISOString();
}

// ── Step 4a — Fetch Chetto messages ─────────────────────────────────────────

type AnalysisMessage = {
  sender: string;
  senderPhone: string | null;
  body: string;
  timestamp: string;
  isClient: boolean;
};

async function fetchChettoMessages(params: {
  clientPhone: string;
  groupId: string | null;
  queendom: string | null;
  sinceTimestamp: string | null;
}): Promise<AnalysisMessage[]> {
  const { clientPhone, groupId, queendom, sinceTimestamp } = params;

  let resolvedGroupId = groupId?.trim() ?? "";

  if (!resolvedGroupId) {
    const group = await findClientGroup(clientPhone, queendom ?? "Unassigned");
    if (!group?.group_id) return [];
    resolvedGroupId = group.group_id;
  }

  const sinceMs = sinceTimestamp ? parseTimestampToMs(sinceTimestamp) : 0;

  const collected: AnalysisMessage[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  const maxPages = 20;

  while (pagesFetched < maxPages) {
    const result = await getGroupTimeline(resolvedGroupId, 100, cursor ?? undefined);

    if (result.timelineNotAvailable || result.messages.length === 0) break;

    let hitOldMessages = false;
    for (const msg of result.messages) {
      const body = (msg.text ?? "").trim();
      if (!body) continue;

      const msgMs = parseTimestampToMs(msg.timestamp);
      if (sinceMs > 0 && msgMs > 0 && msgMs <= sinceMs) {
        hitOldMessages = true;
        break;
      }

      const isoTs = timestampToISO(msg.timestamp) ?? msg.timestamp ?? new Date().toISOString();
      const isClient = msg.from_me ? false : isClientPhone(msg.phone_no, clientPhone);

      collected.push({
        sender: msg.phone_no ? `····${normalizePhoneDigits(msg.phone_no).slice(-4)}` : "Unknown",
        senderPhone: msg.phone_no,
        body: sanitizeText(body),
        timestamp: isoTs,
        isClient,
      });
    }

    if (hitOldMessages) break;
    if (!result.nextCursor) break;

    cursor = result.nextCursor;
    pagesFetched++;
  }

  const clientMessageCount = collected.filter((m) => m.isClient).length;
  if (clientMessageCount < 5) return [];

  return collected;
}

// ── Step 4b — Run AI analysis ────────────────────────────────────────────────

async function analyzeMessagesWithClaude(params: {
  clientName: string;
  existingProfile: EliaProfile | null;
  messages: AnalysisMessage[];
}): Promise<EliaProfile> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");

  // Cap batch size so prompts/responses stay within model limits
  const sortedMessages = [...params.messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const messagesForPrompt = sortedMessages.slice(-120);

  const prompt = buildWhatsAppProfilePrompt({
    existingProfile: params.existingProfile,
    clientName: params.clientName,
    messages: messagesForPrompt.map((m) => ({
      sender: m.sender,
      body: m.body,
      timestamp: m.timestamp,
      isClient: m.isClient,
    })),
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const result = (await response.json()) as {
    content?: { text?: string }[];
    stop_reason?: string;
  };
  const rawText = result.content?.[0]?.text?.trim() ?? "";

  if (result.stop_reason === "max_tokens") {
    throw new Error(
      "ELIA_PARSE_ERROR: response was truncated by the model — try again; profile was not saved",
    );
  }

  return parseEliaProfileFromModelText(rawText);
}

// ── Step 4c — Merge and persist ──────────────────────────────────────────────

async function mergeAndPersistProfile(params: {
  clientId: string;
  existingProfile: EliaProfile | null;
  existingVersion: number;
  newProfileDelta: EliaProfile;
  lastMessageTimestamp: string;
  messageCount: number;
}): Promise<void> {
  const {
    clientId,
    existingProfile,
    existingVersion,
    newProfileDelta,
    lastMessageTimestamp,
    messageCount,
  } = params;

  const now = new Date().toISOString();

  const merged: EliaProfile = {
    ...newProfileDelta,
    sources: {
      analysis_runs: (existingProfile?.sources?.analysis_runs ?? 0) + 1,
      message_count_analyzed:
        (existingProfile?.sources?.message_count_analyzed ?? 0) + messageCount,
      whatsapp_analyzed_through: lastMessageTimestamp,
    },
    last_updated_at: now,
    last_updated_by: "whatsapp_analysis",
    version: existingVersion + 1,
  };

  const db = getServiceSupabaseClient();

  // Attempt UPDATE on the existing row
  const { error: updateError, count: updateCount } = await db
    .from("client_profiles")
    .update({
      elia_profile: merged,
      elia_version: merged.version,
      elia_analyzed_at: now,
      elia_messages_through: lastMessageTimestamp,
    })
    .eq("client_id", clientId);

  if (updateError) {
    throw new Error(`Failed to update Elia profile: ${updateError.message}`);
  }

  // updateCount is null when the driver doesn't return count — fall back to a SELECT to check
  const rowExists =
    updateCount !== null
      ? updateCount > 0
      : await (async () => {
          const { data } = await db
            .from("client_profiles")
            .select("id")
            .eq("client_id", clientId)
            .maybeSingle();
          return data !== null;
        })();

  // No row existed yet — create a fresh profile row with elia columns + required defaults
  if (!rowExists) {
    const { error: insertError } = await db
      .from("client_profiles")
      .insert({
        client_id: clientId,
        elia_profile: merged,
        elia_version: merged.version,
        elia_analyzed_at: now,
        elia_messages_through: lastMessageTimestamp,
      });

    if (insertError) {
      throw new Error(`Failed to insert Elia profile: ${insertError.message}`);
    }
  }
}

// ── Step 4d — Main exported function ─────────────────────────────────────────

export async function runEliaWhatsAppAnalysis(clientId: string): Promise<{
  success: boolean;
  messagesAnalyzed: number;
  error?: string;
}> {
  try {
    const db = getServiceSupabaseClient();

    // Fetch client record
    const { data: client, error: clientErr } = await db
      .from("clients")
      .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return { success: false, messagesAnalyzed: 0, error: "Client not found" };
    }

    const clientName = [client.first_name, client.last_name].filter(Boolean).join(" ");
    const phone = (client.phone_number as string) ?? "";
    const queendom = (client.queendom as string | null) ?? null;
    const chettoGroupId = (client.chetto_group_id as string | null) ?? null;

    // Fetch existing profile row
    const { data: profileRow } = await db
      .from("client_profiles")
      .select("elia_profile, elia_version, elia_messages_through")
      .eq("client_id", clientId)
      .maybeSingle();

    const existingProfile = (profileRow?.elia_profile as EliaProfile | null) ?? null;
    const existingVersion = (profileRow?.elia_version as number) ?? 0;
    const sinceTimestamp = (profileRow?.elia_messages_through as string | null) ?? null;

    // Fetch messages from Chetto
    const messages = await fetchChettoMessages({
      clientPhone: phone,
      groupId: chettoGroupId,
      queendom,
      sinceTimestamp,
    });

    if (messages.length === 0) {
      return { success: true, messagesAnalyzed: 0 };
    }

    // Find the most recent message timestamp
    const sortedByTime = [...messages].sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    const lastMessageTimestamp = sortedByTime[0]?.timestamp ?? new Date().toISOString();

    // Run Claude analysis
    const newProfile = await analyzeMessagesWithClaude({
      clientName,
      existingProfile,
      messages,
    });

    // Persist
    await mergeAndPersistProfile({
      clientId,
      existingProfile,
      existingVersion,
      newProfileDelta: newProfile,
      lastMessageTimestamp,
      messageCount: messages.length,
    });

    return { success: true, messagesAnalyzed: messages.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[eliaProfileAnalysis] runEliaWhatsAppAnalysis failed:", message);
    return { success: false, messagesAnalyzed: 0, error: message };
  }
}
