"use client";

import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, Info } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { BriefingAlert } from "@/lib/actions/briefing";

// ── Alert type config ─────────────────────────────────────────

const ALERT_CONFIG = {
  win: {
    border:     "#4A7C59",
    iconBg:     "bg-[#EBF4EF]",
    iconColor:  "text-[#4A7C59]",
    Icon:       TrendingUp,
    cardBg:     "bg-[#F9F9F6]",
  },
  warning: {
    border:     "#C5670A",
    iconBg:     "bg-[#FEF3D0]",
    iconColor:  "text-[#C5670A]",
    Icon:       AlertTriangle,
    cardBg:     "bg-[#FEFAF5]",
  },
  neutral: {
    border:     "#9E9E9E",
    iconBg:     "bg-[#F4F4F4]",
    iconColor:  "text-[#7A7A7A]",
    Icon:       Info,
    cardBg:     "bg-[#F9F9F6]",
  },
};

// ── Timestamp formatter ───────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    const d = parseISO(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "Just now";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Individual alert card ─────────────────────────────────────

function AlertCard({
  alert,
  index,
}: {
  alert: BriefingAlert;
  index: number;
}) {
  const cfg = ALERT_CONFIG[alert.type];
  const { Icon } = cfg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        ease:     [0.16, 1, 0.3, 1],
        delay:    0.15 + index * 0.08,
      }}
      className={cn(
        "relative rounded-xl overflow-hidden",
        cfg.cardBg,
        "shadow-[0_2px_10px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
      )}
    >
      {/* Colored left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: cfg.border }}
      />

      <div className="pl-5 pr-4 py-4 flex items-start gap-3.5">
        {/* Icon */}
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5",
            cfg.iconBg
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", cfg.iconColor)} strokeWidth={2} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[#1A1A1A] text-[12.5px] font-semibold leading-snug">
              {alert.headline}
            </p>
            <p className="text-[10px] text-[#B0ADA8] whitespace-nowrap flex-shrink-0 mt-0.5">
              {fmtTime(alert.timestamp)}
            </p>
          </div>
          <p className="text-[11.5px] text-[#7A7A7A] mt-1 leading-relaxed">
            {alert.detail}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── All-clear state ───────────────────────────────────────────
// Sits inside the light #F9F9F6 card — uses charcoal/olive tones.

function AllClear() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="w-10 h-10 rounded-full bg-[#4A7C59]/15 flex items-center
                      justify-center mb-4">
        <TrendingUp className="w-4 h-4 text-[#4A7C59]" strokeWidth={2} />
      </div>
      <p
        className="text-[#4A7C59] text-[14px] font-medium"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        All clear
      </p>
      <p className="text-[#9E9E9E] text-[11px] mt-1.5 leading-relaxed max-w-[180px]">
        No items require your attention right now.
      </p>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────

interface AttentionDeckProps {
  alerts: BriefingAlert[];
}

export function AttentionDeck({ alerts }: AttentionDeckProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className={cn(
        "rounded-2xl p-6 overflow-hidden",
        "bg-[#F9F9F6]",
        "border border-[#EAEAE5]",
        "shadow-[0_6px_24px_rgba(0,0,0,0.16),0_1px_4px_rgba(0,0,0,0.10)]"
      )}
    >
      {/* Section header — light-mode text on #F9F9F6 */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.24em]">
          Requires Attention
        </p>
        {alerts.length > 0 && (
          <span
            className="text-[9px] font-semibold bg-[#EAEAE5] text-[#9E9E9E]
                       px-2 py-0.5 rounded-full"
          >
            {alerts.length}
          </span>
        )}
      </div>

      {/* Cards */}
      {alerts.length === 0 ? (
        <AllClear />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <AlertCard key={alert.id} alert={alert} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
