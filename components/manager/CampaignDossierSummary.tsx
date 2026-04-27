"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, BadgeDollarSign, Users, Target, Percent } from "lucide-react";
import type { CampaignDossierData } from "@/lib/actions/campaigns";
import {
  getMockAdPerformance,
  getMockBudgetLeadSlices,
} from "@/lib/data/campaigns-mock";

function formatRupee(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function KPICard({
  icon: Icon,
  label,
  value,
  trend,
  trendPercent,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  trend?: "up" | "down";
  trendPercent?: number;
}) {
  const trendGood = (label: string) => {
    if (label === "Spend" || label === "CPA") return trend === "down";
    return trend === "up";
  };
  const trendColor = trendGood(label) ? "text-emerald-500" : "text-rose-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/80 bg-white/50 backdrop-blur-xl p-5 shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold text-[#B5A99A] uppercase tracking-widest mb-1">
            {label}
          </p>
          <p className="text-xl font-semibold text-[#1A1A1A]">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-500" />
        </div>
      </div>
      {trend !== undefined && trendPercent !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendColor}`}>
          {trend === "up" ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span>{Math.abs(trendPercent)}% vs last period</span>
        </div>
      )}
    </motion.div>
  );
}

const CUSTOM_TOOLTIP = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload?: { fullName?: string } }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const fullName = payload[0]?.payload?.fullName;
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white/95 backdrop-blur-md px-4 py-3 shadow-lg">
      <p className="text-xs font-semibold text-[#1A1A1A] mb-1">
        {fullName ?? label}
      </p>
      <p className="text-sm font-medium text-indigo-600">
        {payload[0].value} conversions
      </p>
    </div>
  );
};

const PIE_TOOLTIP = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fill: string } }[];
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white/95 backdrop-blur-md px-4 py-3 shadow-lg">
      <p className="text-xs font-semibold text-[#1A1A1A]">{p.name}</p>
      <p className="text-sm font-medium text-[#4A4A4A]">
        {p.name === "Ad Spend"
          ? formatRupee(p.value)
          : formatRupee(p.value)}
      </p>
    </div>
  );
};

interface CampaignDossierSummaryProps {
  campaignId: string;
  dossier: CampaignDossierData;
}

export function CampaignDossierSummary({
  campaignId,
  dossier,
}: CampaignDossierSummaryProps) {
  const { campaign, pipeline, totalRevenue } = dossier;

  const adData = useMemo(() => {
    const raw = getMockAdPerformance(campaignId);
    return raw
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 6)
      .map((a) => ({
        name: a.ad_name.length > 20 ? a.ad_name.slice(0, 20) + "…" : a.ad_name,
        fullName: a.ad_name,
        conversions: a.conversions,
      }));
  }, [campaignId]);

  const donutData = useMemo(
    () => getMockBudgetLeadSlices(campaign.amount_spent, totalRevenue),
    [campaign.amount_spent, totalRevenue]
  );

  const conversionRate =
    pipeline.length > 0 ? ((dossier.trophyCase.length / pipeline.length) * 100).toFixed(1) : "0";
  const cpa = pipeline.length > 0 ? campaign.amount_spent / pipeline.length : 0;

  return (
    <div className="space-y-10">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          icon={BadgeDollarSign}
          label="Spend"
          value={formatRupee(campaign.amount_spent)}
          trend="down"
          trendPercent={8}
        />
        <KPICard
          icon={Users}
          label="Leads"
          value={pipeline.length.toString()}
          trend="up"
          trendPercent={12}
        />
        <KPICard
          icon={Target}
          label="CPA"
          value={cpa > 0 ? formatRupee(cpa) : "—"}
          trend="down"
          trendPercent={5}
        />
        <KPICard
          icon={Percent}
          label="Conversion Rate"
          value={`${conversionRate}%`}
          trend="up"
          trendPercent={3}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bar Chart — Top Performing Ads */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/80 bg-white/50 backdrop-blur-xl p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]"
        >
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-6">
            Top Performing Ads by Conversion
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={adData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f5f5f4"
                  horizontal={true}
                  vertical={false}
                />
                <XAxis
                  type="number"
                  hide
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#B5A99A", fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6B6B6B", fontSize: 11 }}
                />
                <Tooltip content={<CUSTOM_TOOLTIP />} cursor={{ fill: "#f5f5f4" }} />
                <Bar
                  dataKey="conversions"
                  fill="url(#barGradient)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#818CF8" />
                    <stop offset="100%" stopColor="#C7D2FE" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Donut Chart — Budget vs Lead Volume */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-white/80 bg-white/50 backdrop-blur-xl p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]"
        >
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-6">
            Budget Allocation vs. Lead Volume
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<PIE_TOOLTIP />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs text-[#6B6B6B]">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
