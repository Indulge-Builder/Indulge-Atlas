/**
 * Render the exported Freshdesk automation rules (_all.json) into a CLEAN,
 * human-readable PDF — with time/hour triggers (Supervisor rules) called out
 * explicitly per rule.
 *
 * Usage:
 *   npx tsx scripts/automations-to-pdf.ts
 *   npx tsx scripts/automations-to-pdf.ts --dir=exports/freshdesk-automations-2026-07-07
 *   npx tsx scripts/automations-to-pdf.ts --raw      # also dump raw JSON per rule (long)
 */

import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";

const TYPE_ORDER: { key: string; label: string; note?: string }[] = [
  { key: "dispatchr", label: "Dispatch'r — Ticket Creation" },
  {
    key: "supervisor",
    label: "Supervisor — Time Triggers",
    note: "Time-trigger rules. Freshdesk evaluates these once every hour; each rule's timing is shown as its \"Time trigger\".",
  },
  { key: "observer", label: "Observer — Ticket Updates" },
];

const TIME_FIELD_LABELS: Record<string, string> = {
  hours_since_created: "Hours since ticket created",
  hours_since_resolved: "Hours since resolved",
  hours_since_closed: "Hours since closed",
  hours_since_updated: "Hours since updated",
  hours_since_status_updated: "Hours since status changed",
  hours_since_agent_responded: "Hours since agent responded",
  hours_since_customer_responded: "Hours since customer responded",
  hours_since_pending: "Hours since pending",
  hours_since_due: "Hours overdue (since due)",
  hours_since_first_assigned: "Hours since first assigned",
  hours_since_first_response: "Hours since first response",
};

const OPERATOR_TEXT: Record<string, string> = {
  greater_than: "greater than",
  less_than: "less than",
  is: "is",
  in: "is",
  not_in: "is not",
  not: "is not",
};

function argValue(prefix: string): string | null {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).trim() : null;
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeField(field: string): string {
  return field
    .replace(/^cf_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull all time/hour trigger conditions out of a rule's raw conditions. */
function extractTimeTriggers(rule: Record<string, unknown>): string[] {
  const out: string[] = [];
  const conditions = rule.conditions;
  if (!Array.isArray(conditions)) return out;
  for (const set of conditions) {
    const props = (set as Record<string, unknown>)?.properties;
    if (!Array.isArray(props)) continue;
    for (const p of props) {
      const prop = p as Record<string, unknown>;
      const field = String(prop.field_name ?? "");
      if (!/^hours_since|(^|_)hours?($|_)/.test(field)) continue;
      const label = TIME_FIELD_LABELS[field] ?? humanizeField(field);
      const op = OPERATOR_TEXT[String(prop.operator ?? "")] ?? String(prop.operator ?? "");
      const val = Array.isArray(prop.value) ? prop.value.join(", ") : prop.value;
      out.push(`${label} ${op} ${val} hour(s)`);
    }
  }
  return out;
}

/** Readable condition lines from the Freshdesk-provided summary. */
function readableConditions(rule: Record<string, unknown>): string[] {
  const s = rule.summary as Record<string, unknown> | undefined;
  const conds = s?.conditions;
  const lines: string[] = [];
  if (conds && typeof conds === "object") {
    for (const v of Object.values(conds as Record<string, unknown>)) {
      const arr = Array.isArray(v) ? v : [v];
      for (const item of arr) {
        const t = stripHtml(String(item));
        if (!t || t === "AND" || t === "OR") continue;
        // Drop dangling "If X is" fragments with no value.
        if (/\b(is|greater than|less than)\s*$/i.test(t)) continue;
        lines.push(t);
      }
    }
  }
  return lines;
}

/** Readable action lines from the Freshdesk-provided summary. */
function readableActions(rule: Record<string, unknown>): string[] {
  const s = rule.summary as Record<string, unknown> | undefined;
  const acts = s?.actions;
  const lines: string[] = [];
  if (Array.isArray(acts)) {
    for (const a of acts) {
      const t = stripHtml(String(a));
      if (!t || t === "AND" || t === "OR") continue;
      lines.push(t);
    }
  }
  return lines;
}

function main(): void {
  const dir = path.resolve(
    process.cwd(),
    argValue("--dir=") ?? `exports/freshdesk-automations-${dateStamp()}`,
  );
  const inputPath = path.join(dir, "_all.json");
  const includeRaw = process.argv.includes("--raw");
  const outPath = path.join(dir, "rules.pdf");

  if (!fs.existsSync(inputPath)) {
    console.error(`Missing ${inputPath}. Run fetch-freshdesk-automations first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, "utf8")) as Record<
    string,
    Record<string, unknown>[]
  >;

  const total = TYPE_ORDER.reduce(
    (s, t) => s + (Array.isArray(data[t.key]) ? data[t.key]!.length : 0),
    0,
  );

  const doc = new PDFDocument({ size: "A4", margin: 46, bufferPages: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const GOLD = "#5f5348";
  const INK = "#1A1814";
  const MUTED = "#6b6b6b";
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const hr = (color = "#E5E4DF", w = 1) => {
    doc.strokeColor(color).lineWidth(w).moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  };
  const ensure = (space: number) => {
    if (doc.y > doc.page.height - space) doc.addPage();
  };
  const bullets = (items: string[], color: string) => {
    for (const it of items) {
      doc.font("Helvetica").fontSize(9).fillColor(color)
        .text(`•  ${it}`, doc.page.margins.left + 12, doc.y, {
          width: contentWidth - 12,
        });
    }
  };

  // Cover
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(26)
    .text("Freshdesk Automation Rules");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED);
  doc.text("Indulge · indulge.freshdesk.com");
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.text(`Total rules: ${total}`);
  doc.moveDown(0.8);
  for (const t of TYPE_ORDER) {
    const n = Array.isArray(data[t.key]) ? data[t.key]!.length : 0;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11)
      .text(`${n}  `, { continued: true });
    doc.font("Helvetica").fillColor(MUTED).text(t.label);
  }

  for (const t of TYPE_ORDER) {
    const rules = Array.isArray(data[t.key]) ? data[t.key]! : [];
    rules.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

    doc.addPage();
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(16).text(t.label);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9)
      .text(`${rules.length} rule(s)`);
    if (t.note) {
      doc.moveDown(0.15);
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#8a7f00")
        .text(t.note, { width: contentWidth });
    }
    doc.moveDown(0.4);
    hr();
    doc.moveDown(0.5);

    for (const rule of rules) {
      const name = String(rule.name ?? "(unnamed)");
      const active = rule.active === false ? "INACTIVE" : "ACTIVE";
      const pos = rule.position ?? "—";
      const outdated = rule.outdated ? " · OUTDATED" : "";
      const timeTriggers = extractTimeTriggers(rule);

      ensure(140);

      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12)
        .text(`${pos}. ${name}`, { width: contentWidth });
      doc.font("Helvetica").fontSize(8)
        .fillColor(active === "ACTIVE" ? "#2e7d32" : "#b23b3b")
        .text(`${active}${outdated}   ·   id ${rule.id ?? "—"}`);
      doc.moveDown(0.25);

      if (timeTriggers.length) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD)
          .text("Time trigger", doc.page.margins.left, doc.y);
        for (const tt of timeTriggers) {
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#8a5a00")
            .text(`⏱  ${tt}`, doc.page.margins.left + 12, doc.y, {
              width: contentWidth - 12,
            });
        }
        doc.moveDown(0.15);
      }

      const conds = readableConditions(rule);
      if (conds.length) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD).text("When");
        bullets(conds, "#3a3a3a");
      }

      const acts = readableActions(rule);
      if (acts.length) {
        doc.moveDown(0.1);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD).text("Then");
        bullets(acts, "#3a3a3a");
      }

      if (includeRaw) {
        for (const field of ["conditions", "actions"]) {
          if (rule[field] === undefined) continue;
          doc.moveDown(0.1);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED)
            .text(`raw ${field}`);
          doc.font("Courier").fontSize(7).fillColor("#555")
            .text(JSON.stringify(rule[field], null, 2), {
              width: contentWidth,
            });
        }
      }

      doc.moveDown(0.45);
      hr("#EFEFEA", 0.5);
      doc.moveDown(0.4);
    }
  }

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      `Page ${i - range.start + 1} of ${range.count}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { align: "center", width: contentWidth },
    );
  }

  doc.end();
  stream.on("finish", () => {
    const bytes = fs.statSync(outPath).size;
    const withTime = TYPE_ORDER.flatMap((t) => data[t.key] ?? []).filter(
      (r) => extractTimeTriggers(r).length > 0,
    ).length;
    console.log(
      `Done. ${total} rules (${withTime} with time triggers) → ${outPath} (${Math.round(bytes / 1024)} KB)`,
    );
  });
}

main();
