/**
 * Export ALL Freshdesk automation (Workflow Automator) rules + full detail.
 *
 * Rule types:
 *   1 → Ticket Creation (Dispatch'r)
 *   3 → Time Triggers   (Supervisor)
 *   4 → Ticket Updates  (Observer)
 *
 * Admin-only API. Writes to exports/freshdesk-automations-<date>/:
 *   dispatchr.json, supervisor.json, observer.json  (raw rules per type)
 *   _all.json      (combined)
 *   rules.txt      (human-readable: name, state, conditions → actions)
 *   _summary.json  (counts per type + errors)
 *
 * Usage:
 *   npx tsx scripts/fetch-freshdesk-automations.ts
 *   npx tsx scripts/fetch-freshdesk-automations.ts --probe   # counts only, no files
 *   npx tsx scripts/fetch-freshdesk-automations.ts --output=exports/freshdesk-automations-2026-07-03
 */

import * as fs from "fs";
import * as path from "path";
import {
  listAutomationRules,
  type AutomationTypeId,
} from "../lib/freshdesk/client";

const RETRY_DELAYS_MS = [3000, 6000, 12000, 20000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function listWithRetry(
  typeId: AutomationTypeId,
): Promise<Record<string, unknown>[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await listAutomationRules(typeId);
    } catch (e) {
      lastError = e;
      const is429 = e instanceof Error && e.message.includes("429");
      if (is429 && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

const TYPES: { id: AutomationTypeId; key: string; label: string }[] = [
  { id: 1, key: "dispatchr", label: "Ticket Creation (Dispatch'r)" },
  { id: 3, key: "supervisor", label: "Time Triggers (Supervisor)" },
  { id: 4, key: "observer", label: "Ticket Updates (Observer)" },
];

function applyEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function indent(obj: unknown, pad = "    "): string {
  return JSON.stringify(obj, null, 2)
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

function ruleToText(rule: Record<string, unknown>): string {
  const name = String(rule.name ?? "(unnamed)");
  const active = rule.active === false ? "INACTIVE" : "active";
  const position = rule.position ?? "—";
  const outdated = rule.outdated ? " [OUTDATED]" : "";
  const lines: string[] = [];
  lines.push(`● ${name}  (${active}, position ${position})${outdated}`);
  if (rule.id != null) lines.push(`  id: ${rule.id}`);
  if (rule.summary) lines.push(`  summary: ${JSON.stringify(rule.summary)}`);
  if (rule.events !== undefined) {
    lines.push(`  events:`);
    lines.push(indent(rule.events));
  }
  if (rule.conditions !== undefined) {
    lines.push(`  conditions:`);
    lines.push(indent(rule.conditions));
  }
  if (rule.actions !== undefined) {
    lines.push(`  actions:`);
    lines.push(indent(rule.actions));
  }
  if (rule.performer !== undefined) {
    lines.push(`  performer:`);
    lines.push(indent(rule.performer));
  }
  return lines.join("\n");
}

type TypeResult = {
  typeId: AutomationTypeId;
  key: string;
  label: string;
  count: number;
  error: string | null;
  rules: Record<string, unknown>[];
};

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const probeOnly = process.argv.includes("--probe");
  const output = path.resolve(
    process.cwd(),
    argValue("--output=") ?? `exports/freshdesk-automations-${dateStamp()}`,
  );

  console.log(
    probeOnly
      ? "Probing Freshdesk automation rules (counts only)…"
      : `Exporting Freshdesk automation rules → ${output}`,
  );

  const results: TypeResult[] = [];

  for (const t of TYPES) {
    process.stdout.write(`  [type ${t.id}] ${t.label} … `);
    try {
      const rules = await listWithRetry(t.id);
      results.push({
        typeId: t.id,
        key: t.key,
        label: t.label,
        count: rules.length,
        error: null,
        rules,
      });
      console.log(`${rules.length} rule(s)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        typeId: t.id,
        key: t.key,
        label: t.label,
        count: 0,
        error: msg,
        rules: [],
      });
      console.log(`ERROR — ${msg}`);
    }
  }

  const total = results.reduce((s, r) => s + r.count, 0);
  const anyForbidden = results.some((r) => r.error?.includes("403"));

  if (probeOnly) {
    console.log(`\nTotal: ${total} rule(s) across ${TYPES.length} type(s).`);
    if (anyForbidden) {
      console.log(
        "⚠ At least one type returned 403 — the API key likely lacks admin access to Automations.",
      );
    }
    return;
  }

  fs.mkdirSync(output, { recursive: true });

  const combined: Record<string, unknown> = {};
  const txtParts: string[] = [
    `Freshdesk Automation Rules Export`,
    `Generated: ${new Date().toISOString()}`,
    `Total rules: ${total}`,
    "",
  ];

  for (const r of results) {
    fs.writeFileSync(
      path.join(output, `${r.key}.json`),
      JSON.stringify(r.rules, null, 2) + "\n",
      "utf8",
    );
    combined[r.key] = r.rules;

    txtParts.push(
      "================================================================",
      `${r.label}  —  ${r.count} rule(s)${r.error ? `  (ERROR: ${r.error})` : ""}`,
      "================================================================",
      "",
    );
    for (const rule of r.rules) {
      txtParts.push(ruleToText(rule), "");
    }
    txtParts.push("");
  }

  fs.writeFileSync(
    path.join(output, "_all.json"),
    JSON.stringify(combined, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(path.join(output, "rules.txt"), txtParts.join("\n"), "utf8");
  fs.writeFileSync(
    path.join(output, "_summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total,
        types: results.map((r) => ({
          typeId: r.typeId,
          key: r.key,
          label: r.label,
          count: r.count,
          error: r.error,
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`\nDone. ${total} rule(s) exported → ${output}`);
  console.log("  Files: dispatchr.json, supervisor.json, observer.json,");
  console.log("         _all.json, rules.txt, _summary.json");
  if (anyForbidden) {
    console.log(
      "⚠ At least one type returned 403 — the API key likely lacks admin access to Automations.",
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
