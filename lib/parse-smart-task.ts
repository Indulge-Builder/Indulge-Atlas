/**
 * Smart Task Input Parser
 *
 * Extracts structured task data from a natural-language string.
 * Runs on the client only (chrono-node is browser-safe but not needed on server).
 *
 * Examples:
 *   "follow up with karan on 4 feb at 4 pm"
 *     → { title: "Follow up with Karan", subject: "Karan", dueAt: Feb 4 16:00, type: "nurture_followup" }
 *
 *   "call ahmed tomorrow"
 *     → { title: "Call Ahmed", subject: "Ahmed", dueAt: tomorrow 10:00, type: "retry_call" }
 *
 *   "send contract to priya next tuesday at 2:30"
 *     → { title: "Send to Priya", subject: "Priya", dueAt: next tuesday 14:30, type: "send_file" }
 */

import { parse as chronoParse } from "chrono-node";
import type { TaskType } from "@/lib/types/database";

// ── Public types ───────────────────────────────────────────

export interface ParsedTaskInput {
  title: string;
  /** Human-readable remainder after verb stripping (used for task title) */
  subject: string | null;
  /**
   * Single-word first-name token used as the Supabase search query.
   * Built by extractLeadName() — chrono strips dates/times first, then
   * CRM stop-words, leaving only the first clean word.
   */
  leadQuery: string | null;
  dueAt: Date;
  type: TaskType;
  rawInput: string;
  /** true when chrono detected an explicit time phrase in the input */
  hasExplicitTime: boolean;
}

// ── Action detection ───────────────────────────────────────

const ACTION_RULES: { patterns: RegExp[]; type: TaskType; verb: string }[] = [
  {
    patterns: [/\b(call|phone|ring|dial|spoke|speak|called)\b/i],
    type: "call",
    verb: "Call",
  },
  {
    patterns: [/\b(whatsapp|wa|wapp|message|text|msg|chat)\b/i],
    type: "whatsapp_message",
    verb: "WhatsApp",
  },
  {
    patterns: [
      /\b(send|email|e-mail|share|forward|file|doc|document|contract)\b/i,
    ],
    type: "file_dispatch",
    verb: "Send to",
  },
  {
    patterns: [
      /\b(meet|meeting|strategy\s+session|catch\s+up|catchup|sync|intro|introduction)\b/i,
    ],
    type: "strategy_meeting",
    verb: "Meet with",
  },
  {
    patterns: [
      /\b(follow[\s-]?up|followup|check[\s-]?in|reach[\s-]?out|touch[\s-]?base|ping|remind|nurture)\b/i,
    ],
    type: "general_follow_up",
    verb: "Follow up with",
  },
];

function detectAction(input: string): { type: TaskType; verb: string } {
  for (const rule of ACTION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(input)) {
        return { type: rule.type, verb: rule.verb };
      }
    }
  }
  return { type: "general_follow_up", verb: "Follow up" };
}

// ── Date parsing ───────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function setNineAM(d: Date): Date {
  d.setHours(9, 0, 0, 0);
  return d;
}

function nearestUpcomingWeekday(dayIndex: number, from: Date): Date {
  const d = new Date(from);
  const diff = (dayIndex - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return setNineAM(d);
}

function parseDateAndExtract(
  input: string,
  fallback: Date,
): { date: Date; removedText: string } {
  const lower = input.toLowerCase();
  const now = new Date();

  // "today"
  if (/\btoday\b/.test(lower)) {
    return { date: setNineAM(new Date(now)), removedText: "today" };
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return { date: setNineAM(d), removedText: "tomorrow" };
  }

  // "next week"
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return { date: setNineAM(d), removedText: "next week" };
  }

  // "in <n> days"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDaysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(inDaysMatch[1]));
    return { date: setNineAM(d), removedText: inDaysMatch[0] };
  }

  // "next <weekday>"
  const nextDayMatch = lower.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (nextDayMatch) {
    const idx = WEEKDAYS.indexOf(nextDayMatch[1] as (typeof WEEKDAYS)[number]);
    const d = new Date(now);
    d.setDate(d.getDate() + ((idx + 7 - d.getDay()) % 7 || 7));
    return { date: setNineAM(d), removedText: nextDayMatch[0] };
  }

  // "this <weekday>"
  const thisDayMatch = lower.match(
    /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (thisDayMatch) {
    const idx = WEEKDAYS.indexOf(thisDayMatch[1] as (typeof WEEKDAYS)[number]);
    return {
      date: nearestUpcomingWeekday(idx, now),
      removedText: thisDayMatch[0],
    };
  }

  // standalone weekday: "on monday", "monday", etc.
  const onDayMatch = lower.match(
    /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (onDayMatch) {
    const idx = WEEKDAYS.indexOf(onDayMatch[1] as (typeof WEEKDAYS)[number]);
    return {
      date: nearestUpcomingWeekday(idx, now),
      removedText: onDayMatch[0],
    };
  }

  // "<day> <month>" — "4 feb", "4th february", "4 February"
  const dmRx =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const dmMatch = lower.match(dmRx);
  if (dmMatch) {
    const day = parseInt(dmMatch[1]);
    const monthKey = dmMatch[2].slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey] ?? MONTHS[dmMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return { date: setNineAM(d), removedText: dmMatch[0] };
    }
  }

  // "<month> <day>" — "feb 4", "February 4th"
  const mdRx =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const mdMatch = lower.match(mdRx);
  if (mdMatch) {
    const monthKey = mdMatch[1].slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey] ?? MONTHS[mdMatch[1].toLowerCase()];
    const day = parseInt(mdMatch[2]);
    if (month !== undefined) {
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return { date: setNineAM(d), removedText: mdMatch[0] };
    }
  }

  // dd/mm shorthand
  const numDateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (numDateMatch) {
    const day = parseInt(numDateMatch[1]);
    const month = parseInt(numDateMatch[2]) - 1;
    const d = new Date(now.getFullYear(), month, day);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return { date: setNineAM(d), removedText: numDateMatch[0] };
  }

  return { date: fallback, removedText: "" };
}

// ── Subject extraction ─────────────────────────────────────

const NOISE = new Set([
  "a",
  "an",
  "the",
  "with",
  "to",
  "for",
  "about",
  "on",
  "at",
  "in",
  "by",
  "from",
  "and",
  "or",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "regarding",
  "re",
  "up",
  "out",
]);

// Strips all known action verbs and their common compounds
const ACTION_STRIP =
  /\b(follow[\s-]?up|check[\s-]?in|reach[\s-]?out|touch[\s-]?base|catch[\s-]?up|call|phone|ring|dial|whatsapp|wa|message|text|msg|chat|send|email|e-mail|share|forward|meet|meeting|strategy|session|sync|intro|introduction|ping|remind|nurture|spoke|speak|document|contract|file|doc)\b/gi;

function extractSubject(input: string, removedDateText: string): string | null {
  let s = input;

  // Remove date text first
  if (removedDateText) {
    s = s.replace(
      new RegExp(
        `\\b${removedDateText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "gi",
      ),
      " ",
    );
  }

  // Strip date connectors
  s = s.replace(/\b(on|by|before|after|at|in)\b\s*/gi, " ");

  // Strip action keywords
  s = s.replace(ACTION_STRIP, " ");

  // Strip noise words
  s = s.replace(/\b(with|to|for|about|the|a|an|regarding|re)\b/gi, " ");

  const tokens = s
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9'-]/g, ""))
    .filter((t) => t.length > 1 && !NOISE.has(t.toLowerCase()));

  if (tokens.length === 0) return null;

  return tokens
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(" ");
}

// ── Lead-name extraction ──────────────────────────────────
//
// More aggressive than extractSubject: strips ALL chrono-detected
// date/time text AND a wide set of CRM action/filler words, then
// returns ONLY the first remaining token — the likely first name.
//
// e.g. "whatsapp arfam details at 4 pm"  → "Arfam"
//      "follow up with karan tomorrow"    → "Karan"
//      "send whatsapp details to priya"   → "Priya"

// Phrases ordered longest-first so multi-word phrases are stripped
// before their constituent single words.
const LEAD_NAME_STOP_WORDS = [
  "send whatsapp details to",
  "send whatsapp details",
  "send whatsapp to",
  "whatsapp details to",
  "whatsapp details",
  "follow up with",
  "follow up",
  "followup",
  "check in",
  "reach out",
  "touch base",
  "catch up",
  "remind me to",
  "remind me",
  "call",
  "phone",
  "ring",
  "dial",
  "whatsapp",
  "wa",
  "message",
  "text",
  "msg",
  "chat",
  "send",
  "email",
  "share",
  "forward",
  "meet",
  "meeting",
  "sync",
  "intro",
  "remind",
  "nurture",
  "ping",
  "spoke",
  "speak",
  "details",
  "info",
  "information",
  "contact",
  "update",
  "follow",
  "with",
  "to",
  "for",
  "about",
  "up",
  "out",
];

export function extractLeadName(rawText: string): string | null {
  let cleaned = rawText;

  // Step 1: Strip every date/time phrase chrono can detect.
  // We sort by text-length descending so longer matches are removed
  // before their substrings (avoids orphan words like "at", "pm").
  try {
    const results = chronoParse(rawText);
    const byLength = [...results].sort((a, b) => b.text.length - a.text.length);
    for (const r of byLength) {
      cleaned = cleaned.replace(r.text, " ");
    }
  } catch {
    /* ignore */
  }

  // Step 2: Strip CRM stop words (longest phrases first).
  for (const word of LEAD_NAME_STOP_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`\\b${escaped}\\b`, "gi");
    cleaned = cleaned.replace(rx, " ");
  }

  // Step 3: Remove punctuation and collapse whitespace.
  cleaned = cleaned
    .replace(/[^a-zA-Z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Step 4: The first remaining word is the first name.
  const firstWord = cleaned.split(/\s+/)[0] ?? "";
  if (firstWord.length < 2) return null;

  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

// ── Public API ─────────────────────────────────────────────

export function parseSmartInput(
  input: string,
  fallbackDate: Date = new Date(),
): ParsedTaskInput {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      title: "",
      subject: null,
      leadQuery: null,
      dueAt: fallbackDate,
      type: "general_follow_up",
      rawInput: "",
      hasExplicitTime: false,
    };
  }

  const { type, verb } = detectAction(trimmed);
  const { date, removedText } = parseDateAndExtract(trimmed, fallbackDate);
  const subject = extractSubject(trimmed, removedText);
  const leadQuery = extractLeadName(trimmed);

  // Apply chrono-extracted time to the resolved calendar date.
  const timeResult = (() => {
    try {
      const results = chronoParse(trimmed, date, { forwardDate: true });
      if (results.length > 0 && results[0].start.isCertain("hour")) {
        return {
          hours: results[0].start.get("hour") ?? 10,
          minutes: results[0].start.get("minute") ?? 0,
          hasExplicitTime: true,
        };
      }
    } catch {
      /* fall through */
    }
    return { hours: 10, minutes: 0, hasExplicitTime: false };
  })();

  date.setHours(timeResult.hours, timeResult.minutes, 0, 0);

  const title = subject ? `${verb} ${subject}` : verb;

  return {
    title,
    subject,
    leadQuery,
    dueAt: date,
    type,
    rawInput: trimmed,
    hasExplicitTime: timeResult.hasExplicitTime,
  };
}

// ── Display helpers ────────────────────────────────────────

export const TASK_TYPE_LABELS: Record<string, string> = {
  call: "Call",
  general_follow_up: "Follow-up",
  whatsapp_message: "WhatsApp",
  file_dispatch: "Send File",
  strategy_meeting: "Meeting",
  budget_approval: "Budget Review",
  campaign_review: "Campaign Review",
  performance_analysis: "Performance Analysis",
};

/** Extracts a best-guess subject name from an existing task title */
export function subjectFromTitle(title: string): string {
  return title
    .replace(
      /^(Call|Follow up with|WhatsApp|Message|Send to|Meet with|Follow up|Send file to|Send)\s+/i,
      "",
    )
    .trim();
}
