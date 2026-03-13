"use client";

import { useEffect, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Projection types ──────────────────────────────────────────

export interface Projections {
  leads: number | null;
  wins: number | null;
  revenue: number | null;
  roas: number | null;
}

interface OraclePaneProps {
  projections: Projections;
  avgDealValue: number;
  winRate: number;
}

// ── Number formatters ─────────────────────────────────────────

function fmtLeads(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

function fmtInr(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)} K`;
  return `₹${Math.round(v)}`;
}

function fmtRoas(v: number): string {
  return `${Math.max(0, v).toFixed(1)}×`;
}

// ── ROAS colour ───────────────────────────────────────────────

function roasColorClass(roas: number | null): string {
  if (roas === null || !isFinite(roas) || roas <= 0) return "text-white/25";
  if (roas < 2.0) return "text-[#C5670A]";  // terracotta warning
  if (roas >= 5.0) return "text-[#D4AF37]"; // signature gold
  return "text-white/90";
}

// ── Animated number sub-component ────────────────────────────
// Uses Framer Motion spring physics so numbers tick smoothly
// as the user adjusts sliders and inputs.

interface AnimatedValueProps {
  target: number | null;
  format: (v: number) => string;
  className?: string;
}

function AnimatedValue({ target, format, className }: AnimatedValueProps) {
  const motionVal  = useMotionValue(0);
  const springVal  = useSpring(motionVal, { stiffness: 55, damping: 28 });
  const [display, setDisplay] = useState("—");

  // Drive the spring toward the new target
  useEffect(() => {
    if (target === null || !isFinite(target) || target < 0) {
      motionVal.set(0);
      setDisplay("—");
    } else {
      motionVal.set(target);
    }
  }, [target, motionVal]);

  // Subscribe to spring output and update display text
  useEffect(() => {
    const unsub = springVal.onChange((v) => {
      if (target !== null && isFinite(target) && target >= 0) {
        setDisplay(format(Math.max(0, v)));
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [springVal]);

  return <span className={className}>{display}</span>;
}

// ── Oracle metric row ─────────────────────────────────────────

interface MetricRowProps {
  label: string;
  target: number | null;
  format: (v: number) => string;
  valueClass?: string;
  sublabel?: string;
}

function MetricRow({ label, target, format, valueClass, sublabel }: MetricRowProps) {
  return (
    <div className="py-5 first:pt-2">
      <p className="text-[9.5px] font-semibold text-white/35 uppercase tracking-[0.22em] mb-2">
        {label}
      </p>
      <AnimatedValue
        target={target}
        format={format}
        className={cn(
          "block font-semibold leading-none tracking-tight",
          "text-[2.6rem]",
          valueClass ?? "text-white/90",
          "transition-colors duration-700"
        )}
      />
      {sublabel && (
        <p className="text-[10px] text-white/25 mt-1.5 leading-relaxed">{sublabel}</p>
      )}
    </div>
  );
}

// ── Main Oracle Pane ──────────────────────────────────────────

export function OraclePane({ projections, avgDealValue, winRate }: OraclePaneProps) {
  const { leads, wins, revenue, roas } = projections;

  const dividerCx = "h-px bg-white/[0.04]";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        // Deepened to near-black — "the void" that the left paper writes into
        "bg-[#080706] border border-white/[0.05]",
        // Heavy outer shadow removed; only ambient depth remains
        "shadow-[0_8px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.03)]"
      )}
    >
      {/* Ambient gold glow – top right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 w-64 h-64
                   rounded-full bg-[#D4AF37]/[0.07] blur-3xl"
      />
      {/* Ambient depth — bottom left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-20 w-56 h-56
                   rounded-full bg-[#D4AF37]/[0.02] blur-3xl"
      />

      {/* Header */}
      <div className="relative px-7 pt-7 pb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
          <p
            className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.24em]"
          >
            The Oracle
          </p>
        </div>
        <p className="text-white/25 text-[11px] leading-relaxed mt-1">
          Live projections · updates as you type
        </p>
      </div>

      <div className={cn(dividerCx, "mx-7")} />

      {/* Metrics */}
      <div className="relative px-7" style={{ fontFamily: "var(--font-serif)" }}>
        <MetricRow
          label="Projected Leads"
          target={leads}
          format={fmtLeads}
        />

        <div className={dividerCx} />

        <MetricRow
          label="Projected Wins"
          target={wins}
          format={fmtLeads}
          sublabel={
            winRate > 0 ? `At ${winRate.toFixed(1)} % win rate` : undefined
          }
        />

        <div className={dividerCx} />

        <MetricRow
          label="Projected Revenue"
          target={revenue}
          format={fmtInr}
          sublabel={`Avg deal ${fmtInr(avgDealValue)}`}
        />

        <div className={dividerCx} />

        <MetricRow
          label="Expected ROAS"
          target={roas}
          format={fmtRoas}
          valueClass={roasColorClass(roas)}
          sublabel={
            roas !== null && isFinite(roas) && roas > 0
              ? roas < 2.0
                ? "Below target — revisit budget or CPA"
                : roas >= 5.0
                ? "Exceptional return on spend"
                : "On target · solid pipeline"
              : undefined
          }
        />
      </div>

      {/* Footer note */}
      <div className={cn(dividerCx, "mx-7")} />
      <div className="px-7 py-5">
        <p className="text-[10px] text-white/20 leading-relaxed">
          Forecast is indicative only. Based on team win rate&nbsp;
          ({winRate > 0 ? `${winRate.toFixed(1)} %` : "—"}) and&nbsp;
          avg deal value ({fmtInr(avgDealValue)}).
        </p>
      </div>
    </div>
  );
}
