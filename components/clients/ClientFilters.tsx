"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientViewMode = "cards" | "list";

export type QueendomFilter =
  | "all"
  | "Ananyshree Queendom"
  | "Anishqa Queendom"
  | "Unassigned";
export type StatusFilter = "all" | "active" | "expired";

const QUEENDOM_OPTIONS: { value: QueendomFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Ananyshree Queendom", label: "Ananyshree Queendom" },
  { value: "Anishqa Queendom", label: "Anishqa Queendom" },
  { value: "Unassigned", label: "Unassigned" },
];

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
];

const MEMBERSHIP_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "Premium", label: "Premium" },
  { value: "Standard", label: "Standard" },
  { value: "Celebrity", label: "Celebrity" },
  { value: "Genie", label: "Genie" },
  { value: "Monthly Trial", label: "Monthly Trial" },
];

interface ClientFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  queendom: QueendomFilter;
  onQueendomChange: (v: QueendomFilter) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  membership: string;
  onMembershipChange: (v: string) => void;
  viewMode: ClientViewMode;
  onViewModeChange: (v: ClientViewMode) => void;
}

export function ClientFilters({
  search,
  onSearchChange,
  queendom,
  onQueendomChange,
  status,
  onStatusChange,
  membership,
  onMembershipChange,
  viewMode,
  onViewModeChange,
}: ClientFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full max-w-md">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Search
          </label>
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, phone…"
            className="h-10 border-[#E5E4DF] bg-white"
          />
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end sm:gap-4">
          <div className="w-full sm:w-auto">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Queendom
            </label>
            <Select
              value={queendom}
              onValueChange={(v) => onQueendomChange(v as QueendomFilter)}
            >
              <SelectTrigger className="h-10 w-full min-w-[200px] border-[#E5E4DF] bg-white sm:w-[260px]">
                <SelectValue placeholder="Queendom" />
              </SelectTrigger>
              <SelectContent>
                {QUEENDOM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Membership
            </label>
            <Select value={membership} onValueChange={onMembershipChange}>
              <SelectTrigger className="h-10 w-full min-w-[200px] border-[#E5E4DF] bg-white sm:w-[220px]">
                <SelectValue placeholder="Membership type" />
              </SelectTrigger>
              <SelectContent>
                {MEMBERSHIP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_PILLS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => onStatusChange(pill.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  status === pill.id
                    ? "bg-emerald-700 text-white"
                    : "border border-[#E5E4DF] bg-white text-stone-600 hover:border-emerald-300",
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            View
          </span>
          <div
            className="inline-flex rounded-xl border border-[#E5E4DF] bg-[#F2F2EE] p-1"
            role="group"
            aria-label="Layout"
          >
            <button
              type="button"
              onClick={() => onViewModeChange("cards")}
              aria-pressed={viewMode === "cards"}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                viewMode === "cards"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800",
              )}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              Cards
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-pressed={viewMode === "list"}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800",
              )}
            >
              <List className="h-4 w-4 shrink-0" aria-hidden />
              List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
