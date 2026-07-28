/**
 * Environment-robust seed generator (plain Node, no TS/tsx).
 *
 *   node training/scripts/build-seed.mjs
 *
 * WHY THIS EXISTS: build-seed.ts is the canonical generator (it runs the real
 * buildScenario + anonymiser pipeline). But this repo lives on OneDrive, where
 * tsx's ESM loader intermittently fails with `UNKNOWN: unknown error, read`
 * (errno -4094). Plain `node` reads fine, so this mirror produces the committed
 * artifact in constrained environments. It MUST stay in lockstep with
 * training/ingest/scenarioBuilder.ts + anonymise.ts. Fixtures are FICTIONAL.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_VERSION = 1;
const SLA = { firstResponseMinutes: 60, resolutionMinutes: 24 * 60 };

// —— mirror of scenarioBuilder.ts (pass-through anonymiser: fixtures carry no PII) ——
const scenarioId = (id, salt) =>
  "scn_" + createHash("sha256").update(`${id}:${salt}`).digest("hex").slice(0, 12);

const mapPriority = (p) => ({ 1: "low", 2: "medium", 3: "high", 4: "urgent" }[p] ?? "medium");
const toConcierge = (p) => (p === "high" ? "urgent" : p);
const toFinalStatus = (s) => (s === 5 ? "closed" : "resolved");
const offsetMs = (from, to) => (to ? Math.max(0, Date.parse(to) - Date.parse(from)) : null);
const collapse = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const FIELD_MAP = [
  ["cf_request", "Request"],
  ["cf_events", "Event / Service"],
  ["cf_from_location", "From"],
  ["cf_to_location", "To"],
  ["cf_date", "Date"],
  ["cf_time", "Time"],
  ["cf_duration", "Duration"],
  ["cf_pax", "Guests"],
  ["cf_budget", "Budget"],
  ["cf_location", "Location"],
  ["cf_airport", "Airport"],
  ["cf_early_check_in", "Early Check-in"],
  ["cf_assistance_required", "Assistance"],
  ["cf_gift_specifications", "Gift Details"],
  ["cf_product_details", "Product Details"],
];

function synthesizeOpening(cf, subject) {
  const core = collapse(cf.cf_request || subject || "I have a request");
  const bits = [core];
  const route =
    cf.cf_from_location && cf.cf_to_location
      ? `from ${cf.cf_from_location} to ${cf.cf_to_location}`
      : cf.cf_location
        ? `in ${cf.cf_location}`
        : null;
  if (route) bits.push(route);
  if (cf.cf_date) bits.push(`for ${cf.cf_date}${cf.cf_time ? ` at ${cf.cf_time}` : ""}`);
  if (cf.cf_pax) bits.push(`for ${cf.cf_pax} guests`);
  if (cf.cf_budget) bits.push(`budget ${cf.cf_budget}`);
  return `Hi, ${bits.join(", ")}. Can you help?`;
}

const expectedPath = (final) =>
  final === "closed" ? ["open", "pending", "resolved", "closed"] : ["open", "pending", "resolved"];

function build(f) {
  const cf = f.cf;
  const priority = toConcierge(mapPriority(f.priority));
  const finalStatus = toFinalStatus(f.status);
  const fr = offsetMs(f.createdAt, f.firstResponseAt);
  const res = offsetMs(f.createdAt, f.resolvedAt);
  const close = offsetMs(f.createdAt, f.closedAt);

  const events = [{ offsetMs: 0, kind: "member_opened", label: "Member's request arrives" }];
  if (fr != null) events.push({ offsetMs: fr, kind: "agent_first_response", label: "Genie's first response" });
  if (res != null) events.push({ offsetMs: res, kind: "resolved", label: "Resolved", status: "resolved" });
  if (close != null) events.push({ offsetMs: close, kind: "closed", label: "Closed", status: "closed" });
  if (f.escalated) events.push({ offsetMs: fr ?? 0, kind: "escalated", label: "Escalated" });
  events.sort((a, b) => a.offsetMs - b.offsetMs);

  const subcategory = (cf.cf_ticket_type && cf.cf_ticket_type.trim()) || null;
  const requestFields = [];
  for (const [k, label] of FIELD_MAP) {
    const v = collapse(cf[k]);
    if (v) requestFields.push({ label, value: v });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: scenarioId(f.id, "synthetic-seed-salt"),
    title: collapse(f.subject),
    category: (f.type && f.type.trim()) || null,
    subcategory,
    subcategoryBackfillNeeded: subcategory == null,
    priority,
    openingMessage: synthesizeOpening(cf, f.subject),
    requestFields,
    slaFirstResponseMinutes: SLA.firstResponseMinutes,
    slaResolutionMinutes: SLA.resolutionMinutes,
    events,
    groundTruth: {
      firstResponseOffsetMs: fr,
      resolutionOffsetMs: res,
      closedOffsetMs: close,
      escalated: f.escalated,
      escalatedOffsetMs: null,
      finalStatus,
      expectedPath: expectedPath(finalStatus),
    },
    redactionCount: 0,
  };
}

const FIXTURES = [
  { id: 9001, subject: "Car booking from Coral Bay Hotel to airport — 12th Aug", type: "Travel", cf: { cf_ticket_type: "Ground Transport", cf_request: "Sedan from Coral Bay Hotel to the international airport", cf_from_location: "Coral Bay Hotel", cf_to_location: "International Airport", cf_date: "12 Aug", cf_time: "6:30 AM", cf_pax: "2" }, priority: 2, status: 4, createdAt: "2026-08-11T04:00:00.000Z", firstResponseAt: "2026-08-11T04:22:00.000Z", resolvedAt: "2026-08-11T09:10:00.000Z", closedAt: null, escalated: false },
  { id: 9002, subject: "Urgent: pharmacy delivery to Marisol Suites by 3 PM", type: "Lifestyle", cf: { cf_ticket_type: "Medical / Pharmacy", cf_request: "One pack of paracetamol and rehydration salts delivered to the room", cf_location: "Marisol Suites, Room 214", cf_date: "today", cf_time: "before 3 PM" }, priority: 4, status: 4, createdAt: "2026-08-14T06:00:00.000Z", firstResponseAt: "2026-08-14T06:08:00.000Z", resolvedAt: "2026-08-14T08:40:00.000Z", closedAt: null, escalated: false },
  { id: 9003, subject: "4 twin rooms near Lakeview Lodge, 27–31 Aug", type: "Travel", cf: { cf_request: "Four twin-sharing rooms near Lakeview Lodge for four nights", cf_location: "Lakeview Lodge area", cf_date: "27–31 Aug", cf_pax: "8", cf_budget: "under 90k total" }, priority: 1, status: 5, createdAt: "2026-08-22T05:00:00.000Z", firstResponseAt: "2026-08-22T18:30:00.000Z", resolvedAt: "2026-08-27T05:00:00.000Z", closedAt: "2026-08-28T05:00:00.000Z", escalated: true },
  { id: 9004, subject: "Anniversary dinner reservation for two, rooftop preferred", type: "Dining", cf: { cf_ticket_type: "Restaurant Reservation", cf_request: "Rooftop table for two for an anniversary, sunset slot", cf_date: "19 Aug", cf_time: "7:30 PM", cf_pax: "2" }, priority: 2, status: 4, createdAt: "2026-08-18T09:00:00.000Z", firstResponseAt: "2026-08-18T09:35:00.000Z", resolvedAt: "2026-08-18T14:00:00.000Z", closedAt: null, escalated: false },
  { id: 9005, subject: "Birthday gift sourcing — limited-edition fountain pen", type: "Shopping", cf: { cf_ticket_type: "Gifting", cf_request: "Source a limited-edition fountain pen as a birthday gift", cf_gift_specifications: "navy barrel, medium nib, gift-wrapped", cf_budget: "up to 40k", cf_date: "by 25 Aug" }, priority: 3, status: 4, createdAt: "2026-08-20T07:00:00.000Z", firstResponseAt: "2026-08-20T07:50:00.000Z", resolvedAt: "2026-08-24T10:00:00.000Z", closedAt: null, escalated: false },
  { id: 9006, subject: "Yacht charter enquiry for a day trip, 6 guests", type: "Experiences", cf: { cf_request: "Half-day yacht charter for six guests with catering", cf_pax: "6", cf_date: "2 Sep", cf_budget: "premium, flexible" }, priority: 3, status: 5, createdAt: "2026-08-29T03:00:00.000Z", firstResponseAt: "2026-08-29T14:00:00.000Z", resolvedAt: "2026-09-01T09:00:00.000Z", closedAt: "2026-09-02T09:00:00.000Z", escalated: true },
];

const store = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: "2026-07-25T00:00:00.000Z",
  source: "synthetic-seed",
  scenarios: FIXTURES.map(build),
};

const out = join(process.cwd(), "training", "store", "scenarios.seed.json");
writeFileSync(out, JSON.stringify(store, null, 2), "utf8");
console.log(`[build-seed.mjs] wrote ${store.scenarios.length} scenarios → ${out}`);
