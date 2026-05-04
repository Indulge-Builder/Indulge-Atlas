"use client";

import { useState, useCallback } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATLAS_TASK_STATUS_LABELS,
  ATLAS_TASK_STATUS_COLORS,
  ATLAS_TASK_STATUS_VALUES,
  type AtlasTaskStatus,
  type TaskPriority,
} from "@/lib/types/database";

export interface TaskFilters {
  search:     string;
  status:     AtlasTaskStatus | "all";
  priority:   TaskPriority | "all";
}

interface TaskSearchFilterProps {
  filters:   TaskFilters;
  onChange:  (filters: TaskFilters) => void;
  className?: string;
}

const PRIORITY_OPTIONS: Array<{ value: TaskPriority | "all"; label: string }> = [
  { value: "all",    label: "All Priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
];

const STATUSES: AtlasTaskStatus[] = [...ATLAS_TASK_STATUS_VALUES];

export function TaskSearchFilter({ filters, onChange, className }: TaskSearchFilterProps) {
  const [open, setOpen] = useState(false);

  const hasActiveFilters =
    filters.status !== "all" || filters.priority !== "all";

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filters, search: e.target.value });
    },
    [filters, onChange],
  );

  const handleClearSearch = useCallback(() => {
    onChange({ ...filters, search: "" });
  }, [filters, onChange]);

  const handleReset = useCallback(() => {
    onChange({ search: filters.search, status: "all", priority: "all" });
    setOpen(false);
  }, [filters.search, onChange]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <Input
          value={filters.search}
          onChange={handleSearch}
          placeholder="Search tasks…"
          className="pl-8 pr-8 h-8 text-sm"
          aria-label="Search tasks"
        />
        {filters.search && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[#D4AF37]",
              hasActiveFilters
                ? "border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/5"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
            )}
            aria-label="Filter tasks"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#D4AF37] text-[9px] font-bold text-black">
                {[filters.status !== "all", filters.priority !== "all"].filter(Boolean).length}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-64 p-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Filter by Status
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onChange({ ...filters, status: "all" })}
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium border transition-colors",
                  filters.status === "all"
                    ? "border-zinc-800 bg-zinc-800 text-white"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                )}
                aria-pressed={filters.status === "all"}
              >
                All
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => onChange({ ...filters, status: s })}
                  className={cn(
                    "h-6 rounded px-2 text-[11px] font-medium border transition-colors",
                    filters.status === s
                      ? "border-transparent text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                  )}
                  style={
                    filters.status === s
                      ? { backgroundColor: ATLAS_TASK_STATUS_COLORS[s] }
                      : undefined
                  }
                  aria-pressed={filters.status === s}
                >
                  {ATLAS_TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 pt-1">
              Priority
            </p>
            <Select
              value={filters.priority}
              onValueChange={(v) =>
                onChange({ ...filters, priority: v as TaskPriority | "all" })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <IndulgeButton
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="w-full mt-1"
              >
                Reset Filters
              </IndulgeButton>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
