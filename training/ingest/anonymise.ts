/**
 * One-way anonymiser — runs at ingest, before any text lands in the training
 * store. Destructive by construction: it REPLACES matches with fixed labels and
 * keeps no reversible token map, so the store can never be re-identified.
 *
 * Structured schema fields catch the obvious PII (name/phone columns). This pass
 * catches PII embedded in free text — "book the Assagao villa", "call me on
 * +91 98…", "@handle", invoice numbers — that schema-stripping misses.
 *
 * The trainer additionally never ingests raw member dialogue (there is none in
 * Freshdesk) or internal-note bodies; only structured subject/cf_* text and
 * timestamps reach this function. This is defence-in-depth, not the only line.
 *
 * Pure + deterministic. NOT a "use server" module.
 */

export interface AnonymiseOptions {
  /** The requester's real name(s); every token is scrubbed to "the member". */
  requesterNames?: (string | null | undefined)[];
  /**
   * Extra literal terms to redact (locations, villa names, vendor-of-record, …).
   * Case-insensitive, whole-word. This is the operator's lever for the proper-noun
   * PII a regex can't infer (e.g. "Assagao"). Grows over time; treated as config.
   */
  denylist?: string[];
}

export interface AnonymiseResult {
  text: string;
  redactions: number;
}

const MEMBER = "the member";

/** Rules applied in order. Order matters: emails/urls before bare digit runs. */
const RULES: { re: RegExp; replacement: string }[] = [
  // emails
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[email]" },
  // urls (http/https/www, and bare maps.app.goo.gl-style hosts)
  { re: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, replacement: "[link]" },
  {
    re: /\b(?:[a-z0-9-]+\.)+(?:com|in|co|net|org|ai|io|app|goo\.gl)(?:\/[^\s<>()]*)?/gi,
    replacement: "[link]",
  },
  // social handles
  { re: /(?<![A-Za-z0-9._%+-])@[A-Za-z0-9._]{2,}/g, replacement: "[handle]" },
  // invoice / doc numbers e.g. INV2627-010141
  { re: /\bINV[A-Z0-9-]*\d[A-Z0-9-]*/gi, replacement: "[invoice]" },
  // phone numbers: +CC and separators, or 10+ digit runs
  {
    re: /(?:\+\d[\d\s().-]{7,}\d)/g,
    replacement: "[phone]",
  },
  // any remaining standalone run of 6+ digits (booking refs, ids, order nos)
  { re: /(?<!\[)\b\d{6,}\b/g, replacement: "[ref]" },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split a full name into scrub tokens: whole name + individual name parts (len>=3). */
function nameTokens(names: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    if (!raw) continue;
    // Strip common concierge wrappers: "(Private) Vijay's Concierge" -> "Vijay"
    const cleaned = raw
      .replace(/\(private\)/gi, " ")
      .replace(/'s\s+concierge/gi, " ")
      .replace(/\bconcierge\b/gi, " ")
      .replace(/[()]/g, " ")
      .trim();
    if (cleaned.length >= 3) out.add(cleaned);
    for (const part of cleaned.split(/[\s'’.]+/)) {
      const p = part.trim();
      if (p.length >= 3 && !/^(the|and|mrs?|mr|ms|dr)$/i.test(p)) out.add(p);
    }
  }
  // longest first so "Vijay Kumar" scrubs before "Vijay"
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Anonymise a single string, one-way. Returns the scrubbed text and a count of
 * how many redactions fired (for the store's audit trail).
 */
export function anonymiseText(
  input: string | null | undefined,
  options: AnonymiseOptions = {},
): AnonymiseResult {
  if (!input) return { text: "", redactions: 0 };
  let text = String(input);
  let redactions = 0;

  const bump = (replacement: string) => (): string => {
    redactions += 1;
    return replacement;
  };

  // 1. Requester name tokens → "the member"
  for (const token of nameTokens(options.requesterNames ?? [])) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(token)}(?![\\p{L}])`, "giu");
    text = text.replace(re, bump(MEMBER));
  }

  // 2. Operator denylist (locations / proper nouns) → [redacted]
  for (const term of options.denylist ?? []) {
    const t = term.trim();
    if (!t) continue;
    const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(t)}(?![\\p{L}])`, "giu");
    text = text.replace(re, bump("[redacted]"));
  }

  // 3. Pattern rules (emails, links, handles, invoices, phones, digit runs)
  for (const { re, replacement } of RULES) {
    text = text.replace(re, bump(replacement));
  }

  // 4. Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return { text, redactions };
}

/** Anonymise the value of a labelled field; drops the field if it empties out. */
export function anonymiseField(
  label: string,
  value: string | null | undefined,
  options: AnonymiseOptions,
): { label: string; value: string; redactions: number } | null {
  const { text, redactions } = anonymiseText(value, options);
  if (!text || text === "[redacted]") return null;
  return { label, value: text, redactions };
}
