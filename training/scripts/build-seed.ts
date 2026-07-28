/**
 * Synthetic seed generator — produces a committed, PII-free store so the trainee
 * app runs without live Freshdesk access.
 *
 *   npx tsx training/scripts/build-seed.ts
 *
 * These tickets are FICTIONAL (invented names/places/timings) but shaped exactly
 * like real Freshdesk tickets, then pushed through the SAME buildScenario +
 * anonymiser pipeline the production ingest uses — so the seed exercises the real
 * code path and its output is guaranteed to match the Scenario type.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FreshdeskTicket } from "@/lib/freshdesk/types";
import { buildScenario } from "@/training/ingest/scenarioBuilder";
import { SLA_DEFAULTS } from "@/training/ingest/freshdeskReadSource";
import type { ScenarioStore } from "@/training/types";
import { TRAINING_SCHEMA_VERSION } from "@/training/types";

type Fixture = {
  id: number;
  subject: string;
  type: string | null;
  cf: Record<string, string | null>;
  priority: number; // 1 low · 2 med · 3 high · 4 urgent
  status: number; // 4 resolved · 5 closed
  requesterName: string;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  escalated: boolean;
};

function ticketOf(f: Fixture): FreshdeskTicket {
  return {
    id: f.id,
    subject: f.subject,
    description: null,
    description_text: null,
    status: f.status,
    priority: f.priority,
    type: f.type,
    source: 13,
    created_at: f.createdAt,
    updated_at: f.closedAt ?? f.resolvedAt ?? f.createdAt,
    due_by: null,
    fr_due_by: null,
    is_escalated: f.escalated,
    requester_id: 1000 + f.id,
    responder_id: null,
    group_id: null,
    tags: [],
    stats: {
      agent_responded_at: f.firstResponseAt,
      requester_responded_at: null,
      first_responded_at: f.firstResponseAt,
      resolved_at: f.resolvedAt,
      closed_at: f.closedAt,
    },
    custom_fields: f.cf,
  };
}

// All fictional. Names/places invented; timings crafted to exercise scoring.
const FIXTURES: Fixture[] = [
  {
    id: 9001,
    subject: "Car booking from Coral Bay Hotel to airport — 12th Aug",
    type: "Travel",
    cf: {
      cf_ticket_type: "Ground Transport",
      cf_request: "Sedan from Coral Bay Hotel to the international airport",
      cf_from_location: "Coral Bay Hotel",
      cf_to_location: "International Airport",
      cf_date: "12 Aug",
      cf_time: "6:30 AM",
      cf_pax: "2",
    },
    priority: 2,
    status: 4,
    requesterName: "Priya Menon",
    createdAt: "2026-08-11T04:00:00.000Z",
    firstResponseAt: "2026-08-11T04:22:00.000Z",
    resolvedAt: "2026-08-11T09:10:00.000Z",
    closedAt: null,
    escalated: false,
  },
  {
    id: 9002,
    subject: "Urgent: pharmacy delivery to Marisol Suites by 3 PM",
    type: "Lifestyle",
    cf: {
      cf_ticket_type: "Medical / Pharmacy",
      cf_request: "One pack of paracetamol and rehydration salts delivered to the room",
      cf_location: "Marisol Suites, Room 214",
      cf_date: "today",
      cf_time: "before 3 PM",
    },
    priority: 4,
    status: 4,
    requesterName: "Rohan Kapoor",
    createdAt: "2026-08-14T06:00:00.000Z",
    firstResponseAt: "2026-08-14T06:08:00.000Z",
    resolvedAt: "2026-08-14T08:40:00.000Z",
    closedAt: null,
    escalated: false,
  },
  {
    id: 9003,
    subject: "4 twin rooms near Lakeview Lodge, 27–31 Aug",
    type: "Travel",
    cf: {
      // sub-category deliberately MISSING → exercises backfill grouping
      cf_request: "Four twin-sharing rooms near Lakeview Lodge for four nights",
      cf_location: "Lakeview Lodge area",
      cf_date: "27–31 Aug",
      cf_pax: "8",
      cf_budget: "under 90k total",
    },
    priority: 1,
    status: 5,
    requesterName: "Anita Sharma",
    createdAt: "2026-08-22T05:00:00.000Z",
    firstResponseAt: "2026-08-22T18:30:00.000Z", // slow: >8h, breaches SLA
    resolvedAt: "2026-08-27T05:00:00.000Z",
    closedAt: "2026-08-28T05:00:00.000Z",
    escalated: true, // sat overdue → was escalated
  },
  {
    id: 9004,
    subject: "Anniversary dinner reservation for two, rooftop preferred",
    type: "Dining",
    cf: {
      cf_ticket_type: "Restaurant Reservation",
      cf_request: "Rooftop table for two for an anniversary, sunset slot",
      cf_date: "19 Aug",
      cf_time: "7:30 PM",
      cf_pax: "2",
    },
    priority: 2,
    status: 4,
    requesterName: "Vikram Rao",
    createdAt: "2026-08-18T09:00:00.000Z",
    firstResponseAt: "2026-08-18T09:35:00.000Z",
    resolvedAt: "2026-08-18T14:00:00.000Z",
    closedAt: null,
    escalated: false,
  },
  {
    id: 9005,
    subject: "Birthday gift sourcing — limited-edition fountain pen",
    type: "Shopping",
    cf: {
      cf_ticket_type: "Gifting",
      cf_request: "Source a limited-edition fountain pen as a birthday gift",
      cf_gift_specifications: "navy barrel, medium nib, gift-wrapped",
      cf_budget: "up to 40k",
      cf_date: "by 25 Aug",
    },
    priority: 3,
    status: 4,
    requesterName: "Neha Iyer",
    createdAt: "2026-08-20T07:00:00.000Z",
    firstResponseAt: "2026-08-20T07:50:00.000Z",
    resolvedAt: "2026-08-24T10:00:00.000Z",
    closedAt: null,
    escalated: false,
  },
  {
    id: 9006,
    subject: "Yacht charter enquiry for a day trip, 6 guests",
    type: "Experiences",
    cf: {
      // sub-category missing again
      cf_request: "Half-day yacht charter for six guests with catering",
      cf_pax: "6",
      cf_date: "2 Sep",
      cf_budget: "premium, flexible",
    },
    priority: 3,
    status: 5,
    requesterName: "Kabir Nair",
    createdAt: "2026-08-29T03:00:00.000Z",
    firstResponseAt: "2026-08-29T14:00:00.000Z", // 11h → breaches SLA
    resolvedAt: "2026-09-01T09:00:00.000Z",
    closedAt: "2026-09-02T09:00:00.000Z",
    escalated: true,
  },
];

const store: ScenarioStore = {
  schemaVersion: TRAINING_SCHEMA_VERSION,
  generatedAt: "2026-07-25T00:00:00.000Z",
  source: "synthetic-seed",
  scenarios: FIXTURES.map((f) =>
    buildScenario({
      ticket: ticketOf(f),
      requesterNames: [f.requesterName],
      slaFirstResponseMinutes: SLA_DEFAULTS.firstResponseMinutes,
      slaResolutionMinutes: SLA_DEFAULTS.resolutionMinutes,
      idSalt: "synthetic-seed-salt",
    }),
  ),
};

const out = join(process.cwd(), "training", "store", "scenarios.seed.json");
writeFileSync(out, JSON.stringify(store, null, 2), "utf8");
console.log(`[build-seed] wrote ${store.scenarios.length} scenarios → ${out}`);
