"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, AlertTriangle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { ImportColumnMapper, type ColumnMapping } from "./ImportColumnMapper";
import { createImportBatch } from "@/lib/actions/tasks";
import type { ImportBatchRowInput } from "@/lib/schemas/tasks";

type Step = 1 | 2 | 3 | 4;

interface ParsedCSV {
  columns: string[];
  rows:    Record<string, string>[];
}

interface ImportWizardProps {
  masterTaskId:   string;
  masterTaskTitle: string;
  groupId?:       string;
}

// ── Simple CSV parser (no external lib) ────────────────────
function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { columns: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const columns = parseRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => { obj[col] = values[i] ?? ""; });
    return obj;
  });

  return { columns, rows };
}

// ── Auto-map columns by common name patterns ────────────────
function autoMap(columns: string[]): ColumnMapping[] {
  const PATTERNS: Record<string, string[]> = {
    title:             ["title", "name", "task", "task name", "task title"],
    description:       ["description", "notes", "details", "desc"],
    assigned_to_email: ["assigned to", "owner", "email", "assignee", "assigned"],
    due_date:          ["due date", "deadline", "due", "date"],
    priority:          ["priority", "prio"],
    status:            ["status", "state"],
    group_name:        ["group", "phase", "category", "sprint", "milestone"],
  };

  return columns.map((col) => {
    const lc = col.toLowerCase().trim();
    for (const [field, patterns] of Object.entries(PATTERNS)) {
      if (patterns.some((p) => lc === p || lc.includes(p))) {
        return { csvColumn: col, mappedTo: field as ColumnMapping["mappedTo"] };
      }
    }
    return { csvColumn: col, mappedTo: "__skip" };
  });
}

export function ImportWizard({
  masterTaskId,
  masterTaskTitle,
  groupId,
}: ImportWizardProps) {
  const router = useRouter();
  const [step, setStep]                   = useState<Step>(1);
  const [csv, setCSV]                     = useState<ParsedCSV | null>(null);
  const [fileName, setFileName]           = useState("");
  const [mappings, setMappings]           = useState<ColumnMapping[]>([]);
  const [isDragOver, setIsDragOver]       = useState(false);
  const [result, setResult]               = useState<{
    batchId: string; imported: number; warnings: number;
  } | null>(null);
  const [isPending, startTransition]      = useTransition();

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.columns.length === 0) {
        toast.error("Could not parse CSV. Make sure the first row contains column headers.");
        return;
      }
      setCSV(parsed);
      setFileName(file.name);
      setMappings(autoMap(parsed.columns));
      setStep(2);
    };
    reader.readAsText(file);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) processFile(file);
    else toast.error("Please drop a CSV file.");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  // Validation
  const titleMapped = mappings.some((m) => m.mappedTo === "title");
  const mappedRows  = csv?.rows ?? [];

  // Build review data
  const rowsWithWarnings = mappedRows.filter((row) => {
    const titleCol = mappings.find((m) => m.mappedTo === "title")?.csvColumn;
    return !titleCol || !row[titleCol]?.trim();
  });
  const validRows = mappedRows.length - rowsWithWarnings.length;

  function buildImportRows(): ImportBatchRowInput[] {
    if (!csv) return [];
    const colFor = (field: string) =>
      mappings.find((m) => m.mappedTo === field)?.csvColumn;

    return csv.rows
      .map((row) => {
        const title = colFor("title") ? (row[colFor("title")!] ?? "").trim() : "";
        if (!title) return null;
        return {
          title,
          description:       colFor("description") ? (row[colFor("description")!] ?? "") : undefined,
          assigned_to_email: colFor("assigned_to_email") ? (row[colFor("assigned_to_email")!] ?? "") : undefined,
          due_date:          colFor("due_date") ? (row[colFor("due_date")!] ?? "") : undefined,
          priority:          colFor("priority") ? (row[colFor("priority")!] ?? "") : undefined,
          status:            colFor("status") ? (row[colFor("status")!] ?? "") : undefined,
          group_name:        colFor("group_name") ? (row[colFor("group_name")!] ?? "") : undefined,
        } as ImportBatchRowInput;
      })
      .filter(Boolean) as ImportBatchRowInput[];
  }

  function handleImport() {
    const rows = buildImportRows();
    if (rows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }

    startTransition(async () => {
      const res = await createImportBatch({
        master_task_id: masterTaskId,
        group_id:       groupId,
        rows,
      });

      if (res.success && res.data) {
        setResult(res.data);
        setStep(4);
      } else {
        toast.error(res.error ?? "Import failed");
      }
    });
  }

  const STEP_LABELS = ["Upload", "Map Columns", "Review", "Complete"];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as Step;
          const isActive = step === stepNum;
          const isDone   = step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  isDone  ? "bg-[#D4AF37] text-white"
                  : isActive ? "bg-zinc-900 text-white"
                  : "bg-zinc-200 text-zinc-500",
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  isActive ? "text-zinc-900" : "text-zinc-400",
                )}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-zinc-300" aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {/* Step 1 — Upload */}
          {step === 1 && (
            <div
              className={cn(
                surfaceCardVariants({ tone: "stone", elevation: "sm" }),
                "p-10 flex flex-col items-center gap-4 cursor-pointer transition-colors",
                isDragOver && "border-[#D4AF37] bg-[#D4AF37]/5",
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Drop a CSV file here or click to browse"
              onClick={() => document.getElementById("csv-file-input")?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  document.getElementById("csv-file-input")?.click();
                }
              }}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20">
                <Upload className="h-8 w-8 text-[#D4AF37]" aria-hidden />
              </div>
              <div className="text-center">
                <p className="font-serif text-lg font-semibold text-zinc-800">
                  Drop your CSV here
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  or click to browse — exported from Google Sheets or Excel
                </p>
              </div>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={handleFileInput}
                aria-label="Upload CSV file"
              />
            </div>
          )}

          {/* Step 2 — Map */}
          {step === 2 && csv && (
            <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4 space-y-4")}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-serif text-base font-semibold text-zinc-900">
                    Map Columns
                  </p>
                  <p className="text-xs text-zinc-500">
                    {fileName} — {csv.rows.length} rows detected
                  </p>
                </div>
              </div>
              <ImportColumnMapper
                csvColumns={csv.columns}
                previewRows={csv.rows.slice(0, 3)}
                mappings={mappings}
                onChange={setMappings}
              />
              {!titleMapped && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    You must map at least one column to "Task Title" to continue.
                  </p>
                </div>
              )}
              <div className="flex justify-between pt-2">
                <IndulgeButton variant="outline" size="sm" onClick={() => setStep(1)}>
                  Back
                </IndulgeButton>
                <IndulgeButton
                  variant="gold"
                  size="sm"
                  disabled={!titleMapped}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                  onClick={() => setStep(3)}
                >
                  Review
                </IndulgeButton>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && csv && (
            <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4 space-y-4")}>
              <p className="font-serif text-base font-semibold text-zinc-900">Review Import</p>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total rows",    value: mappedRows.length,            color: "text-zinc-900" },
                  { label: "Valid",         value: validRows,                     color: "text-emerald-600" },
                  { label: "Will be skipped", value: rowsWithWarnings.length,    color: "text-amber-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-center">
                    <p className={cn("text-2xl font-bold font-serif", color)}>{value}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              {validRows > 0 && (
                <div className="overflow-x-auto rounded-lg border border-zinc-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50">
                        <th className="px-3 py-2 text-left text-[10px] text-zinc-400 uppercase tracking-wider">Title</th>
                        <th className="px-3 py-2 text-left text-[10px] text-zinc-400 uppercase tracking-wider hidden sm:table-cell">Priority</th>
                        <th className="px-3 py-2 text-left text-[10px] text-zinc-400 uppercase tracking-wider hidden md:table-cell">Due Date</th>
                        <th className="px-3 py-2 text-left text-[10px] text-zinc-400 uppercase tracking-wider hidden md:table-cell">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildImportRows().slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-3 py-2 font-medium text-zinc-800 truncate max-w-[180px]">{row.title}</td>
                          <td className="px-3 py-2 text-zinc-500 capitalize hidden sm:table-cell">{row.priority || "—"}</td>
                          <td className="px-3 py-2 text-zinc-500 hidden md:table-cell">{row.due_date || "—"}</td>
                          <td className="px-3 py-2 text-zinc-500 hidden md:table-cell">{row.assigned_to_email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows > 10 && (
                    <p className="px-3 py-2 text-[10px] text-zinc-400 bg-zinc-50 text-center">
                      …and {validRows - 10} more
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <IndulgeButton variant="outline" size="sm" onClick={() => setStep(2)}>
                  Back
                </IndulgeButton>
                <IndulgeButton
                  variant="gold"
                  size="sm"
                  disabled={validRows === 0}
                  onClick={() => setStep(4)}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                >
                  Import {validRows} Task{validRows !== 1 ? "s" : ""}
                </IndulgeButton>
              </div>
            </div>
          )}

          {/* Step 4 — Confirm + Result */}
          {step === 4 && (
            <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-8 flex flex-col items-center gap-4 text-center")}>
              {result ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-serif text-xl font-semibold text-zinc-900">
                      Import Complete
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      {result.imported} tasks imported
                      {result.warnings > 0 ? `, ${result.warnings} warnings` : ""}
                    </p>
                  </div>
                  <IndulgeButton
                    variant="gold"
                    onClick={() => router.push(`/tasks/${masterTaskId}`)}
                  >
                    View {masterTaskTitle}
                  </IndulgeButton>
                </>
              ) : (
                <>
                  <p className="font-serif text-lg font-semibold text-zinc-800">
                    Import {validRows} tasks to{" "}
                    <span className="text-[#D4AF37]">{masterTaskTitle}</span>?
                  </p>
                  <p className="text-sm text-zinc-500">
                    This action cannot be undone. Tasks will be created in the selected group.
                  </p>
                  <div className="flex gap-3">
                    <IndulgeButton variant="outline" onClick={() => setStep(3)}>
                      Back
                    </IndulgeButton>
                    <IndulgeButton
                      variant="gold"
                      loading={isPending}
                      onClick={handleImport}
                      leftIcon={isPending ? undefined : <Upload className="h-4 w-4" />}
                    >
                      {isPending ? "Importing…" : `Import ${validRows} Tasks`}
                    </IndulgeButton>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
