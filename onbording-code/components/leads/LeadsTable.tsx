"use client";

import { useCallback, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Megaphone,
  CalendarClock,
  Plus,
  Users,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceCardVariants } from "@/components/ui/card";
import {
  leadsFilterTriggerActiveClass,
  leadsFilterTriggerVariants,
} from "@/components/leads/ui/filter-trigger";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadSourceBadge } from "@/components/ui/LeadSourceBadge";
import { LeadsTableDateFilterPopover } from "@/components/leads/LeadsTableDateFilterPopover";
import { cn, getInitials } from "@/lib/utils";
import { addCalendarDaysIST, formatIST } from "@/lib/utils/time";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_ORDER,
  type Lead,
  type LeadStatus,
  type UserRole,
} from "@/lib/types/database";
import type { NextTask } from "@/app/(dashboard)/leads/page";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: LeadStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  ...LEAD_STATUS_ORDER.map((status) => ({
    value: status,
    label: LEAD_STATUS_CONFIG[status].label,
  })),
];

interface LeadsTableProps {
  leads: Lead[];
  totalCount: number;
  currentPage: number;
  role: UserRole;
  agents?: { id: string; full_name: string }[];
  campaigns?: string[];
  nextTaskMap?: Record<string, NextTask>;
  /** When set, campaign filter is fixed and campaign dropdown is hidden */
  embedCampaignId?: string;
  /** Params to preserve in URL when embedded (e.g. { tab: "leads" }) */
  embedQueryParams?: Record<string, string>;
}

export function LeadsTable({
  leads,
  totalCount,
  currentPage,
  role,
  agents = [],
  campaigns = [],
  nextTaskMap = {},
  embedCampaignId,
  embedQueryParams,
}: LeadsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isScout = role === "admin" || role === "founder" || role === "manager";
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Query helpers ────────────────────────────────────────

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        value === null ? current.delete(key) : current.set(key, value);
      });
      if (embedQueryParams) {
        Object.entries(embedQueryParams).forEach(([k, v]) => current.set(k, v));
      }
      return current.toString();
    },
    [searchParams, embedQueryParams],
  );

  const handleSearch = (value: string) =>
    router.push(
      `${pathname}?${createQueryString({ q: value || null, page: "1" })}`,
    );

  const handleStatusFilter = (value: string) =>
    router.push(
      `${pathname}?${createQueryString({ status: value === "ALL" ? null : value, page: "1" })}`,
    );

  const handleAgentFilter = (value: string) =>
    router.push(
      `${pathname}?${createQueryString({ agent: value === "ALL" ? null : value, page: "1" })}`,
    );

  const handleCampaignFilter = (value: string) => {
    if (embedCampaignId) return;
    router.push(
      `${pathname}?${createQueryString({ campaign: value === "ALL" ? null : value, page: "1" })}`,
    );
  };

  const handleSourceFilter = (value: string) =>
    router.push(
      `${pathname}?${createQueryString({ source: value === "ALL" ? null : value, page: "1" })}`,
    );

  const handlePage = (newPage: number) =>
    router.push(`${pathname}?${createQueryString({ page: String(newPage) })}`);

  const handleDateFilter = (value: string | null) =>
    router.push(`${pathname}?${createQueryString({ dateFilter: value, page: "1" })}`);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  const currentSearch = searchParams.get("q") ?? "";
  const currentStatus = searchParams.get("status") ?? "ALL";
  const currentAgent = searchParams.get("agent") ?? "ALL";
  const currentCampaign =
    embedCampaignId ?? searchParams.get("campaign") ?? "ALL";
  const currentSource = searchParams.get("source") ?? "ALL";
  const currentDateFilter = searchParams.get("dateFilter");
  const SOURCE_OPTIONS = [
    { value: "ALL", label: "All sources" },
    { value: "meta", label: "Meta Ads" },
    { value: "google", label: "Google Ads" },
    { value: "website", label: "Website" },
    { value: "events", label: "Events" },
    { value: "referral", label: "Referral" },
  ];

  // ── Column definitions ────────────────────────────────────────────────────
  // Agent:        Client · Contact · Status · Next Action · Added           (5)
  // Scout/Admin:  Client · Contact · Status · Source · Notes · Campaign · Agent · Added (8)

  const totalColCount = isScout ? 8 : 5;

  /** line-clamp on SelectTrigger's [&>span] breaks icon+label flex rows — see `leadsFilterTriggerVariants`. */
  return (
    <div className="space-y-4">
      {/* ── Toolbar (single row; scrolls horizontally if needed) ───────── */}
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-4 mb-4 border-b border-stone-100 [scrollbar-width:thin]">
        <div className="relative min-w-42 max-w-64 flex-1 basis-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search"
            defaultValue={currentSearch}
            onChange={(e) => {
              const val = e.target.value;
              if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
              searchTimeoutRef.current = setTimeout(() => handleSearch(val), 380);
            }}
            className="h-9 w-full min-w-0 border border-stone-200 bg-stone-50/50 py-2 pl-9 pr-3 text-sm text-stone-800 shadow-none transition-colors placeholder:text-stone-400 hover:bg-stone-50 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300 rounded-lg"
          />
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <Select defaultValue={currentStatus} onValueChange={handleStatusFilter}>
          <SelectTrigger
            className={cn(
              "min-w-44 w-44",
              leadsFilterTriggerVariants({ control: "select" }),
              currentStatus !== "ALL" && leadsFilterTriggerActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
              <Filter className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
              <SelectValue
                placeholder="Status"
                className="min-w-0 flex-1 truncate text-left"
              />
            </span>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isScout && agents.length > 0 && (
          <Select defaultValue={currentAgent} onValueChange={handleAgentFilter}>
            <SelectTrigger
              className={cn(
                "min-w-44 w-44",
                leadsFilterTriggerVariants({ control: "select" }),
                currentAgent !== "ALL" && leadsFilterTriggerActiveClass,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <SelectValue
                  placeholder="All agents"
                  className="min-w-0 flex-1 truncate text-left"
                />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isScout && campaigns.length > 0 && !embedCampaignId && (
          <Select
            defaultValue={currentCampaign}
            onValueChange={handleCampaignFilter}
          >
            <SelectTrigger
              className={cn(
                "min-w-52 w-52",
                leadsFilterTriggerVariants({ control: "select" }),
                currentCampaign !== "ALL" && leadsFilterTriggerActiveClass,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
                <Megaphone className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <SelectValue
                  placeholder="Campaign"
                  className="min-w-0 flex-1 truncate text-left"
                />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isScout && (
          <Select
            defaultValue={currentSource}
            onValueChange={handleSourceFilter}
          >
            <SelectTrigger
              className={cn(
                "min-w-44 w-44",
                leadsFilterTriggerVariants({ control: "select" }),
                currentSource !== "ALL" && leadsFilterTriggerActiveClass,
              )}
            >
              <span className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
                <Globe className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                <SelectValue
                  placeholder="Source"
                  className="min-w-0 flex-1 truncate text-left"
                />
              </span>
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <LeadsTableDateFilterPopover
          currentDateFilter={currentDateFilter}
          onDateFilter={handleDateFilter}
          isActive={!!currentDateFilter}
          activeTriggerClassName={leadsFilterTriggerActiveClass}
        />

        <p className="shrink-0 whitespace-nowrap pl-1 text-xs font-medium tabular-nums text-stone-500">
          {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""}
        </p>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div
        className={surfaceCardVariants({
          tone: "luxury",
          elevation: "sm",
          overflow: "hidden",
        })}
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <table
            className="w-full text-sm"
            style={{ minWidth: isScout ? "1280px" : "820px" }}
          >
            <thead>
              <tr className="border-b border-[#EEEDE9] bg-[#FAFAF8]">
                <Th>Client</Th>
                <Th>Contact</Th>
                <Th tight>Status</Th>

                {isScout ? (
                  <>
                    {/* Scout/Admin/Finance: Source · Notes · Campaign · Agent */}
                    <Th tight>Source</Th>
                    <Th tight>Notes</Th>
                    <Th tight>Campaign</Th>
                    <Th tight>Agent</Th>
                  </>
                ) : (
                  <Th>Next Action</Th>
                )}

                <Th align="right">Added</Th>
              </tr>
            </thead>

            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={totalColCount}
                    className="text-center py-20 text-[#C8C4BC] text-sm"
                  >
                    No leads found matching your criteria.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isScout={isScout}
                    nextTask={nextTaskMap[lead.id] ?? null}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────── */}
        {totalPages > 1 && (
          <div className="px-6 py-3.5 border-t border-[#EEEDE9] flex items-center justify-between bg-[#FAFAF8]">
            <p className="text-xs text-[#B5A99A]">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handlePage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= totalPages - 2)
                  page = totalPages - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "gold" : "outline"}
                    size="icon-sm"
                    onClick={() => handlePage(page)}
                    className="text-xs w-7 h-7"
                  >
                    {page}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => handlePage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LeadRow ────────────────────────────────────────────────

function LeadRow({
  lead,
  isScout,
  nextTask,
  onClick,
}: {
  lead: Lead;
  isScout: boolean;
  nextTask: NextTask | null;
  onClick: () => void;
}) {
  const router = useRouter();
  const assignedAgent = (
    lead as Lead & { assigned_agent?: { full_name: string } }
  ).assigned_agent;

  return (
    <tr
      onMouseEnter={() => void router.prefetch(`/leads/${lead.id}`)}
      onClick={onClick}
      className={cn(
        "animate-in fade-in duration-300",
        "border-b border-[#F4F3EF] last:border-0 hover:bg-[#FAFAF8] transition-colors duration-300 cursor-pointer group",
      )}
    >
      {/* ── Client ───────────────────────── */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#F2F2EE] flex items-center justify-center text-[10px] font-semibold text-[#8A8A6E] shrink-0 select-none">
            {getInitials(
              [lead.first_name, lead.last_name].filter(Boolean).join(" "),
            )}
          </div>
          <span className="font-medium text-[#1A1A1A] truncate max-w-[160px] leading-none">
            {lead.first_name} {lead.last_name ?? ""}
          </span>
        </div>
      </td>

      {/* ── Contact ──────────────────────── */}
      <td className="px-6 py-4">
        <div className="space-y-0.5">
          <div
            className="flex items-center gap-1.5 text-[#1A1A1A]"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="w-3 h-3 text-[#B5A99A] shrink-0" />
            <a
              href={`tel:${lead.phone_number}`}
              className="text-xs font-mono hover:text-[#D4AF37] transition-colors"
            >
              {lead.phone_number}
            </a>
          </div>
          {lead.email && (
            <div
              className="flex items-center gap-1.5 text-[#9E9E9E]"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="w-3 h-3 shrink-0" />
              <a
                href={`mailto:${lead.email}`}
                className="text-xs truncate max-w-[160px] hover:text-[#D4AF37] transition-colors"
              >
                {lead.email}
              </a>
            </div>
          )}
        </div>
      </td>

      {/* ── Status — whitespace-nowrap prevents "In Discussion" from wrapping */}
      <td className="px-4 py-4 whitespace-nowrap">
        <LeadStatusBadge status={lead.status} size="sm" />
      </td>

      {isScout ? (
        <>
          {/* Source */}
          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
            <LeadSourceBadge
              utmSource={lead.utm_source}
              utmMedium={lead.utm_medium}
              utmCampaign={lead.utm_campaign}
              variant="icon"
            />
          </td>

          {/* Marketing Notes */}
          <td className="px-4 py-4 max-w-[260px]">
            {lead.notes ? (
              <p
                className="text-xs text-[#6B6B6B] leading-relaxed line-clamp-2"
                title={lead.notes}
              >
                {lead.notes}
              </p>
            ) : (
              <span className="text-[#D0C8BE] text-xs italic select-none">
                —
              </span>
            )}
          </td>

          {/* Campaign */}
          <td className="px-4 py-4 max-w-[180px]">
            {lead.utm_campaign ? (
              <span
                className="text-xs text-[#6B6B6B] truncate block max-w-[160px]"
                title={lead.utm_campaign}
              >
                {lead.utm_campaign}
              </span>
            ) : (
              <span className="text-[#D0C8BE] text-xs select-none">—</span>
            )}
          </td>

          {/* Agent */}
          <td className="px-4 py-4 text-xs text-[#6B6B6B] whitespace-nowrap">
            {assignedAgent?.full_name ?? (
              <span className="text-[#D0C8BE]">Unassigned</span>
            )}
          </td>
        </>
      ) : (
        /* ── Next Action (agent / manager view) ─── */
        <td
          className="px-6 py-4 max-w-[240px]"
          onClick={(e) => e.stopPropagation()}
        >
          <NextActionCell task={nextTask} leadId={lead.id} />
        </td>
      )}

      {/* ── Added (date + time, hours & minutes) ───────────────────── */}
      <td className="px-6 py-4 text-xs text-[#B5A99A] text-right whitespace-nowrap">
        {formatIST(lead.created_at, "MMM d, yyyy, h:mm a")}
      </td>
    </tr>
  );
}

// ── NextActionCell ─────────────────────────────────────────

function getTaskUrgency(
  dueDateIso: string,
): "overdue" | "today" | "tomorrow" | "future" {
  const now = new Date();
  const due = new Date(dueDateIso);
  const todayKey = formatIST(now, "yyyy-MM-dd");
  const dueKey = formatIST(due, "yyyy-MM-dd");
  const tomorrowKey = addCalendarDaysIST(todayKey, 1);

  if (due < now && dueKey !== todayKey) return "overdue";

  if (dueKey === todayKey) return "today";
  if (dueKey === tomorrowKey) return "tomorrow";
  return "future";
}

function formatTaskTime(dueDateIso: string): string {
  return formatIST(dueDateIso, "h:mm a");
}

function NextActionCell({
  task,
  leadId,
}: {
  task: NextTask | null;
  leadId: string;
}) {
  const router = useRouter();

  if (!task) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          void router.push(`/leads/${leadId}`);
        }}
        className="flex items-center gap-1.5 text-[10px] text-[#C8C4BC] hover:text-[#D4AF37]
                   border border-dashed border-[#E5E4DF] hover:border-[#D4AF37]/40
                   rounded-md px-2 py-1 transition-colors group/btn"
      >
        <Plus className="w-2.5 h-2.5 group-hover/btn:text-[#D4AF37]" />
        Add task
      </button>
    );
  }

  const urgency = getTaskUrgency(task.due_date);

  const dotColors = {
    overdue: "bg-red-500   shadow-[0_0_6px_1px_rgba(239,68,68,0.5)]",
    today: "bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.5)]",
    tomorrow: "bg-[#D4AF37] shadow-[0_0_6px_1px_rgba(212,175,55,0.45)]",
    future: "bg-[#B5A99A]",
  } as const;

  const labelColors = {
    overdue: "text-red-600",
    today: "text-[#2D7A4F]",
    tomorrow: "text-[#9A7A1A]",
    future: "text-[#6B6B6B]",
  } as const;

  const timeLabel = {
    overdue: "Overdue",
    today: formatTaskTime(task.due_date),
    tomorrow: "Tomorrow",
    future: formatIST(task.due_date, "MMM d"),
  } as const;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Status dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[urgency]}`}
      />

      <div className="min-w-0">
        <p className="text-xs text-[#1A1A1A] truncate max-w-[180px] leading-none mb-0.5">
          {task.title}
        </p>
        <div className="flex items-center gap-1">
          <CalendarClock className="w-2.5 h-2.5 text-[#B5A99A] shrink-0" />
          <span className={`text-[10px] font-medium ${labelColors[urgency]}`}>
            {timeLabel[urgency]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Th helper ─────────────────────────────────────────────

function Th({
  children,
  align = "left",
  tight = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  tight?: boolean;
}) {
  return (
    <th
      className={`${tight ? "px-4" : "px-6"} py-3.5 text-[10px] font-semibold text-[#B5A99A] uppercase tracking-widest whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

// ── Skeleton ──────────────────────────────────────────────

export function LeadsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 flex-1 max-w-xs" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div
        className={surfaceCardVariants({
          tone: "luxury",
          elevation: "none",
          overflow: "hidden",
        })}
      >
        <div className="px-6 py-3.5 border-b border-[#EEEDE9] bg-[#FAFAF8] flex gap-10">
          {["Client", "Contact", "Status", "Notes", "Added"].map((col) => (
            <Skeleton key={col} className="h-2.5 w-14" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-10 px-6 py-4 border-b border-[#F4F3EF] last:border-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
