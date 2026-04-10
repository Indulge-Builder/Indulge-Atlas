"use client";

import { useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldMapping } from "@/lib/actions/field-mappings";
import type { LeadColumnMeta } from "@/lib/actions/pipeline";

const TRANSFORMATION_OPTIONS = [
  { value: "none", label: "None (passthrough)" },
  { value: "trim", label: "Trim whitespace" },
  { value: "lowercase", label: "Lowercase" },
  { value: "uppercase", label: "Uppercase" },
  { value: "capitalize", label: "Capitalize" },
  { value: "extract_numbers", label: "Extract numbers only" },
];

interface MappingBuilderRowProps {
  mapping: FieldMapping;
  columns: LeadColumnMeta[];
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
}

export function MappingBuilderRow({
  mapping,
  columns,
  onDelete,
  onToggle,
}: MappingBuilderRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onDelete(mapping.id);
    setDeleting(false);
  }

  async function handleToggle() {
    setToggling(true);
    await onToggle(mapping.id, !mapping.is_active);
    setToggling(false);
  }

  const colMeta = columns.find((c) => c.column_name === mapping.target_db_column);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-[#EAEAEA] bg-white/80 px-3 py-3 transition-opacity sm:flex-row sm:items-center sm:gap-4 sm:px-4",
        !mapping.is_active && "opacity-50",
      )}
    >
      {/* Incoming key */}
      <div className="min-w-0 flex-1 sm:max-w-[30%]">
        <p className="font-mono text-xs font-semibold text-[#1A1A1A]">
          {mapping.incoming_json_key}
        </p>
        {mapping.fallback_value && (
          <p className="mt-0.5 text-[10px] text-stone-400">
            fallback: <span className="font-mono">{mapping.fallback_value}</span>
          </p>
        )}
      </div>

      {/* Arrow */}
      <div className="flex shrink-0 items-center justify-center sm:w-8">
        <ArrowRight className="h-4 w-4 text-stone-300" strokeWidth={1.75} aria-hidden />
      </div>

      {/* Target column */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="font-mono text-xs font-semibold text-[#1A1A1A]">
          {mapping.target_db_column}
        </p>
        {colMeta && (
          <span className="text-[10px] text-stone-400">({colMeta.data_type})</span>
        )}
        {mapping.transformation_rule && (
          <Badge
            variant="outline"
            className="border-blue-200/80 bg-blue-50 px-2 py-0 text-[10px] font-medium text-blue-700"
          >
            {mapping.transformation_rule}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "ml-auto shrink-0 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide",
            mapping.is_active
              ? "border-emerald-200/80 bg-emerald-50 text-emerald-800"
              : "border-stone-200 bg-stone-50 text-stone-500",
          )}
        >
          {mapping.is_active ? "Active" : "Paused"}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-[#6B6B6B] hover:text-[#1A1A1A]"
          onClick={handleToggle}
          disabled={toggling}
          aria-label={mapping.is_active ? "Pause mapping" : "Activate mapping"}
          title={mapping.is_active ? "Pause" : "Activate"}
        >
          <span className="text-xs">{mapping.is_active ? "⏸" : "▶"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-red-400 hover:text-red-600"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete mapping"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ─── Add-new-mapping form ─────────────────────────────────────────────────────

interface AddMappingFormProps {
  payloadKeys: string[];
  columns: LeadColumnMeta[];
  onSave: (data: {
    incoming_json_key: string;
    target_db_column: string;
    transformation_rule: string | null;
    fallback_value: string | null;
  }) => Promise<void>;
  saving: boolean;
}

export function AddMappingForm({
  payloadKeys,
  columns,
  onSave,
  saving,
}: AddMappingFormProps) {
  const [incomingKey, setIncomingKey] = useState("");
  const [targetCol, setTargetCol] = useState("");
  const [transform, setTransform] = useState("");
  const [fallback, setFallback] = useState("");

  const isValid = incomingKey.trim().length > 0 && targetCol.length > 0;

  async function handleSave() {
    if (!isValid) return;
    await onSave({
      incoming_json_key: incomingKey.trim(),
      target_db_column: targetCol,
      transformation_rule: transform && transform !== "none" ? transform : null,
      fallback_value: fallback.trim() || null,
    });
    setIncomingKey("");
    setTargetCol("");
    setTransform("");
    setFallback("");
  }

  return (
    <div className="rounded-xl border border-dashed border-[#D4AF37]/50 bg-[#FDFCF7] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#A88B25]">
        Add Mapping
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
        {/* Incoming key — datalist for payload suggestions */}
        <div className="flex-1">
          <label className="mb-1 block text-xs text-stone-500">
            Incoming JSON key
          </label>
          <Input
            list="payload-keys-list"
            value={incomingKey}
            onChange={(e) => setIncomingKey(e.target.value)}
            placeholder="e.g. phone or payload.phone"
            className="h-9 border-[#E5E4DF] bg-white font-mono text-xs"
          />
          <datalist id="payload-keys-list">
            {payloadKeys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>

        {/* Arrow */}
        <div className="hidden shrink-0 pb-2 sm:flex sm:items-center">
          <ArrowRight className="h-4 w-4 text-stone-300" strokeWidth={1.75} aria-hidden />
        </div>

        {/* Target column */}
        <div className="flex-1">
          <label className="mb-1 block text-xs text-stone-500">
            Target DB column
          </label>
          <Select value={targetCol} onValueChange={setTargetCol}>
            <SelectTrigger className="h-9 border-[#E5E4DF] bg-white font-mono text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem
                  key={c.column_name}
                  value={c.column_name}
                  className="font-mono text-xs"
                >
                  {c.column_name}{" "}
                  <span className="text-stone-400">({c.data_type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transform */}
        <div className="flex-1">
          <label className="mb-1 block text-xs text-stone-500">
            Transform
          </label>
          <Select value={transform} onValueChange={setTransform}>
            <SelectTrigger className="h-9 border-[#E5E4DF] bg-white text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {TRANSFORMATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fallback */}
        <div className="w-full sm:w-36">
          <label className="mb-1 block text-xs text-stone-500">
            Fallback value
          </label>
          <Input
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            placeholder="optional"
            className="h-9 border-[#E5E4DF] bg-white font-mono text-xs"
          />
        </div>

        {/* Save */}
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isValid || saving}
          className="h-9 shrink-0 bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
