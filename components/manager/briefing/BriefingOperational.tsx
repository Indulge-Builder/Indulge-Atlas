import type {
  BriefingPipelinePulse,
  BriefingRecentWin,
  BriefingStagnantLead,
} from "@/lib/briefing/executiveBriefing";
import type { LeadStatus } from "@/lib/types/database";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";

type PulseProps = { pulse: BriefingPipelinePulse };

const PIPELINE_SEGMENTS: {
  key: keyof Pick<
    BriefingPipelinePulse,
    "new" | "attempted" | "connected" | "in_discussion" | "nurturing" | "other"
  >;
  statusKey: LeadStatus | null;
  fallbackLabel?: string;
}[] = [
  { key: "new", statusKey: "new" },
  { key: "attempted", statusKey: "attempted" },
  { key: "connected", statusKey: "connected" },
  { key: "in_discussion", statusKey: "in_discussion" },
  { key: "nurturing", statusKey: "nurturing" },
  { key: "other", statusKey: null, fallbackLabel: "Other" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Rich fill from CRM primary `color` — Quiet Luxury depth without a chart lib. */
function crmSegmentGradient(hex: string): string {
  return [
    "linear-gradient(",
    "168deg,",
    `${rgba(hex, 0.72)} 0%,`,
    `${rgba(hex, 0.94)} 38%,`,
    `${rgba(hex, 0.88)} 72%,`,
    `${rgba(hex, 0.78)} 100%)`,
  ].join(" ");
}

export function BriefingPipelinePulseCard({ pulse }: PulseProps) {
  const { total } = pulse;

  const segments = PIPELINE_SEGMENTS.map(({ key, statusKey, fallbackLabel }) => {
    const count = pulse[key];
    const cfg = statusKey ? LEAD_STATUS_CONFIG[statusKey] : null;
    const label = cfg?.label ?? fallbackLabel ?? key;
    const colorHex = cfg?.color ?? "#78716c";
    return {
      key,
      count,
      label,
      description: cfg?.description,
      fill: crmSegmentGradient(colorHex),
      colorHex,
    };
  });

  return (
    <div className="rounded-xl border border-stone-200/60 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-800">
        Pipeline pulse
      </h3>
      {total === 0 ? (
        <p className="text-sm text-stone-500">No active pipeline in this workspace.</p>
      ) : (
        <>
          <div className="rounded-full bg-linear-to-b from-stone-100 to-stone-200/90 p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-stone-200/50">
            <div
              className="flex h-10 w-full overflow-hidden rounded-full bg-stone-300/30 shadow-inner"
              role="img"
              aria-label={`Open pipeline: ${total} leads across stages`}
            >
              {segments.map(({ key, count, label, description, fill }) =>
                count > 0 ? (
                  <div
                    key={key}
                    className="relative h-full min-w-[4px] cursor-default border-r border-white/35 transition-[filter] duration-200 last:border-r-0 hover:z-10 hover:brightness-[1.06] hover:saturate-[1.08] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
                    style={{ flexGrow: count, flexBasis: 0, background: fill }}
                    title={tooltipForSegment(label, count, total, description)}
                  >
                    <span className="sr-only">
                      {label}: {count} leads, {percentOfTotal(count, total)}% of open pipeline
                      {description ? `. ${description}` : ""}
                    </span>
                  </div>
                ) : null,
              )}
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5 text-xs text-stone-600">
            {segments
              .filter((s) => s.count > 0)
              .map(({ key, count, label, colorHex }) => (
                <li key={key} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full shadow-sm ring-1 ring-white/90"
                    style={{ backgroundColor: colorHex }}
                    aria-hidden
                  />
                  <span>
                    {label}{" "}
                    <span className="font-semibold tabular-nums text-stone-800">({count})</span>
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function percentOfTotal(count: number, total: number): string {
  if (total <= 0) return "0";
  return ((count / total) * 100).toFixed(1);
}

function tooltipForSegment(
  label: string,
  count: number,
  total: number,
  description?: string,
): string {
  const pct = percentOfTotal(count, total);
  const base = `${label} — ${count} lead${count === 1 ? "" : "s"} (${pct}% of open pipeline)`;
  return description ? `${base}. ${description}` : base;
}

type LedgerProps = {
  recentWins: BriefingRecentWin[];
  stagnantLeads: BriefingStagnantLead[];
};

export function BriefingSplitLedger({ recentWins, stagnantLeads }: LedgerProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-6">
      <div className="rounded-xl border border-stone-200/60 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-800">
          Yesterday&apos;s wins
        </h3>
        {recentWins.length === 0 ? (
          <p className="text-sm italic text-stone-500">
            No deals closed yesterday. Time to push the pipeline.
          </p>
        ) : (
          <ul className="space-y-3">
            {recentWins.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-2 border-b border-stone-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{w.leadName}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEAD_STATUS_CONFIG.won.className ?? ""}`}
                    >
                      Won
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                  <AgentGlyph name={w.agent?.full_name ?? "?"} />
                  <span className="truncate text-xs font-medium text-stone-600">
                    {w.agent?.full_name ?? "Unassigned"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-amber-100/80 bg-white p-5 shadow-sm ring-1 ring-rose-100/30">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-800">
          Intervention required
        </h3>
        {stagnantLeads.length === 0 ? (
          <p className="text-sm text-emerald-700/90">
            Pipeline is flowing smoothly. No stagnant leads.
          </p>
        ) : (
          <ul className="space-y-3">
            {stagnantLeads.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-1 border-b border-amber-100/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{s.leadName}</p>
                  <p className="text-xs text-rose-700/80">New · {s.staleLabel}</p>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <AgentGlyph name={s.agent?.full_name ?? "?"} />
                  <span className="truncate text-xs font-medium text-amber-900/85">
                    {s.agent?.full_name ?? "Unassigned"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AgentGlyph({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
      : (parts[0]?.slice(0, 2).toUpperCase() ?? "?");
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200/80"
      aria-hidden
    >
      {initials}
    </span>
  );
}
