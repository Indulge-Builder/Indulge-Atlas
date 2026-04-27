import {
  BriefingPipelinePulseCard,
  BriefingSplitLedger,
} from "@/components/manager/briefing/BriefingOperational";
import { BriefingSummaryCopy } from "@/components/manager/BriefingSummaryCopy";
import { BriefingDeltaPill } from "@/components/manager/BriefingDeltaPill";
import type {
  BriefingTrendMetric,
  YesterdayExecutiveBriefing,
} from "@/lib/briefing/executiveBriefing";

type Props = { briefing: YesterdayExecutiveBriefing };

export function MorningBriefing({ briefing }: Props) {
  const {
    dateLabel,
    executiveSummary,
    newLeads,
    tasksCompleted,
    dealsWon,
    dealsLost,
    topAgents,
    pipelinePulse,
    recentWins,
    stagnantLeadsList,
  } = briefing;

  return (
    <section
      className="mb-10 space-y-8 rounded-2xl border border-stone-200/80 bg-stone-50 px-6 py-7 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]"
      aria-labelledby="morning-briefing-heading"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h2
          id="morning-briefing-heading"
          className="font-serif text-xl font-medium tracking-tight text-stone-900"
        >
          Morning Briefing
        </h2>
        <p className="text-sm font-medium text-stone-500 sm:text-right">{dateLabel}</p>
      </header>

      <blockquote className="relative border-l-[3px] border-amber-200/90 pl-5 pr-10">
        <BriefingSummaryCopy
          text={executiveSummary}
          className="absolute right-0 top-0 rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
        />
        <p className="whitespace-pre-line text-lg font-medium leading-relaxed text-stone-800">
          {executiveSummary}
        </p>
      </blockquote>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
        <MetricWithTrend label="New leads" metric={newLeads} />
        <MetricWithTrend label="Follow-ups" metric={tasksCompleted} />
        <Metric label="Deals won" value={dealsWon} />
        <Metric label="Deals lost" value={dealsLost} />
      </div>

      <BriefingPipelinePulseCard pulse={pipelinePulse} />

      <BriefingSplitLedger recentWins={recentWins} stagnantLeads={stagnantLeadsList} />

      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
          Hustle board
        </h3>
        {topAgents.length === 0 ? (
          <p className="text-sm text-stone-500">No task completions logged yesterday.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-stone-200/70 border-t border-b border-stone-200/70 sm:flex-row sm:divide-x sm:divide-y-0">
            {topAgents.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className="flex flex-1 items-center justify-between gap-4 py-3 sm:px-4 sm:py-3"
              >
                <span className="text-sm font-medium text-stone-700">{row.name}</span>
                <span className="tabular-nums text-sm text-stone-500">
                  {row.tasks} task{row.tasks === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MetricWithTrend({ label, metric }: { label: string; metric: BriefingTrendMetric }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-stone-900 md:text-[1.65rem]">
        {metric.value}
      </p>
      <BriefingDeltaPill metric={metric} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-stone-900 md:text-[1.65rem]">
        {value}
      </p>
    </div>
  );
}
