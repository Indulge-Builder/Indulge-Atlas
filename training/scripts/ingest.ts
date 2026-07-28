/**
 * Genie Trainer — read-only ingest CLI (operator-run).
 *
 *   npx tsx training/scripts/ingest.ts [--max-clients N] [--max-scenarios N] [--dry-run]
 *
 * Pulls COMPLETED Freshdesk tickets (GET only, via the read-only source), builds
 * anonymised Scenarios, and writes the committed store at
 * training/store/scenarios.seed.json. It performs ZERO writes against Freshdesk
 * or any member system — the source module exposes no write surface.
 *
 * The store it produces holds no raw PII: every string passes through the one-way
 * anonymiser, and no free-text member/agent bodies are ingested at all (only
 * structured subject/cf_* fields and status timestamps).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScenario } from "@/training/ingest/scenarioBuilder";
import {
  SLA_DEFAULTS,
  fetchCompletedTicketsForRequester,
  listAllContacts,
} from "@/training/ingest/freshdeskReadSource";
import type { Scenario, ScenarioStore } from "@/training/types";
import { TRAINING_SCHEMA_VERSION } from "@/training/types";

/** Proper-noun PII a regex can't infer. Grow this over time (config, not code). */
const DENYLIST: string[] = [
  // e.g. "Assagao", "Mansarovar" — villa/estate/location names seen in subjects.
];

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

async function main(): Promise<void> {
  if (!process.env.FRESHDESK_API_KEY?.trim()) {
    throw new Error("FRESHDESK_API_KEY is required (read-only). Set it before running ingest.");
  }
  const maxClients = arg("--max-clients", 25);
  const maxScenarios = arg("--max-scenarios", 200);
  const dryRun = process.argv.includes("--dry-run");
  const idSalt = process.env.TRAINING_ID_SALT?.trim() || "atlas-genie-trainer";

  console.log(`[ingest] read-only · maxClients=${maxClients} maxScenarios=${maxScenarios} dryRun=${dryRun}`);

  const contacts = (await listAllContacts()).slice(0, maxClients);
  const scenarios: Scenario[] = [];

  for (const contact of contacts) {
    if (scenarios.length >= maxScenarios) break;
    let tickets;
    try {
      tickets = await fetchCompletedTicketsForRequester(contact.id);
    } catch (e) {
      console.warn(`[ingest] skip contact ${contact.id}: ${(e as Error).message}`);
      continue;
    }
    for (const ticket of tickets) {
      if (scenarios.length >= maxScenarios) break;
      scenarios.push(
        buildScenario({
          ticket,
          requesterNames: [contact.name, contact.first_name, contact.last_name],
          slaFirstResponseMinutes: SLA_DEFAULTS.firstResponseMinutes,
          slaResolutionMinutes: SLA_DEFAULTS.resolutionMinutes,
          idSalt,
          denylist: DENYLIST,
        }),
      );
    }
    console.log(`[ingest] ${contact.id}: ${tickets.length} completed → ${scenarios.length} scenarios so far`);
  }

  const store: ScenarioStore = {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    // Date.now via a CLI is fine here (not a Workflow script).
    generatedAt: new Date().toISOString(),
    source: "freshdesk-readonly-ingest",
    scenarios,
  };

  const totalRedactions = scenarios.reduce((n, s) => n + s.redactionCount, 0);
  console.log(`[ingest] built ${scenarios.length} scenarios · ${totalRedactions} redactions applied`);

  if (dryRun) {
    console.log("[ingest] --dry-run: not writing the store.");
    return;
  }
  const out = join(process.cwd(), "training", "store", "scenarios.seed.json");
  writeFileSync(out, JSON.stringify(store, null, 2), "utf8");
  console.log(`[ingest] wrote ${out}`);
}

main().catch((e) => {
  console.error("[ingest] failed:", e);
  process.exitCode = 1;
});
