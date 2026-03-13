"use client";

import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { CampaignDraft, AdPlatform, DraftStatus } from "@/lib/types/database";

// ── Config maps ───────────────────────────────────────────────

const PLATFORM_CONFIG: Record<AdPlatform, { label: string; dot: string }> = {
  meta:     { label: "Meta Ads",  dot: "#1877F2" },
  google:   { label: "Google",    dot: "#EA4335" },
  website:  { label: "Website",   dot: "#4A7C59" },
  events:   { label: "Events",    dot: "#D4AF37" },
  referral: { label: "Referral",  dot: "#8B5CF6" },
};

// On dark cards the badge backgrounds use low-opacity fills so they
// read clearly against the deep charcoal without looking garish.
const STATUS_CONFIG: Record<DraftStatus, { label: string; dot: string; ring: string }> = {
  draft:    { label: "Draft",    dot: "#9E9E9E", ring: "bg-white/[0.06] text-white/35"  },
  approved: { label: "Approved", dot: "#4A7C59", ring: "bg-[#4A7C59]/20 text-[#4A7C59]/90" },
  deployed: { label: "Deployed", dot: "#D4AF37", ring: "bg-[#D4AF37]/15 text-[#D4AF37]"    },
};

// ── Formatters ────────────────────────────────────────────────

function fmtInr(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)} Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)} L`;
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)} K`;
  return `₹${Math.round(v)}`;
}

// ── Individual draft card ─────────────────────────────────────

function DraftCard({ draft, index }: { draft: CampaignDraft; index: number }) {
  const platform = PLATFORM_CONFIG[draft.platform] ?? PLATFORM_CONFIG.meta;
  const status   = STATUS_CONFIG[draft.status]   ?? STATUS_CONFIG.draft;

  const createdDate = (() => {
    try {
      return format(parseISO(draft.created_at), "d MMM");
    } catch {
      return "—";
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex-shrink-0 w-52 rounded-xl p-4 cursor-default",
        "bg-[#0F0E0C] border border-white/[0.07]",
        "shadow-[0_2px_12px_rgba(0,0,0,0.45),0_1px_3px_rgba(0,0,0,0.35)]",
        "hover:border-white/[0.12] hover:shadow-[0_6px_24px_rgba(0,0,0,0.65)]",
        "transition-all duration-200 select-none"
      )}
    >
      {/* Platform + status row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: platform.dot }}
          />
          <span className="text-[10px] text-white/35 font-medium">{platform.label}</span>
        </div>
        <span
          className={cn(
            "text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full",
            status.ring
          )}
        >
          {status.label}
        </span>
      </div>

      {/* Campaign name */}
      <p
        className="text-white/85 text-[13px] font-semibold leading-snug line-clamp-2 mb-3"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {draft.campaign_name}
      </p>

      {/* Objective */}
      {draft.objective && (
        <p className="text-[10px] text-white/30 mb-3 truncate italic">{draft.objective}</p>
      )}

      {/* Financials */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/25 uppercase tracking-[0.14em]">Budget</span>
          <span className="text-[11px] text-white/70 font-semibold">
            {fmtInr(draft.total_budget)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/25 uppercase tracking-[0.14em]">Projected</span>
          <span className="text-[11px] text-[#D4AF37] font-semibold">
            {fmtInr(draft.projected_revenue)}
          </span>
        </div>
      </div>

      {/* Date */}
      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/20">{createdDate}</p>
      </div>
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────

function EmptyBoard() {
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "w-48 h-28 flex-shrink-0 rounded-xl flex items-center justify-center",
          "border border-dashed border-white/[0.08] bg-white/[0.02]"
        )}
      >
        <p className="text-[11px] text-white/20 italic">No drafts yet</p>
      </div>
      <p className="text-[12px] text-white/20 italic max-w-[200px] leading-relaxed">
        Save a campaign from the studio above to see it here.
      </p>
    </div>
  );
}

// ── Draft Board ───────────────────────────────────────────────

interface DraftBoardProps {
  drafts: CampaignDraft[];
}

export function DraftBoard({ drafts }: DraftBoardProps) {
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <h3
          className="text-white/60 text-[11px] font-semibold uppercase tracking-[0.22em]"
        >
          Draft Board
        </h3>
        {drafts.length > 0 && (
          <span
            className="text-[10px] text-white/30 font-medium bg-white/[0.06] px-2 py-0.5 rounded-full"
          >
            {drafts.length} campaign{drafts.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Horizontal scroll container */}
      <div
        className={cn(
          "flex gap-3 overflow-x-auto pb-3",
          "scrollbar-none [&::-webkit-scrollbar]:hidden"
        )}
      >
        {drafts.length === 0 ? (
          <EmptyBoard />
        ) : (
          drafts.map((draft, i) => (
            <DraftCard key={draft.id} draft={draft} index={i} />
          ))
        )}
      </div>
    </div>
  );
}
