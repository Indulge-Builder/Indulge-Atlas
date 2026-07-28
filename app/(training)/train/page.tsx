import Link from "next/link";
import { getScenarioGroups, getStoreMeta } from "@/training/store/loadScenarios";
import { CONCIERGE_PRIORITY_LABELS } from "@/lib/types/database";

const PRIORITY_TINT: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-sky-100 text-sky-700",
  urgent: "bg-red-100 text-red-700",
};

export default function TrainingIndexPage() {
  const groups = getScenarioGroups();
  const meta = getStoreMeta();
  const total = groups.reduce((n, g) => n + g.scenarios.length, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 rounded-2xl bg-white/[0.04] p-4">
        <h1 className="text-lg font-semibold">Pick a scenario</h1>
        <p className="mt-1 text-[13px] text-white/60">
          {total} completed member requests, replayed as timed drills. Each is anonymised and read-only —
          no live members, no writes.
        </p>
        <p className="mt-1 text-[11px] text-white/35">
          Store: {meta.source} · generated {meta.generatedAt.slice(0, 10)}
        </p>
      </div>

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-white/70">{g.label}</h2>
              <span className="text-[11px] text-white/35">{g.scenarios.length}</span>
              {g.needsBackfill ? (
                <span
                  title="These scenarios lack a Freshdesk sub-category (~59% are empty upstream). Grouped by category as a fallback until sub-category is backfilled."
                  className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                >
                  sub-category backfill needed
                </span>
              ) : null}
            </div>

            <ul className="space-y-2">
              {g.scenarios.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/train/${s.id}`}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5 transition hover:bg-white/[0.06]"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#075E54] text-sm">
                      🧞
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-white/90">{s.title}</div>
                      <div className="mt-0.5 text-[11px] text-white/40">
                        {s.category ?? "Uncategorised"}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        PRIORITY_TINT[s.priority] ?? "bg-white/10 text-white/60"
                      }`}
                    >
                      {CONCIERGE_PRIORITY_LABELS[s.priority]}
                    </span>
                    <span className="shrink-0 text-white/30">▶</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
