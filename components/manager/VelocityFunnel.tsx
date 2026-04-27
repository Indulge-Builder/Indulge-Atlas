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
import type { FunnelStage } from "@/lib/actions/manager-analytics";

// ── Gradient definitions ──────────────────────────────────────

const GRADIENTS = [
  { id: "fGradLeads",      from: "#2C6FAC", to: "#1A5080" },
  { id: "fGradDiscussion", from: "#6B4FBB", to: "#4A3580" },
  { id: "fGradWon",        from: "#D4AF37", to: "#A88B20" },
] as const;

// ── Custom bar shape with rounded top ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RoundedBar(props: any) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  const r = Math.min(6, width / 2, height);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FunnelTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as FunnelStage;
  return (
    <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-[#9E9E9E] text-[10px] mb-1.5 uppercase tracking-wider">
        {label}
      </p>
      <p
        className="text-white text-2xl font-semibold leading-none"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {d.value.toLocaleString("en-IN")}
      </p>
      <p className="text-[#D4AF37] text-xs mt-1">
        {d.pct}% of pipeline
      </p>
    </div>
  );
}

// ── Number formatter ──────────────────────────────────────────

function fmtNum(v: number): string {
  if (v >= 1_00_000) return `${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

// ── Component ─────────────────────────────────────────────────

interface VelocityFunnelProps {
  data: FunnelStage[];
  totalClicks: number;
}

export function VelocityFunnel({ data, totalClicks }: VelocityFunnelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      className="bg-white border border-[#EAEAEA] rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3
            className="text-[#1A1A1A] font-semibold text-base"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Velocity Funnel
          </h3>
          <p className="text-[#9E9E9E] text-xs mt-0.5">
            Conversion efficiency from ad to close
          </p>
        </div>

        {/* Total clicks callout */}
        <div className="text-right">
          <p
            className="text-[#1A1A1A] text-xl font-semibold leading-none"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {fmtNum(totalClicks)}
          </p>
          <p className="text-[#9E9E9E] text-[10px] mt-0.5">total ad clicks</p>
        </div>
      </div>

      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 12, right: 4, left: 4, bottom: 0 }}
          barCategoryGap="28%"
        >
          <defs>
            {GRADIENTS.map((g) => (
              <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={g.from} stopOpacity={0.95} />
                <stop offset="100%" stopColor={g.to}   stopOpacity={0.70} />
              </linearGradient>
            ))}
          </defs>

          <XAxis
            dataKey="stage"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#9E9E9E", fontSize: 11 }}
          />
          <YAxis hide domain={[0, 105]} />
          <Tooltip
            content={<FunnelTooltip />}
            cursor={{ fill: "rgba(0,0,0,0.025)", radius: 8 }}
          />

          <Bar dataKey="pct" shape={<RoundedBar />} maxBarSize={80}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={`url(#${GRADIENTS[i]?.id ?? GRADIENTS[0].id})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Stage summary row */}
      <div className="mt-4 pt-4 border-t border-[#F0EDE8] flex items-start gap-2">
        {data.map((stage, i) => (
          <div key={stage.stage} className="flex items-center gap-2 flex-1">
            <div className="flex-1 text-center">
              <p
                className="text-[#1A1A1A] text-sm font-semibold leading-none"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {stage.value.toLocaleString("en-IN")}
              </p>
              <p className="text-[#9E9E9E] text-[10px] mt-0.5">{stage.stage}</p>
            </div>
            {i < data.length - 1 && (
              <span className="text-[#D0CFC4] text-xs mb-2">→</span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
