/**
 * Tier-2 Chetto group resolution: message search, timeline phone scan, org insights.
 * Server-only — imported by server actions and scripts, not client components.
 */

import {
  askChettoOrgInsights,
  chettoPhoneLookupVariants,
  clientNameMatchKey,
  getGroupTimeline,
  getQueendomSubOrgMap,
  listAllGroupIds,
  searchChettoMessagesOrg,
} from "@/lib/actions/chetto";
import type { ChettoSuggestionMethod } from "@/lib/types/database";

export type ChettoTier2ResolveInput = {
  phone: string;
  firstName: string;
  lastName: string | null;
  queendom: string | null;
};

export type ChettoTier2ResolveResult = {
  groupId: string;
  confidence: number;
  method: ChettoSuggestionMethod;
  evidence: string;
};

export type ChettoTier2ResolveOptions = {
  /** Max groups to timeline-scan (default 50). */
  maxTimelineGroups?: number;
  /** Messages per group timeline page (default 30). */
  timelinePageSize?: number;
  skipSearch?: boolean;
  skipTimeline?: boolean;
  skipInsights?: boolean;
};

const GROUP_ID_RE = /^120363\d+$/;

async function resolveOrgIdForQueendom(queendom: string | null): Promise<string | undefined> {
  const subOrgMap = await getQueendomSubOrgMap();
  if (queendom && subOrgMap[queendom]) {
    return subOrgMap[queendom];
  }
  return process.env.CHETTO_ORG_ID?.trim() || undefined;
}

function phoneVariantsIntersect(
  a: string[],
  b: string[],
): boolean {
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

function parseInsightsGroupReply(text: string): {
  groupId: string | null;
  confidence: number;
  groupName?: string;
} | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const rawId = o.group_id ?? o.groupId;
      if (rawId === null || rawId === "null") {
        return { groupId: null, confidence: 0 };
      }
      if (typeof rawId === "string" && GROUP_ID_RE.test(rawId)) {
        const confRaw = o.confidence;
        const confidence =
          typeof confRaw === "number" && confRaw >= 0 && confRaw <= 100
            ? Math.round(confRaw)
            : 65;
        const groupName =
          typeof o.group_name === "string"
            ? o.group_name
            : typeof o.groupName === "string"
              ? o.groupName
              : undefined;
        return { groupId: rawId, confidence, groupName };
      }
    } catch {
      /* fall through */
    }
  }

  const idMatch = text.match(/(120363\d{12,})/);
  if (idMatch?.[1]) {
    return { groupId: idMatch[1], confidence: 55 };
  }
  return null;
}

async function resolveViaMessageSearch(
  client: ChettoTier2ResolveInput,
): Promise<ChettoTier2ResolveResult | null> {
  const orgId = await resolveOrgIdForQueendom(client.queendom);
  if (!orgId) return null;

  const name = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  const phoneDigits = client.phone.replace(/\D/g, "");
  const queries = [
    name.length >= 3 ? name : null,
    phoneDigits.length >= 8 ? phoneDigits.slice(-10) : null,
    client.phone.trim() || null,
  ].filter((q): q is string => Boolean(q));

  const phoneVariants = chettoPhoneLookupVariants(client.phone);
  const seenGroups = new Set<string>();

  for (const query of queries) {
    const hits = await searchChettoMessagesOrg(orgId, query, 25);
    for (const hit of hits) {
      if (seenGroups.has(hit.group_id)) continue;
      seenGroups.add(hit.group_id);

      const hitPhoneVariants = hit.phone_no
        ? chettoPhoneLookupVariants(hit.phone_no)
        : [];
      const phoneMatch =
        hitPhoneVariants.length > 0 &&
        phoneVariantsIntersect(phoneVariants, hitPhoneVariants);

      const snippet = (hit.snippet ?? "").toLowerCase();
      const nameKey = clientNameMatchKey(client.firstName, client.lastName);
      const nameInSnippet =
        nameKey.length >= 3 &&
        snippet.includes(nameKey.split(" ")[0] ?? "") &&
        (nameKey.split(" ").length === 1 ||
          snippet.includes(nameKey.split(" ").slice(-1)[0] ?? ""));

      if (phoneMatch) {
        return {
          groupId: hit.group_id,
          confidence: 82,
          method: "search",
          evidence: `Message search: client phone in group ${hit.group_name ?? hit.group_id}. ${(hit.snippet ?? "").slice(0, 120)}`,
        };
      }
      if (nameInSnippet) {
        return {
          groupId: hit.group_id,
          confidence: 72,
          method: "search",
          evidence: `Message search: name match in ${hit.group_name ?? hit.group_id}. ${(hit.snippet ?? "").slice(0, 120)}`,
        };
      }
    }
  }

  return null;
}

async function resolveViaTimelineScan(
  client: ChettoTier2ResolveInput,
  options: ChettoTier2ResolveOptions,
): Promise<ChettoTier2ResolveResult | null> {
  const phoneVariants = chettoPhoneLookupVariants(client.phone);
  if (phoneVariants.length === 0) return null;

  const maxGroups = options.maxTimelineGroups ?? 50;
  const pageSize = options.timelinePageSize ?? 30;
  const groupIds = await listAllGroupIds({
    queendom: client.queendom ?? undefined,
  });

  for (const groupId of groupIds.slice(0, maxGroups)) {
    const timeline = await getGroupTimeline(groupId, pageSize, undefined, {
      queendom: client.queendom ?? undefined,
    });
    if (timeline.timelineNotAvailable || timeline.messages.length === 0) continue;

    for (const msg of timeline.messages) {
      if (msg.from_me || !msg.phone_no) continue;
      const msgVariants = chettoPhoneLookupVariants(msg.phone_no);
      if (!phoneVariantsIntersect(phoneVariants, msgVariants)) continue;

      const snippet = (msg.text ?? "").slice(0, 100);
      return {
        groupId,
        confidence: 88,
        method: "timeline",
        evidence: `Client phone in group timeline${snippet ? `: "${snippet}"` : ""}`,
      };
    }
  }

  return null;
}

async function resolveViaInsights(
  client: ChettoTier2ResolveInput,
): Promise<ChettoTier2ResolveResult | null> {
  const parentOrgId = process.env.CHETTO_ORG_ID?.trim();
  if (!parentOrgId) return null;

  const name = [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
  const question = [
    "Which WhatsApp concierge group belongs to this Indulge member?",
    `Name: ${name || "unknown"}`,
    `Phone: ${client.phone}`,
    client.queendom ? `Queendom: ${client.queendom}` : null,
    "",
    'Reply with JSON only: {"group_id":"120363…","group_name":"…","confidence":0-100}',
    'If unknown, reply: {"group_id":null,"confidence":0}',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await askChettoOrgInsights(question, {
    orgId: parentOrgId,
    queendom: client.queendom ?? undefined,
  });
  if ("error" in res) return null;

  const parsed = parseInsightsGroupReply(res.text);
  if (!parsed?.groupId) return null;

  return {
    groupId: parsed.groupId,
    confidence: parsed.confidence,
    method: "insights",
    evidence: `Chetto insights${parsed.groupName ? `: ${parsed.groupName}` : ""}. ${res.text.slice(0, 200)}`,
  };
}

/** Run Tier-2 resolution (search → timeline → insights). Returns best match or null. */
export async function resolveClientChettoTier2(
  client: ChettoTier2ResolveInput,
  options: ChettoTier2ResolveOptions = {},
): Promise<ChettoTier2ResolveResult | null> {
  if (!options.skipSearch) {
    const searchHit = await resolveViaMessageSearch(client);
    if (searchHit) return searchHit;
  }

  if (!options.skipTimeline) {
    const timelineHit = await resolveViaTimelineScan(client, options);
    if (timelineHit) return timelineHit;
  }

  if (!options.skipInsights) {
    const insightsHit = await resolveViaInsights(client);
    if (insightsHit) return insightsHit;
  }

  return null;
}
