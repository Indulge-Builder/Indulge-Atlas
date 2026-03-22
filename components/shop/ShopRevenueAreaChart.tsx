"use client";

import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatInr(value: number) {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(0)}k`;
  return `₹${Math.round(value)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-stone-900">
        {formatInr(v)}
      </p>
    </div>
  );
}

export default function ShopRevenueAreaChart({
  data,
}: {
  data: Array<{ date: string; revenue: number }>;
}) {
  const chartData = data.map((d) => ({
    ...d,
    dayLabel: format(new Date(`${d.date}T12:00:00`), "d MMM"),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="shopRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E4DF" vertical={false} />
        <XAxis
          dataKey="dayLabel"
          tick={{ fill: "#78716c", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => formatInr(v)}
          tick={{ fill: "#78716c", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#C9A530"
          strokeWidth={2}
          fill="url(#shopRevenueFill)"
          dot={false}
          activeDot={{ r: 4, fill: "#D4AF37", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
