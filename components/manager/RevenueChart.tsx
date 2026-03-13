"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { motion } from "framer-motion";

interface MonthlyPoint {
  month: string;
  revenue: number;
  spend: number;
}

interface RevenueChartProps {
  data: MonthlyPoint[];
}

function formatCurrency(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-[#9E9E9E] text-xs mb-2 tracking-wide">{label}</p>
      {payload.map(
        (entry: { name: string; value: number; color: string }, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-[#9E9E9E] text-xs capitalize">
              {entry.name}:
            </span>
            <span className="text-white text-xs font-semibold">
              {formatCurrency(entry.value)}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      className="bg-white border border-[#EAEAEA] rounded-2xl p-6"
    >
      <div className="mb-6">
        <h3
          className="text-[#1A1A1A] font-semibold text-lg"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Spend vs. Revenue
        </h3>
        <p className="text-[#9E9E9E] text-sm mt-0.5">Last 6 months</p>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#F0F0EC"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "#9E9E9E", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: "#9E9E9E", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#9E9E9E", paddingTop: 16 }}
            iconType="circle"
            iconSize={8}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#D4AF37"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#D4AF37", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#D4AF37" }}
          />
          <Line
            type="monotone"
            dataKey="spend"
            name="Ad Spend"
            stroke="#C0C0B0"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: "#C0C0B0", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#C0C0B0" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
