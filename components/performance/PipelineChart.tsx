"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import type { PipelineStage } from "@/lib/actions/performance";

// ── Bar colour config ─────────────────────────────────────────
// All stages use a muted warm-grey track; Won breaks through
// with the signature gold so the eye is pulled to the goal.

const BAR_COLORS: Record<string, string> = {
  New:        "#D8D3CC",
  Attempted:  "#C5B8A8",
  Discussion: "#A89E92",
  Nurturing:  "#B5A99A",
  Won:        "#D4AF37",
};

// ── Custom rounded-top bar ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RoundedBar(props: any) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  const r = Math.min(7, width / 2, height);
  return (
    <path
      d={`
        M${x + r},${y}
        H${x + width - r}
        Q${x + width},${y} ${x + width},${y + r}
        V${y + height}
        H${x}
        V${y + r}
        Q${x},${y} ${x + r},${y}
        Z
      `}
      fill={fill}
    />
  );
}

// ── Dark serif tooltip ────────────────────────────────────────

interface TooltipPayload {
  value: number;
  payload: PipelineStage;
}

function PipelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload[0].payload.value;
  return (
    <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-[#9E9E9E] text-[10px] mb-1.5 uppercase tracking-wider">
        {label}
      </p>
      <p
        className="text-white text-2xl font-semibold leading-none"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {total}
      </p>
      <p className="text-[#D4AF37] text-[10px] mt-1">
        lead{total !== 1 ? "s" : ""} in this stage
      </p>
    </div>
  );
}

// ── Stage summary pill ────────────────────────────────────────

function StagePill({ stage }: { stage: PipelineStage }) {
  const isWon = stage.isWon;
  return (
    <div className="flex-1 text-center">
      <p
        className="text-[#1A1A1A] text-sm font-semibold leading-none"
        style={{
          fontFamily: "var(--font-playfair)",
          color: isWon && stage.value > 0 ? "#D4AF37" : "#1A1A1A",
        }}
      >
        {stage.value}
      </p>
      <p className="text-[#B0ADA8] text-[9px] mt-0.5 uppercase tracking-[0.12em]">
        {stage.stage}
      </p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────

interface PipelineFunnelProps {
  stages: PipelineStage[];
}

export function PipelineChart({ stages }: PipelineFunnelProps) {
  const totalLeads = stages.reduce((s, st) => s + st.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white border border-[#EAEAEA] rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3
            className="text-[#1A1A1A] font-semibold text-base"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Pipeline Funnel
          </h3>
          <p className="text-[#9E9E9E] text-[12px] mt-0.5">
            Current lead distribution across all stages
          </p>
        </div>

        {/* Total callout */}
        <div className="text-right">
          <p
            className="text-[#1A1A1A] text-2xl font-semibold leading-none"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {totalLeads}
          </p>
          <p className="text-[#9E9E9E] text-[10px] mt-0.5">leads this period</p>
        </div>
      </div>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={stages}
          margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
          barCategoryGap="30%"
        >
          {/* No grid lines, no axes borders */}
          <XAxis
            dataKey="stage"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9E9E9E", fontSize: 11, fontFamily: "sans-serif" }}
          />
          <YAxis hide domain={[0, "dataMax + 1"]} />
          <Tooltip
            content={<PipelineTooltip />}
            cursor={{ fill: "rgba(0,0,0,0.025)", radius: 8 }}
          />

          <Bar
            dataKey="value"
            shape={<RoundedBar />}
            maxBarSize={72}
            isAnimationActive
            animationBegin={200}
            animationDuration={900}
            animationEasing="ease-out"
          >
            {stages.map((stage) => (
              <Cell
                key={stage.stage}
                fill={BAR_COLORS[stage.stage] ?? "#D8D3CC"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Stage summary row */}
      <div className="mt-5 pt-5 border-t border-[#F0EDE8] flex items-start">
        {stages.map((stage, i) => (
          <div key={stage.stage} className="flex items-center flex-1">
            <StagePill stage={stage} />
            {i < stages.length - 1 && (
              <span className="text-[#D8D3CC] text-[10px] mb-3.5">›</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
