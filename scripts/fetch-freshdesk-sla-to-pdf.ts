/**
 * Export ALL Freshdesk SLA policies and render them into a CLEAN, human-readable
 * PDF — with per-priority response/resolution targets and escalation called out.
 *
 * Writes to exports/freshdesk-sla-<date>/:
 *   _all.json   (raw policy objects)
 *   sla.pdf     (formatted report)
 *
 * Usage:
 *   npx tsx scripts/fetch-freshdesk-sla-to-pdf.ts
 *   npx tsx scripts/fetch-freshdesk-sla-to-pdf.ts --output=exports/freshdesk-sla-2026-07-10
 *   npx tsx scripts/fetch-freshdesk-sla-to-pdf.ts --probe   # counts only, no files
 */

import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import { listSlaPolicies } from "../lib/freshdesk/client";

const RETRY_DELAYS_MS = [3000, 6000, 12000, 20000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function listWithRetry(): Promise<Record<string, unknown>[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await listSlaPolicies();
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

// Freshdesk priority keys → human labels (highest urgency first).
const PRIORITIES: { key: string; label: string }[] = [
  { key: "priority_4", label: "Urgent" },
  { key: "priority_3", label: "High" },
  { key: "priority_2", label: "Medium" },
  { key: "priority_1", label: "Low" },
];

/** Convert a duration in seconds into a compact human string. */
function humanizeDuration(seconds: unknown): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "—";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.length ? parts.join(" ") : `${s}s`;
}

type Target = {
  priority: string;
  respond: string;
  resolve: string;
  businessHours: string;
  escalation: string;
};

function extractTargets(policy: Record<string, unknown>): Target[] {
  const slaTarget = policy.sla_target;
  const out: Target[] = [];
  if (!slaTarget || typeof slaTarget !== "object") return out;
  const map = slaTarget as Record<string, unknown>;
  for (const p of PRIORITIES) {
    const t = map[p.key];
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    out.push({
      priority: p.label,
      respond: humanizeDuration(o.respond_within),
      resolve: humanizeDuration(o.resolve_within),
      businessHours:
        o.business_hours === true ? "Business hrs" : "Calendar hrs",
      escalation: o.escalation_enabled === true ? "On" : "Off",
    });
  }
  return out;
}

/** Summarize the applicable_to targeting block into readable lines. */
function readableApplicableTo(policy: Record<string, unknown>): string[] {
  const app = policy.applicable_to;
  if (!app || typeof app !== "object") return [];
  const lines: string[] = [];
  for (const [k, v] of Object.entries(app as Record<string, unknown>)) {
    if (v == null) continue;
    const arr = Array.isArray(v) ? v : [v];
    if (!arr.length) continue;
    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`${label}: ${arr.join(", ")}`);
  }
  return lines;
}

async function main(): Promise<void> {
  applyEnv(path.join(process.cwd(), ".env.local"));
  applyEnv(path.join(process.cwd(), ".env"));

  const probeOnly = process.argv.includes("--probe");
  const output = path.resolve(
    process.cwd(),
    argValue("--output=") ?? `exports/freshdesk-sla-${dateStamp()}`,
  );

  console.log(
    probeOnly
      ? "Probing Freshdesk SLA policies (count only)…"
      : `Exporting Freshdesk SLA policies → ${output}`,
  );

  let policies: Record<string, unknown>[];
  try {
    policies = await listWithRetry();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`ERROR — ${msg}`);
    if (msg.includes("403")) {
      console.error(
        "⚠ 403 — the API key likely lacks admin access to SLA policies.",
      );
    }
    process.exit(1);
    return;
  }

  policies.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  console.log(`  ${policies.length} SLA policy(ies) found.`);

  if (probeOnly) return;

  fs.mkdirSync(output, { recursive: true });
  const jsonPath = path.join(output, "_all.json");
  fs.writeFileSync(jsonPath, JSON.stringify(policies, null, 2) + "\n", "utf8");

  const outPath = path.join(output, "sla.pdf");
  const doc = new PDFDocument({ size: "A4", margin: 46, bufferPages: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const GOLD = "#5f5348";
  const INK = "#1A1814";
  const MUTED = "#6b6b6b";
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const hr = (color = "#E5E4DF", w = 1) => {
    doc
      .strokeColor(color)
      .lineWidth(w)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
  };
  const ensure = (space: number) => {
    if (doc.y > doc.page.height - space) doc.addPage();
  };

  // Cover
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(26)
    .text("Freshdesk SLA Policies");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED);
  doc.text("Indulge · indulge.freshdesk.com");
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.text(`Total policies: ${policies.length}`);
  doc.moveDown(0.8);
  for (const p of policies) {
    const flag = p.is_default ? " (default)" : "";
    const state = p.active === false ? " · INACTIVE" : "";
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`${p.position ?? "—"}.  `, { continued: true });
    doc
      .font("Helvetica")
      .fillColor(MUTED)
      .text(`${String(p.name ?? "(unnamed)")}${flag}${state}`);
  }

  // Priority target table renderer
  const COLS = [
    { key: "priority", label: "Priority", w: 0.22 },
    { key: "respond", label: "First response", w: 0.2 },
    { key: "resolve", label: "Resolution", w: 0.2 },
    { key: "businessHours", label: "Clock", w: 0.2 },
    { key: "escalation", label: "Escalation", w: 0.18 },
  ] as const;

  const drawTable = (targets: Target[]) => {
    const rowH = 18;
    const startX = doc.page.margins.left;
    let y = doc.y;

    // header
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GOLD);
    let x = startX;
    for (const c of COLS) {
      doc.text(c.label, x + 2, y + 4, { width: contentWidth * c.w - 4 });
      x += contentWidth * c.w;
    }
    y += rowH;
    doc
      .strokeColor("#E5E4DF")
      .lineWidth(0.5)
      .moveTo(startX, y)
      .lineTo(startX + contentWidth, y)
      .stroke();

    // rows
    doc.font("Helvetica").fontSize(9).fillColor("#3a3a3a");
    for (const t of targets) {
      x = startX;
      for (const c of COLS) {
        const val = String(t[c.key as keyof Target] ?? "—");
        const isPriority = c.key === "priority";
        doc
          .font(isPriority ? "Helvetica-Bold" : "Helvetica")
          .fillColor(isPriority ? INK : "#3a3a3a")
          .text(val, x + 2, y + 4, { width: contentWidth * c.w - 4 });
        x += contentWidth * c.w;
      }
      y += rowH;
      doc
        .strokeColor("#EFEFEA")
        .lineWidth(0.5)
        .moveTo(startX, y)
        .lineTo(startX + contentWidth, y)
        .stroke();
    }
    doc.y = y + 4;
  };

  doc.addPage();
  for (const policy of policies) {
    const name = String(policy.name ?? "(unnamed)");
    const active = policy.active === false ? "INACTIVE" : "ACTIVE";
    const isDefault = policy.is_default ? " · DEFAULT" : "";
    const desc =
      typeof policy.description === "string" ? policy.description.trim() : "";
    const targets = extractTargets(policy);
    const applicable = readableApplicableTo(policy);

    ensure(200);

    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(`${policy.position ?? "—"}. ${name}`, { width: contentWidth });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(active === "ACTIVE" ? "#2e7d32" : "#b23b3b")
      .text(`${active}${isDefault}   ·   id ${policy.id ?? "—"}`);
    if (desc) {
      doc.moveDown(0.15);
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(MUTED)
        .text(desc, { width: contentWidth });
    }
    doc.moveDown(0.35);

    if (applicable.length) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(GOLD)
        .text("Applies to");
      for (const a of applicable) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#3a3a3a")
          .text(`•  ${a}`, doc.page.margins.left + 12, doc.y, {
            width: contentWidth - 12,
          });
      }
      doc.moveDown(0.3);
    }

    if (targets.length) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(GOLD)
        .text("SLA targets");
      doc.moveDown(0.15);
      drawTable(targets);
    } else {
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor(MUTED)
        .text("No SLA targets defined.");
    }

    doc.moveDown(0.5);
    hr("#E5E4DF", 1);
    doc.moveDown(0.5);
  }

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - 30,
        { align: "center", width: contentWidth },
      );
  }

  doc.end();
  await new Promise<void>((resolve) => stream.on("finish", () => resolve()));

  const bytes = fs.statSync(outPath).size;
  console.log(
    `Done. ${policies.length} SLA policy(ies) → ${outPath} (${Math.round(
      bytes / 1024,
    )} KB)`,
  );
  console.log(`  Raw JSON: ${jsonPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
