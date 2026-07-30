"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, BarChart3, SlidersHorizontal, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";

import {
  StatusBadge,
  PriorityDot,
  OverdueBadge,
  SlaCountdown,
  timeInStatus,
} from "@/components/concierge/tickets/ticketPresentation";
import type { TicketsIndexProps } from "@/components/concierge/tickets/panelTypes";
import {
  getMyTickets,
  getTicketQueue,
} from "@/lib/actions/concierge-tickets";
import {
  CONCIERGE_STATUS_LABELS,
  CONCIERGE_PRIORITY_LABELS,
  CONCIERGE_GROUP_LABELS,
  type TicketListFilters,
  type TicketListItem,
  type ConciergeTicketStatus,
  type ConciergeTicketPriority,
  type ConciergeGroup,
} from "@/lib/types/database";

const ALL = "all" as const;

type StatusFilter = ConciergeTicketStatus | "all";
type PriorityFilter = ConciergeTicketPriority | "all";
type BillableFilter = "yes" | "no" | "all";
type CreatedFilter = "today" | "yesterday" | "this_week" | "this_month" | "all";
type GroupFilter = ConciergeGroup | "all";

interface SelectOption {
  value: string;
  label: string;
}

/** Format a date-only string (YYYY-MM-DD) as e.g. "Jul 25", forcing local parse. */
function formatScheduled(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn("h-9 w-auto min-w-[9rem]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: "All statuses" },
  ...(Object.entries(CONCIERGE_STATUS_LABELS) as [ConciergeTicketStatus, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: ALL, label: "All priorities" },
  ...(Object.entries(CONCIERGE_PRIORITY_LABELS) as [ConciergeTicketPriority, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

const BILLABLE_OPTIONS: SelectOption[] = [
  { value: ALL, label: "All billing" },
  { value: "yes", label: "Billable" },
  { value: "no", label: "Non-billable" },
];

const CREATED_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Any time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
];

const SCHEDULED_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Any schedule" },
  { value: "today", label: "Scheduled today" },
  { value: "yesterday", label: "Scheduled yesterday" },
  { value: "this_week", label: "Scheduled this week" },
  { value: "this_month", label: "Scheduled this month" },
];

const GROUP_OPTIONS: SelectOption[] = [
  { value: ALL, label: "All groups" },
  ...(Object.entries(CONCIERGE_GROUP_LABELS) as [ConciergeGroup, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

// value encodes "<sort>:<dir>"; split when calling the action.
const SORT_OPTIONS: SelectOption[] = [
  { value: "created:desc", label: "Sort: Newest" },
  { value: "created:asc", label: "Sort: Oldest" },
  { value: "priority:desc", label: "Sort: Priority" },
  { value: "updated:desc", label: "Sort: Recently updated" },
  { value: "due:asc", label: "Sort: Due date" },
];

export function TicketsIndex({
  initialTickets,
  scope: initialScope,
  canViewQueue,
  canManageQueue,
  isAdmin,
  categories,
  agents,
}: TicketsIndexProps) {
  const [scope, setScope] = useState<"mine" | "queue">(
    canViewQueue ? initialScope : "mine",
  );
  const [tickets, setTickets] = useState<TicketListItem[]>(initialTickets);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [billable, setBillable] = useState<BillableFilter>("all");
  const [createdRange, setCreatedRange] = useState<CreatedFilter>("all");
  const [scheduledRange, setScheduledRange] = useState<CreatedFilter>("all");
  const [agent, setAgent] = useState<string>("all");
  const [group, setGroup] = useState<GroupFilter>("all");
  const [sort, setSort] = useState<string>("created:desc");

  const debouncedSearch = useDebounce(search, 300);
  const isFirstRun = useRef(true);

  const topLevelCategories = categories.filter((category) => !category.parent_id);

  const categoryOptions: SelectOption[] = [
    { value: ALL, label: "All categories" },
    ...topLevelCategories.map((category) => ({ value: category.id, label: category.name })),
  ];

  const agentOptions: SelectOption[] = [
    { value: ALL, label: "All agents" },
    { value: "unassigned", label: "Unassigned" },
    { value: "overdue", label: "Overdue" },
    ...agents.map((option) => ({ value: option.id, label: option.full_name })),
  ];

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const [sortKey, sortDir] = sort.split(":") as [
      NonNullable<TicketListFilters["sort"]>,
      "asc" | "desc",
    ];
    const filters: TicketListFilters = {
      scope,
      status: status === "all" ? undefined : status,
      priority: priority === "all" ? undefined : priority,
      categoryId: categoryId === "all" ? undefined : categoryId,
      billable: billable === "all" ? undefined : billable,
      createdRange: createdRange === "all" ? undefined : createdRange,
      scheduledRange: scheduledRange === "all" ? undefined : scheduledRange,
      agent: scope === "queue" && agent !== "all" ? agent : undefined,
      group: scope === "queue" && isAdmin && group !== "all" ? group : undefined,
      sort: sortKey,
      sortDir,
      search: debouncedSearch.trim() || undefined,
    };

    startTransition(async () => {
      const result =
        scope === "queue" ? await getTicketQueue(filters) : await getMyTickets(filters);
      setTickets(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, debouncedSearch, status, priority, categoryId, billable, createdRange, scheduledRange, agent, group, sort]);

  const showSkeleton = isPending && tickets.length === 0;
  const showEmpty = !isPending && tickets.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Concierge Tickets
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
          </p>
        </div>
        {canManageQueue ? (
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Button asChild variant="outline">
                <Link href="/concierge/tickets/sla-policies">
                  <SlidersHorizontal className="h-4 w-4" />
                  SLA Policies
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/concierge/tickets/reports">
                <BarChart3 className="h-4 w-4" />
                Reports
              </Link>
            </Button>
            <Button asChild variant="gold">
              <Link href="/concierge/tickets/new">
                <Plus className="h-4 w-4" />
                New ticket
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      {canViewQueue ? (
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              scope === "mine"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            My Tickets
          </button>
          <button
            type="button"
            onClick={() => setScope("queue")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              scope === "queue"
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            Queue
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search #ref, title, client, phone"
            aria-label="Search tickets by ref, title, client name or phone"
            className="w-64 pl-8"
          />
        </div>

        <FilterSelect
          ariaLabel="Sort tickets"
          value={sort}
          onChange={setSort}
          options={SORT_OPTIONS}
        />
        <FilterSelect
          ariaLabel="Filter by status"
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          ariaLabel="Filter by priority"
          value={priority}
          onChange={(value) => setPriority(value as PriorityFilter)}
          options={PRIORITY_OPTIONS}
        />
        <FilterSelect
          ariaLabel="Filter by category"
          value={categoryId}
          onChange={setCategoryId}
          options={categoryOptions}
        />
        <FilterSelect
          ariaLabel="Filter by billable"
          value={billable}
          onChange={(value) => setBillable(value as BillableFilter)}
          options={BILLABLE_OPTIONS}
        />
        <FilterSelect
          ariaLabel="Filter by created date"
          value={createdRange}
          onChange={(value) => setCreatedRange(value as CreatedFilter)}
          options={CREATED_OPTIONS}
        />
        <FilterSelect
          ariaLabel="Filter by scheduled date"
          value={scheduledRange}
          onChange={(value) => setScheduledRange(value as CreatedFilter)}
          options={SCHEDULED_OPTIONS}
        />

        {scope === "queue" ? (
          <FilterSelect
            ariaLabel="Filter by agent"
            value={agent}
            onChange={setAgent}
            options={agentOptions}
          />
        ) : null}
        {scope === "queue" && isAdmin ? (
          <FilterSelect
            ariaLabel="Filter by group"
            value={group}
            onChange={(value) => setGroup(value as GroupFilter)}
            options={GROUP_OPTIONS}
          />
        ) : null}
      </div>

      {showSkeleton ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <div
              key={key}
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "h-16 animate-pulse bg-neutral-100/60",
              )}
            />
          ))}
        </div>
      ) : showEmpty ? (
        <div
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "flex flex-col items-center justify-center gap-1 px-6 py-16 text-center",
          )}
        >
          <p className="text-sm font-medium text-neutral-900">No tickets</p>
          <p className="text-sm text-neutral-500">
            Nothing matches the current filters.
          </p>
        </div>
      ) : (
        <ul className={cn("space-y-2", isPending && "opacity-60")}>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/concierge/tickets/${ticket.id}`}
                className={cn(
                  surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                  "flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:border-brand-gold/50",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono text-xs text-neutral-400">
                    #{ticket.ref_number}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {ticket.title}
                    </p>
                    {ticket.client ? (
                      <p className="truncate text-xs text-neutral-500">
                        {ticket.client.name}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={ticket.status} />
                  <PriorityDot priority={ticket.priority} />
                  {ticket.is_overdue ? <OverdueBadge /> : null}
                  {ticket.sla_resolution_due &&
                  ticket.status !== "resolved" &&
                  ticket.status !== "closed" ? (
                    <SlaCountdown
                      dueIso={ticket.sla_resolution_due}
                      isOverdue={ticket.is_overdue}
                      withIcon
                      className="hidden lg:inline-flex"
                    />
                  ) : null}
                  {ticket.scheduled_on ? (
                    <span
                      className="hidden items-center gap-1 text-xs text-neutral-500 sm:inline-flex"
                      title={`Scheduled for ${ticket.scheduled_on}`}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatScheduled(ticket.scheduled_on)}
                    </span>
                  ) : null}
                  {ticket.category_name ? (
                    <span className="hidden text-xs text-neutral-500 sm:inline">
                      {ticket.category_name}
                    </span>
                  ) : null}
                  {ticket.assignee ? (
                    <span className="hidden text-xs text-neutral-500 md:inline">
                      {ticket.assignee.full_name}
                    </span>
                  ) : null}
                  <span className="text-xs text-neutral-400">
                    {timeInStatus(ticket.status_changed_at)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
