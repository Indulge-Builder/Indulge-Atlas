import { formatInTimeZone } from "date-fns-tz";
import { CONCIERGE_CONVERSATION_CONDUCT } from "@/lib/ai/conversationConduct";
import { SYSTEM_TIMEZONE } from "@/lib/utils/time";
import type { EliaProfile } from "@/lib/types/database";

/** System prompt for Elia member-intelligence (context is appended by caller). */
export function eliaSystemPrompt(memberContext: string): string {
  const today = formatInTimeZone(new Date(), SYSTEM_TIMEZONE, "MMMM d, yyyy");
  return `You are Elia, the AI concierge intelligence for Indulge — a luxury lifestyle membership company. You have access to the complete member database below.

Your job is to help the Indulge team instantly answer questions about their members: who has what preferences, who might be interested in a specific experience, which members share characteristics, and so on.

Rules:
- Always refer to members by their first name
- When listing members, format as a clean numbered or bulleted list
- If asked broadly about a specific person, give everything you know about them; if asked one narrow question, answer that question
- Be concise but warm — you are a luxury concierge, not a search engine
- If you don't know something or no members match, say so honestly
- Never make up information that isn't in the database
- Today's date is ${today}

${CONCIERGE_CONVERSATION_CONDUCT}

MEMBER DATABASE:
${memberContext}`;
}

/** Scoped chat: single member context only (used when `clientId` is passed to /api/elia/chat). */
export function eliaClientScopedPrompt(
  clientName: string,
  fullClientProfileText: string,
): string {
  const name = clientName.trim() || "this member";
  return `You are Elia, personal concierge AI for Indulge. You are answering questions about a specific member: ${name}. Here is everything you know about them:

${fullClientProfileText}

Answer agent questions about this member helpfully and concisely. You can reference their preferences, history, and membership details. If asked something you don't know, say so honestly.

${CONCIERGE_CONVERSATION_CONDUCT}`;
}

/**
 * Builds the prompt sent to Claude Haiku for WhatsApp chat profile analysis.
 * Pure function — no I/O, no "use server".
 */
export function buildWhatsAppProfilePrompt(params: {
  existingProfile: EliaProfile | null;
  clientName: string;
  messages: Array<{
    sender: string;
    body: string;
    timestamp: string;
    isClient: boolean;
  }>;
}): string {
  const { existingProfile, clientName, messages } = params;

  const existingProfileJson = existingProfile
    ? JSON.stringify(existingProfile, null, 2)
    : "none";

  const messageLines = messages
    .map((m) => {
      const prefix = m.isClient
        ? `[CLIENT] ${m.sender} (${m.timestamp})`
        : `[STAFF] ${m.sender}`;
      return `${prefix}: ${m.body}`;
    })
    .join("\n");

  return `You are performing client intelligence profiling for Indulge — a luxury lifestyle concierge company serving UHNI (Ultra High Net Worth Individuals). Privacy is critical: be precise and factual only. Do not infer or speculate beyond what the messages explicitly show.

CLIENT NAME: ${clientName}

EXISTING PROFILE:
${existingProfileJson}

NEW MESSAGES:
${messageLines}

Your task: analyse the new messages and return an updated intelligence profile that merges insights with the existing profile. Stronger or newer signals override older ones. Skip sections where there is no evidence in the new messages — preserve existing data for those sections unchanged.

DEDUPLICATION RULE: If a requests.recent entry already exists in the existing profile with the same description and date, do not duplicate it.

SIZE LIMITS (strict — responses must fit in one JSON object):
- requests.recent: at most 12 entries, newest first; each description ≤ 120 characters
- go_to_restaurants, preferred_cuisines, typical_destinations, key_traits: at most 8 items each
- travel_notes, dining_notes, accommodation_notes: one short paragraph each (≤ 300 characters)

Return ONLY a valid JSON object — no markdown, no backticks, no preamble, no explanation. The JSON must match this exact shape:

{
  "summary": "2-3 sentence executive summary of this member for their concierge agent",
  "identity": {
    "sentiment": "positive" | "neutral" | "needs_attention",
    "relationship_strength": "strong" | "developing" | "new" | "at_risk",
    "communication_style": "brief description",
    "key_traits": ["trait1", "trait2"]
  },
  "travel": {
    "preferred_operators": ["operator1"],
    "preferred_cabin": "business / first / null",
    "usual_group_size": "solo / couple / family / null",
    "typical_destinations": ["destination1"],
    "upcoming_trips": [{ "destination": "City", "approximate_date": "Month Year or null" }],
    "travel_notes": "any extra context or null"
  },
  "dining": {
    "preferred_cuisines": ["cuisine1"],
    "dietary_restrictions": ["restriction1"],
    "go_to_restaurants": ["restaurant1"],
    "dining_notes": "any extra context or null"
  },
  "accommodation": {
    "preferred_hotel_chains": ["chain1"],
    "preferred_room_type": "suite / deluxe / null",
    "accommodation_notes": "any extra context or null"
  },
  "requests": {
    "recent": [{ "date": "YYYY-MM-DD", "description": "what they asked for", "status": "pending / completed / cancelled" }],
    "recurring_themes": ["theme1"]
  },
  "milestones": {
    "birthdays": ["name - date"],
    "anniversaries": ["name - date"],
    "other": ["event - date"]
  },
  "sources": {
    "analysis_runs": <existing runs + 1>,
    "message_count_analyzed": <total messages analyzed across all runs>,
    "whatsapp_analyzed_through": "<ISO timestamp of most recent message in this batch>"
  },
  "last_updated_at": "<current ISO timestamp>",
  "last_updated_by": "whatsapp_analysis",
  "version": <existing version + 1>
}`;
}

/** Strip optional markdown fences and extract the outermost JSON object from model text. */
export function parseEliaProfileFromModelText(rawText: string): import("@/lib/types/database").EliaProfile {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("ELIA_PARSE_ERROR: empty response from Claude");

  let candidate = trimmed;
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(trimmed);
  if (fenced) {
    candidate = fenced[1].trim();
  } else {
    candidate = trimmed
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
  }

  const jsonSlice = extractOutermostJsonObject(candidate);
  if (!jsonSlice) {
    throw new Error(
      "ELIA_PARSE_ERROR: response was truncated or incomplete — try again; if it persists, contact support",
    );
  }

  try {
    return JSON.parse(jsonSlice) as import("@/lib/types/database").EliaProfile;
  } catch {
    throw new Error(
      "ELIA_PARSE_ERROR: invalid JSON from model — response may have been cut off; try again",
    );
  }
}

function extractOutermostJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/** Display name from first line of Elia serialized profile (`CLIENT: …`). */
export function parseEliaClientDisplayNameFromProfile(serialized: string): string {
  const line = serialized.split("\n")[0] ?? "";
  const m = /^CLIENT:\s*(.+)$/.exec(line.trim());
  return m?.[1]?.trim() || "this member";
}
