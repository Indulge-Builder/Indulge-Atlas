/**
 * Store reader — the trainee UI's only data source. Reads the committed,
 * anonymised seed and never touches Freshdesk or any member table at runtime.
 *
 * The seed is a plain JSON file produced by the ingest CLI (or the synthetic
 * seed generator). We validate its schema version on load so a store built by an
 * older/newer ingest is rejected loudly rather than mis-scored.
 */
import seed from "@/training/store/scenarios.seed.json";
import type { Scenario, ScenarioStore } from "@/training/types";
import { TRAINING_SCHEMA_VERSION } from "@/training/types";

const store = seed as unknown as ScenarioStore;

function assertVersion(): void {
  if (store.schemaVersion !== TRAINING_SCHEMA_VERSION) {
    throw new Error(
      `Training store schema mismatch: file is v${store.schemaVersion}, code expects v${TRAINING_SCHEMA_VERSION}. Re-run the ingest.`,
    );
  }
}

export function getStoreMeta(): Pick<ScenarioStore, "generatedAt" | "source" | "schemaVersion"> {
  assertVersion();
  return { generatedAt: store.generatedAt, source: store.source, schemaVersion: store.schemaVersion };
}

export function getScenarios(): Scenario[] {
  assertVersion();
  return store.scenarios;
}

export function getScenarioById(id: string): Scenario | null {
  assertVersion();
  return store.scenarios.find((s) => s.id === id) ?? null;
}

export interface ScenarioGroup {
  /** Grouping key: subcategory when present, else category, else "Uncategorised". */
  key: string;
  label: string;
  /** True when this bucket only exists because sub-category is missing upstream. */
  needsBackfill: boolean;
  scenarios: Scenario[];
}

/**
 * Group scenarios for the list view. Sub-category is the intended grouping axis
 * but is ~59% empty in source data, so scenarios that lack it fall back to
 * category (then "Uncategorised") and the group is flagged `needsBackfill`.
 */
export function getScenarioGroups(): ScenarioGroup[] {
  assertVersion();
  const map = new Map<string, ScenarioGroup>();
  for (const s of store.scenarios) {
    const key = s.subcategory ?? s.category ?? "__uncategorised__";
    const label = s.subcategory ?? s.category ?? "Uncategorised";
    const needsBackfill = s.subcategory == null;
    const g = map.get(key) ?? { key, label, needsBackfill, scenarios: [] };
    g.scenarios.push(s);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
