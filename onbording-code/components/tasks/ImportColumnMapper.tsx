"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ImportFieldKey =
  | "title"
  | "description"
  | "assigned_to_email"
  | "due_date"
  | "priority"
  | "status"
  | "group_name"
  | "__skip";

export interface ColumnMapping {
  csvColumn: string;
  mappedTo: ImportFieldKey;
}

const FIELD_OPTIONS: { value: ImportFieldKey; label: string; required?: boolean }[] = [
  { value: "title",             label: "Task Title",    required: true },
  { value: "description",       label: "Description" },
  { value: "assigned_to_email", label: "Assignee Email" },
  { value: "due_date",          label: "Due Date" },
  { value: "priority",          label: "Priority" },
  { value: "status",            label: "Status" },
  { value: "group_name",        label: "Group / Phase" },
  { value: "__skip",            label: "— Skip column —" },
];

interface ImportColumnMapperProps {
  csvColumns: string[];
  previewRows: Record<string, string>[];
  mappings:    ColumnMapping[];
  onChange:    (mappings: ColumnMapping[]) => void;
}

export function ImportColumnMapper({
  csvColumns,
  previewRows,
  mappings,
  onChange,
}: ImportColumnMapperProps) {
  function updateMapping(colIndex: number, mappedTo: ImportFieldKey) {
    const next = mappings.map((m, i) =>
      i === colIndex ? { ...m, mappedTo } : m,
    );
    onChange(next);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-200">
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 w-40">
              CSV Column
            </th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 w-44">
              Maps To
            </th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Preview
            </th>
          </tr>
        </thead>
        <tbody>
          {csvColumns.map((col, i) => {
            const mapping = mappings[i];
            const isTitle = mapping?.mappedTo === "title";
            return (
              <tr
                key={col}
                className={cn(
                  "border-b border-zinc-100 hover:bg-zinc-50 transition-colors",
                  isTitle && "bg-[#D4AF37]/5",
                )}
              >
                {/* CSV Column */}
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs text-zinc-700 truncate max-w-[140px] block">
                    {col}
                  </span>
                </td>

                {/* Mapping select */}
                <td className="px-3 py-2.5">
                  <Select
                    value={mapping?.mappedTo ?? "__skip"}
                    onValueChange={(v) => updateMapping(i, v as ImportFieldKey)}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 text-xs w-44",
                        isTitle && "border-[#D4AF37]",
                      )}
                      aria-label={`Map column "${col}" to field`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.required && (
                            <span className="ml-1 text-red-500">*</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Preview values */}
                <td className="px-3 py-2.5">
                  <div className="flex gap-2 flex-wrap">
                    {previewRows.slice(0, 3).map((row, ri) => (
                      <span
                        key={ri}
                        className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]"
                      >
                        {row[col] ?? "—"}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
