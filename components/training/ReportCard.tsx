"use client";

import { formatOffset } from "@/training/replay/clock";
import { CONCIERGE_STATUS_LABELS } from "@/lib/types/database";
import type { AttemptReport, Scenario } from "@/training/types";

function scoreColor(n: number): string {
  if (n >= 80) return "#128C7E";
  if (n >= 50) return "#B7791F";
  return "#C53030";
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-black/60">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: scoreColor(value) }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: scoreColor(value) }} />
      </div>
    </div>
  );
}

function dur(ms: number | null): string {
  return ms == null ? "—" : formatOffset(ms);
}

export function ReportCard({ report, scenario }: { report: AttemptReport; scenario: Scenario }) {
  const { ttfr, stage, escalation, wrongTurns, breakdown } = report;

  return (
    <div className="space-y-4 rounded-xl bg-white p-4 text-black shadow-sm">
      {/* headline score */}
      <div className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-bold text-white"
          style={{ background: scoreColor(report.score) }}
        >
          {report.score}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Attempt report</div>
          <div className="truncate text-[12px] text-black/55">{scenario.title}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Bar label="Responsiveness" value={breakdown.responsiveness} />
        <Bar label="Stage accuracy" value={breakdown.stageAccuracy} />
        <Bar label="Escalation" value={breakdown.escalation} />
        <Bar label="Clean run" value={breakdown.cleanRun} />
      </div>

      {/* TTFR */}
      <section className="rounded-lg bg-black/[0.03] p-3 text-[13px]">
        <div className="mb-1 font-semibold">Time to first response</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-black/70">
          <span>You: <b className="tabular-nums">{dur(ttfr.internMs)}</b></span>
          <span>Real Genie: <b className="tabular-nums">{dur(ttfr.realMs)}</b></span>
          <span>SLA target: <b className="tabular-nums">{dur(ttfr.slaTargetMs)}</b></span>
          <span style={{ color: ttfr.withinSla ? "#128C7E" : "#C53030" }}>
            {ttfr.internMs == null ? "no reply sent" : ttfr.withinSla ? "within SLA ✓" : "SLA breached ✗"}
          </span>
        </div>
        {ttfr.deltaVsRealMs != null ? (
          <div className="mt-1 text-[12px] text-black/55">
            {ttfr.deltaVsRealMs === 0
              ? "Same pace as the real Genie."
              : ttfr.deltaVsRealMs > 0
                ? `${formatOffset(ttfr.deltaVsRealMs)} slower than the real Genie.`
                : `${formatOffset(-ttfr.deltaVsRealMs)} faster than the real Genie.`}
          </div>
        ) : null}
      </section>

      {/* stage path */}
      <section className="rounded-lg bg-black/[0.03] p-3 text-[13px]">
        <div className="mb-1 font-semibold">Stage path</div>
        <PathRow label="Your route" path={stage.path} />
        <PathRow label="A clean route" path={stage.expectedPath} muted />
        <div className="mt-1 text-[12px] text-black/55">
          {stage.reachedFinalStatus ? "Reached the real final status ✓" : "Did not reach the real final status ✗"}
          {stage.illegalTransitions > 0 ? ` · ${stage.illegalTransitions} illegal move(s)` : ""}
        </div>
      </section>

      {/* escalation */}
      <section className="rounded-lg bg-black/[0.03] p-3 text-[13px]">
        <div className="mb-1 font-semibold">Escalation</div>
        <div className="text-black/70">
          {escalation.shouldEscalate ? "This ticket was escalated by the real Genie." : "This ticket did not need escalation."}{" "}
          <span style={{ color: escalation.correct ? "#128C7E" : "#C53030" }}>
            {escalation.correct ? "You called it right ✓" : "You got this wrong ✗"}
          </span>
          {escalation.timingDeltaMs != null && escalation.timingDeltaMs > 0 ? (
            <span className="text-black/55"> · {formatOffset(escalation.timingDeltaMs)} late</span>
          ) : null}
        </div>
      </section>

      {/* wrong turns */}
      <section className="rounded-lg bg-black/[0.03] p-3 text-[13px]">
        <div className="mb-1 font-semibold">Wrong turns {wrongTurns.length ? `(${wrongTurns.length})` : ""}</div>
        {wrongTurns.length === 0 ? (
          <div className="text-[#128C7E]">None — clean run.</div>
        ) : (
          <ul className="space-y-1">
            {wrongTurns.map((w, i) => (
              <li key={i} className="flex gap-2 text-black/70">
                <span aria-hidden>⚠️</span>
                <span>
                  {w.detail}
                  {w.atMs != null ? <span className="text-black/45"> · at {formatOffset(w.atMs)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PathRow({ label, path, muted }: { label: string; path: string[]; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${muted ? "opacity-60" : ""}`}>
      <span className="mr-1 text-[11px] uppercase tracking-wide text-black/40">{label}</span>
      {path.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[11px]">
            {CONCIERGE_STATUS_LABELS[s as keyof typeof CONCIERGE_STATUS_LABELS] ?? s}
          </span>
          {i < path.length - 1 ? <span className="text-black/30">→</span> : null}
        </span>
      ))}
    </div>
  );
}
