"use client";

import { useMemo, useState, useEffect, useTransition, useRef } from "react";
import { Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import type { OnboardingOverviewData } from "@/lib/types/onboarding-overview";
import {
  OVERVIEW_DOMAINS,
  type OverviewDomainKey,
} from "@/lib/constants/onboarding-overview";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getOnboardingOverview } from "@/lib/actions/dashboards";
import type { DateRangeBounds } from "./OverviewDateFilter";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function DomainLeadCard({
  label,
  count,
  accent,
  periodLabel,
}: {
  label: string;
  count: number;
  accent: { pillBg: string; pillColor: string };
  periodLabel: string;
}) {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "p-6",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: accent.pillBg, color: accent.pillColor }}
        >
          {label}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-stone-900">
        {count}
      </p>
      <p className="mt-1 text-xs text-stone-500 truncate" title={periodLabel}>
        Leads · {periodLabel}
      </p>
    </div>
  );
}

function PipelineSection({
  stages,
  domainLabel,
}: {
  stages: OnboardingOverviewData["domains"][OverviewDomainKey]["pipelineStages"];
  domainLabel: string;
}) {
  const total = stages.reduce((s, x) => s + x.count, 0);

  return (
    <div className="mt-6">
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-stone-500">
          No leads in {domainLabel} for this period.
        </p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
            {stages.map((s) => {
              const pct = (s.count / total) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={s.key}
                  className={cn(s.colorClass, "h-full min-w-[2px] transition-all")}
                  style={{ width: `${pct}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              );
            })}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {stages.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2.5 w-2.5 rounded-full", s.colorClass)} />
                <span className="text-stone-600">{s.label}</span>
                <span className="tabular-nums font-medium text-stone-900">
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AgentRow({
  agent,
}: {
  agent: OnboardingOverviewData["domains"][OverviewDomainKey]["agents"][number];
}) {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "flex w-full flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold text-stone-600 ring-2 ring-stone-200/60">
          {getInitials(agent.fullName)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-stone-900">{agent.fullName}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
            <span>
              <span className="text-stone-400">Total </span>
              <span className="tabular-nums font-semibold text-stone-800">
                {agent.totalLeads}
              </span>
            </span>
            <span>
              <span className="text-stone-400">New </span>
              <span className="tabular-nums font-semibold text-amber-700">
                {agent.new}
              </span>
            </span>
            <span>
              <span className="text-stone-400">Attempted </span>
              <span className="tabular-nums font-semibold text-sky-700">
                {agent.attempted}
              </span>
            </span>
            <span>
              <span className="text-stone-400">In discussion </span>
              <span className="tabular-nums font-semibold text-violet-700">
                {agent.inDiscussion}
              </span>
            </span>
            <span>
              <span className="text-stone-400">Junk </span>
              <span className="tabular-nums font-semibold text-stone-600">
                {agent.junk}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3",
          "bg-brand-gold/12 ring-1 ring-brand-gold/25",
        )}
      >
        <Trophy className="h-4 w-4 text-brand-gold-dark" strokeWidth={1.5} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-gold-dark">
            Conversions
          </p>
          <p className="text-lg font-semibold tabular-nums text-stone-900">
            {agent.conversions}
          </p>
        </div>
      </div>
    </div>
  );
}


interface OnboardingOverviewTabProps {
  initialData: OnboardingOverviewData;
  dateRange: DateRangeBounds;
}

export function OnboardingOverviewTab({ initialData, dateRange }: OnboardingOverviewTabProps) {
  const [domain, setDomain] = useState<OverviewDomainKey>("indulge_global");
  const [data, setData] = useState<OnboardingOverviewData>(initialData);
  const [isPending, startTransition] = useTransition();

  const domainTabs = useMemo(
    () =>
      OVERVIEW_DOMAINS.map((d) => ({
        ...d,
        config: DOMAIN_DISPLAY_CONFIG[d.key],
      })),
    [],
  );

  // Re-fetch whenever the date range changes (skip on first mount — initialData covers it)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    startTransition(async () => {
      const fresh = await getOnboardingOverview(dateRange.startIso, dateRange.endIso);
      setData(fresh);
    });
  }, [dateRange.startIso, dateRange.endIso]);

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity duration-200", isPending && "opacity-50 pointer-events-none")}>
      <p className="text-xs text-stone-500">
        Lead volume by business unit — {data.monthLabel}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.monthlyCards.map((card) => {
          const accent = DOMAIN_DISPLAY_CONFIG[card.domain];
          return (
            <button
              key={card.domain}
              type="button"
              onClick={() => setDomain(card.domain)}
              className={cn(
                "text-left transition-all",
                domain === card.domain && "ring-2 ring-brand-gold/40 rounded-2xl",
              )}
            >
              <DomainLeadCard
                label={card.label}
                count={card.leadsThisMonth}
                accent={accent}
                periodLabel={data.monthLabel}
              />
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "p-6",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3
              className="text-sm font-semibold text-stone-900"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Pipeline &amp; team
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Status breakdown and assignee stats for the selected unit
            </p>
          </div>
        </div>

        <Tabs
          value={domain}
          onValueChange={(v) => setDomain(v as OverviewDomainKey)}
          className="mt-5"
          indicatorLayoutId="overview-domain-indicator"
        >
          <TabsList className="w-full max-w-full flex-wrap justify-start">
            {domainTabs.map((d) => (
              <TabsTrigger key={d.key} value={d.key} className="capitalize">
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {domainTabs.map((d) => {
            const domainSlice = data.domains[d.key];
            return (
              <TabsContent key={d.key} value={d.key} animated={false}>
                <PipelineSection
                  stages={domainSlice.pipelineStages}
                  domainLabel={d.label}
                />

                <div className="mt-8 border-t border-stone-100 pt-6">
                  <div className="mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4 text-stone-500" strokeWidth={1.5} />
                    <h4 className="text-sm font-semibold text-stone-900">
                      Agents — {d.label}
                    </h4>
                    <span className="text-xs text-stone-500">
                      ({domainSlice.agents.length})
                    </span>
                  </div>

                  {domainSlice.agents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-stone-500">
                      No assigned leads for {d.label} in this period.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {domainSlice.agents.map((agent) => (
                        <AgentRow key={agent.agentId} agent={agent} />
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

export function OnboardingOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-3 w-48 rounded bg-stone-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]"
          >
            <div className="h-3 w-16 rounded bg-stone-200" />
            <div className="mt-6 h-9 w-12 rounded bg-stone-200" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="h-4 w-32 rounded bg-stone-200" />
        <div className="mt-6 h-8 w-full max-w-md rounded-xl bg-stone-100" />
        <div className="mt-8 h-3 w-full rounded-full bg-stone-100" />
      </div>
    </div>
  );
}
