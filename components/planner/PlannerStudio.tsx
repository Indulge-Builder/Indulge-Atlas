"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { saveCampaignDraft } from "@/lib/actions/planner";
import type { CampaignDraft, AdPlatform } from "@/lib/types/database";
import type { Projections } from "./OraclePane";

const OraclePaneLazy = dynamic(
  () => import("./OraclePane").then((m) => m.OraclePane),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-[#EAEAE5] bg-[#F9F9F6] p-6 space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-md bg-stone-100/90" />
        <div className="h-32 animate-pulse rounded-xl bg-stone-100/70" />
        <div className="h-8 animate-pulse rounded-lg bg-stone-100/60" />
      </div>
    ),
  },
);

const DraftBoardLazy = dynamic(
  () => import("./DraftBoard").then((m) => m.DraftBoard),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-[#0D0C0A]/40 p-6">
        <div className="h-4 w-32 animate-pulse rounded-md bg-stone-600/40" />
        <div className="h-24 animate-pulse rounded-lg bg-stone-700/30" />
        <div className="h-24 animate-pulse rounded-lg bg-stone-700/20" />
      </div>
    ),
  },
);

// ── Validation schema ─────────────────────────────────────────

const plannerSchema = z.object({
  campaignName: z.string().min(1, "Campaign name is required"),
  platform: z.enum([
    "meta",
    "google",
    "website",
    "events",
    "referral",
  ] as const),
  objective: z.string().optional(),
  totalBudget: z
    .number()
    .min(1_000, "Minimum budget is ₹1,000"),
  targetCpa: z
    .number()
    .min(100, "Minimum CPA is ₹100"),
  winRate: z
    .number()
    .min(0.1, "Must be at least 0.1 %")
    .max(100, "Cannot exceed 100 %"),
});

type PlannerFormValues = z.infer<typeof plannerSchema>;

// ── Platform options ──────────────────────────────────────────

const PLATFORMS: { value: AdPlatform; label: string; dot: string }[] = [
  { value: "meta",     label: "Meta Ads",  dot: "#1877F2" },
  { value: "google",   label: "Google",    dot: "#EA4335" },
  { value: "website",  label: "Website",   dot: "#4A7C59" },
  { value: "events",   label: "Events",    dot: "#D4AF37" },
  { value: "referral", label: "Referral",  dot: "#8B5CF6" },
];

const OBJECTIVES = [
  "Lead Generation",
  "Brand Awareness",
  "Retargeting",
  "Conversion",
  "App Installs",
];

// ── Projection engine ─────────────────────────────────────────

function calcProjections(
  budget: number,
  cpa: number,
  winRate: number,
  avgDeal: number
) {
  if (budget <= 0 || cpa <= 0) {
    return { leads: null, wins: null, revenue: null, roas: null };
  }
  const leads   = budget / cpa;
  const wins    = leads * (winRate / 100);
  const revenue = wins * avgDeal;
  const roas    = revenue / budget;
  return { leads, wins, revenue, roas };
}

// ── Shared input styles ───────────────────────────────────────

const fieldCx = cn(
  "w-full h-11 rounded-xl text-[13px] text-[#1A1A1A] bg-white",
  "border border-[#E0DDD8] outline-none transition-all duration-200",
  "placeholder:text-[#C8C5BF]",
  "focus:border-[#7A6652] focus:ring-2 focus:ring-[#7A6652]/15",
  "px-4"
);

const labelCx =
  "block text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.2em] mb-2";

const errorCx = "text-[10px] text-[#C0392B] mt-1.5";

// ── Section divider ───────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="h-px flex-1 bg-[#EAEAE5]" />
      <p className="text-[9px] font-semibold text-[#B0ADA8] uppercase tracking-[0.2em] flex-shrink-0">
        {children}
      </p>
      <div className="h-px flex-1 bg-[#EAEAE5]" />
    </div>
  );
}

// ── CPA range constants ───────────────────────────────────────

const CPA_MIN = 1_000;
const CPA_MAX = 1_00_000;

// ── Main component ────────────────────────────────────────────

interface PlannerStudioProps {
  initialDrafts: CampaignDraft[];
  avgDealValue:  number;
  defaultWinRate: number;
}

export function PlannerStudio({
  initialDrafts,
  avgDealValue,
  defaultWinRate,
}: PlannerStudioProps) {
  const [drafts, setDrafts] = useState<CampaignDraft[]>(initialDrafts);
  const [saving, setSaving] = useState(false);

  // ── Form ────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<PlannerFormValues>({
    resolver: zodResolver(plannerSchema),
    defaultValues: {
      campaignName: "",
      platform:     "meta",
      objective:    "",
      totalBudget:  2_00_000,
      targetCpa:    15_000,
      winRate:      defaultWinRate,
    },
  });

  const { totalBudget, targetCpa, winRate } = watch();

  // ── Live projections ────────────────────────────────────────

  const projections = useMemo(() => {
    const b = isFinite(Number(totalBudget)) ? Number(totalBudget) : 0;
    const c = isFinite(Number(targetCpa))   ? Number(targetCpa)   : 0;
    const w = isFinite(Number(winRate))     ? Number(winRate)     : 0;
    return calcProjections(b, c, w, avgDealValue);
  }, [totalBudget, targetCpa, winRate, avgDealValue]);

  // ── Slider track fill ────────────────────────────────────────
  const cpaPct = Math.max(
    0,
    Math.min(100, ((Number(targetCpa) - CPA_MIN) / (CPA_MAX - CPA_MIN)) * 100)
  );

  const sliderTrackStyle: React.CSSProperties = {
    background: `linear-gradient(to right, #D4AF37 ${cpaPct}%, rgba(26,26,26,0.12) ${cpaPct}%)`,
  };

  // ── Save handler ────────────────────────────────────────────

  async function onSubmit(values: PlannerFormValues) {
    setSaving(true);
    try {
      const result = await saveCampaignDraft({
        campaign_name:     values.campaignName,
        platform:          values.platform,
        objective:         values.objective || null,
        total_budget:      values.totalBudget,
        target_cpa:        values.targetCpa,
        projected_revenue: projections.revenue ?? 0,
      });
      if (result.success && result.draft) {
        setDrafts((prev) => [result.draft!, ...prev]);
        toast.success("Draft saved to board.");
      } else {
        toast.error(result.error ?? "Failed to save draft.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Split pane ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ── Left: Strategy Input ─────────────────────────── */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className={cn(
            "lg:col-span-3 rounded-2xl overflow-hidden",
            "bg-[#F9F9F6]",
            "shadow-[0_4px_20px_rgba(0,0,0,0.09),0_1px_4px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]"
          )}
        >
          {/* Card header */}
          <div className="px-8 pt-7 pb-6 border-b border-[#EAEAE5]">
            <p
              className="text-[#1A1A1A] text-[17px] font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Strategy Input
            </p>
            <p className="text-[11px] text-[#9E9E9E] mt-1 leading-relaxed">
              Define your campaign parameters. The Oracle updates in real time.
            </p>
          </div>

          {/* Form body */}
          <div className="px-8 py-7 space-y-7">

            {/* Campaign identity */}
            <div>
              <SectionLabel>Campaign Identity</SectionLabel>
              <div className="space-y-4">

                {/* Campaign name */}
                <div>
                  <label className={labelCx}>Campaign Name</label>
                  <input
                    {...register("campaignName")}
                    placeholder="e.g. Indulge Luxury Spring Push"
                    className={fieldCx}
                  />
                  {errors.campaignName && (
                    <p className={errorCx}>{errors.campaignName.message}</p>
                  )}
                </div>

                {/* Platform + Objective */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCx}>Platform</label>
                    <Controller
                      name="platform"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-11 rounded-xl border-[#E0DDD8] bg-white text-[13px] text-[#1A1A1A]",
                              "focus:border-[#7A6652] focus:ring-2 focus:ring-[#7A6652]/15",
                              "data-[state=open]:border-[#7A6652]"
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-[#E0DDD8] bg-[#F9F9F6] shadow-xl">
                            {PLATFORMS.map((p) => (
                              <SelectItem
                                key={p.value}
                                value={p.value}
                                className="text-[13px] cursor-pointer focus:bg-[#EAEAE5] rounded-lg"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: p.dot }}
                                  />
                                  {p.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div>
                    <label className={labelCx}>Objective</label>
                    <Controller
                      name="objective"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-11 rounded-xl border-[#E0DDD8] bg-white text-[13px] text-[#1A1A1A]",
                              "focus:border-[#7A6652] focus:ring-2 focus:ring-[#7A6652]/15",
                              "data-[state=open]:border-[#7A6652]"
                            )}
                          >
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-[#E0DDD8] bg-[#F9F9F6] shadow-xl">
                            {OBJECTIVES.map((obj) => (
                              <SelectItem
                                key={obj}
                                value={obj}
                                className="text-[13px] cursor-pointer focus:bg-[#EAEAE5] rounded-lg"
                              >
                                {obj}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Budget & targeting */}
            <div>
              <SectionLabel>Budget &amp; Targeting</SectionLabel>
              <div className="space-y-6">

                {/* Total budget */}
                <div>
                  <label className={labelCx}>Total Budget</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9E9E9E] text-[13px] pointer-events-none select-none">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="1000"
                      min={1000}
                      {...register("totalBudget", { valueAsNumber: true })}
                      placeholder="200000"
                      className={cn(fieldCx, "pl-8")}
                    />
                  </div>
                  {errors.totalBudget && (
                    <p className={errorCx}>{errors.totalBudget.message}</p>
                  )}
                </div>

                {/* Target CPA slider */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className={cn(labelCx, "mb-0")}>Target CPA</label>
                    <span
                      className="text-[13px] font-semibold text-[#1A1A1A]"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      ₹{Number(targetCpa).toLocaleString("en-IN")}
                      <span className="text-[10px] font-normal text-[#9E9E9E] ml-1">
                        / lead
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={CPA_MIN}
                    max={CPA_MAX}
                    step={500}
                    {...register("targetCpa", { valueAsNumber: true })}
                    className="luxury-slider"
                    style={sliderTrackStyle}
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[9px] text-[#C0BDB5]">₹1 K</span>
                    <span className="text-[9px] text-[#C0BDB5]">₹1 L</span>
                  </div>
                  {errors.targetCpa && (
                    <p className={errorCx}>{errors.targetCpa.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Assumptions */}
            <div>
              <SectionLabel>Assumptions</SectionLabel>
              <div>
                <div className="flex items-end justify-between mb-2">
                  <label className={cn(labelCx, "mb-0")}>
                    Win Rate Override
                  </label>
                  <p className="text-[10px] text-[#C0BDB5] italic">
                    Team historical avg: {defaultWinRate.toFixed(1)} %
                  </p>
                </div>
                <div className="relative w-40">
                  <input
                    type="number"
                    step="0.1"
                    min={0.1}
                    max={100}
                    {...register("winRate", { valueAsNumber: true })}
                    placeholder={String(defaultWinRate)}
                    className={cn(fieldCx, "pr-8")}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9E9E9E] text-[13px] pointer-events-none select-none">
                    %
                  </span>
                </div>
                {errors.winRate && (
                  <p className={errorCx}>{errors.winRate.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Card footer — Save Draft */}
          <div className="px-8 pb-7">
            <motion.button
              type="submit"
              disabled={saving}
              whileHover={{ scale: saving ? 1 : 1.01 }}
              whileTap={{ scale: saving ? 1 : 0.98 }}
              className={cn(
                "w-full h-11 rounded-xl text-[13px] font-semibold",
                "border border-[#1A1A1A] text-[#1A1A1A]",
                "bg-transparent hover:bg-[#1A1A1A] hover:text-white",
                "transition-colors duration-200",
                "flex items-center justify-center gap-2",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Draft"
              )}
            </motion.button>
          </div>
        </form>

        {/* ── Right: Oracle ─────────────────────────────────── */}
        <div className="lg:col-span-2 lg:sticky lg:top-24">
          <OraclePaneLazy
            projections={projections as Projections}
            avgDealValue={avgDealValue}
            winRate={isFinite(Number(winRate)) ? Number(winRate) : defaultWinRate}
          />
        </div>
      </div>

      {/* ── Draft Board ──────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-2xl p-7",
          "bg-[#0D0C0A]/60 border border-white/[0.06]",
          "backdrop-blur-sm"
        )}
      >
        <DraftBoardLazy drafts={drafts} />
      </div>
    </div>
  );
}
