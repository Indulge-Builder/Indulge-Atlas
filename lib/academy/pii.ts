/**
 * PII detector for the seed editor.
 *
 * Seeds must contain ONLY synthetic data — a trainer pasting a real ticket is a
 * named pre-mortem risk. `detectPII` runs on save (server action + client-side
 * warning). Same regex philosophy as `training/ingest/anonymise.ts`, tuned to
 * flag rather than scrub (the trainer fixes the text, we never mutate it).
 *
 * Pure module — safe to import on client and server.
 */

export type PiiKind = "email" | "phone" | "long_number" | "url" | "handle";

export interface PiiHit {
  kind: PiiKind;
  sample: string;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// +country / bracketed / spaced phone-like runs (>= 9 digits total).
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const HANDLE = /(?:^|\s)@[A-Za-z0-9_.]{3,}/g;
// Any standalone run of 7+ digits (account/invoice/card fragments).
const LONG_NUMBER = /\b\d{7,}\b/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Return the PII hits found in `text`. Empty array = clean. Phone detection is
 * conservative: a match only counts when it carries >= 9 digits, so ordinary
 * prose ("table for four", "two hours") never trips it.
 */
export function detectPII(text: string): PiiHit[] {
  if (!text) return [];
  const hits: PiiHit[] = [];
  const seen = new Set<string>();

  const push = (kind: PiiKind, sample: string) => {
    const key = `${kind}:${sample.trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, sample: sample.trim().slice(0, 60) });
  };

  for (const m of text.matchAll(EMAIL)) push("email", m[0]);
  for (const m of text.matchAll(URL)) push("url", m[0]);
  for (const m of text.matchAll(HANDLE)) push("handle", m[0].trim());
  for (const m of text.matchAll(PHONE)) {
    if (digitsOnly(m[0]).length >= 9) push("phone", m[0]);
  }
  for (const m of text.matchAll(LONG_NUMBER)) push("long_number", m[0]);

  return hits;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  archetype: "Archetype",
  opening_message: "Opening message",
  escalation_trigger: "Escalation trigger",
  ideal_outcome: "Ideal outcome",
};

/**
 * Scan every free-text field of a seed draft. Returns one issue string per
 * offending (field, hit) pair, ready to surface to the trainer.
 */
export function scanSeedForPII(seed: {
  title?: string;
  archetype?: string;
  opening_message?: string;
  escalation_trigger?: string;
  ideal_outcome?: string;
  hidden_constraints?: { label?: string; reveal_when?: string; value?: string }[];
}): string[] {
  const issues: string[] = [];

  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const value = (seed as Record<string, unknown>)[field];
    if (typeof value !== "string") continue;
    for (const hit of detectPII(value)) {
      issues.push(`${label}: looks like a ${hit.kind.replace("_", " ")} — "${hit.sample}"`);
    }
  }

  for (const [i, c] of (seed.hidden_constraints ?? []).entries()) {
    for (const part of [c.label, c.reveal_when, c.value]) {
      if (typeof part !== "string") continue;
      for (const hit of detectPII(part)) {
        issues.push(
          `Hidden constraint ${i + 1}: looks like a ${hit.kind.replace("_", " ")} — "${hit.sample}"`,
        );
      }
    }
  }

  return issues;
}
