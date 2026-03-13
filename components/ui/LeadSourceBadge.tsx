"use client";

import {
  Globe,
  UserRound,
  CalendarDays,
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  MessageCircle,
} from "lucide-react";
import { formatLeadSource, type LeadIconType } from "@/lib/utils/lead-source-mapper";

// ── Google "G" icon ────────────────────────────────────────────────────────────
// Lucide doesn't ship Google-branded icons (trademark), so we keep a clean
// custom SVG. This is a simplified but recognisable "G" letterform.

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.35 11.1H12v2.9h5.35C16.79 17.07 14.61 18.5 12 18.5a6.5 6.5 0 1 1 4.12-11.53l2.07-2.07A9.5 9.5 0 1 0 12 21.5c5.25 0 9.5-3.79 9.5-9.5 0-.64-.06-1.27-.15-1.9z" />
    </svg>
  );
}

// ── Icon map ───────────────────────────────────────────────────────────────────

const ICON_MAP: Record<LeadIconType, React.FC<{ className?: string }>> = {
  facebook:  Facebook,
  instagram: Instagram,
  whatsapp:  MessageCircle,
  google:    GoogleIcon,
  youtube:   Youtube,
  linkedin:  Linkedin,
  globe:     Globe,
  user:      UserRound,
  calendar:  CalendarDays,
};

// ── Per-platform accent colours (icon variant) ─────────────────────────────────

const ICON_COLOURS: Record<LeadIconType, string> = {
  facebook:  "text-[#1877F2] bg-[#EEF4FF] border-[#C7DBFF]",
  instagram: "text-[#E1306C] bg-[#FDF0F5] border-[#F9C8D9]",
  whatsapp:  "text-[#25D366] bg-[#EDFAF3] border-[#B3EED1]",
  google:    "text-[#EA4335] bg-[#FEF2F1] border-[#FCCFCB]",
  youtube:   "text-[#FF0000] bg-[#FFF0F0] border-[#FFCACA]",
  linkedin:  "text-[#0A66C2] bg-[#EEF5FF] border-[#BDD5F5]",
  globe:     "text-emerald-600 bg-emerald-50 border-emerald-200",
  user:      "text-violet-600 bg-violet-50 border-violet-200",
  calendar:  "text-amber-600 bg-amber-50 border-amber-200",
};

// ── Component ──────────────────────────────────────────────────────────────────

interface LeadSourceBadgeProps {
  source:       string | null | undefined;
  utmSource:    string | null | undefined;
  utmMedium:    string | null | undefined;
  utmCampaign?: string | null | undefined;
  /**
   * "icon"  — icon-only circle with native tooltip; for compact table columns.
   * "light" — full pill with icon + text; for Lead detail / full views.
   * "dark"  — frosted pill for dark surfaces (Campaign Dossier).
   */
  variant?: "icon" | "light" | "dark";
}

export function LeadSourceBadge({
  source,
  utmSource,
  utmMedium,
  utmCampaign,
  variant = "light",
}: LeadSourceBadgeProps) {
  const info  = formatLeadSource(source, utmSource, utmMedium, utmCampaign);
  const Icon  = ICON_MAP[info.iconType];
  const label = info.platform ? `${info.channel} · ${info.platform}` : info.channel;

  // ── Icon-only variant — table column ──────────────────────────────────────
  if (variant === "icon") {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${ICON_COLOURS[info.iconType]}`}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
    );
  }

  // ── Dark variant — Campaign Dossier ───────────────────────────────────────
  if (variant === "dark") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08]">
        <Icon className="w-3 h-3 text-white/40 shrink-0" />
        <span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">
          <span className="text-white/70">{info.channel}</span>
          {info.platform && (
            <>
              <span className="text-white/25 mx-1">·</span>
              <span className="text-white/40">{info.platform}</span>
            </>
          )}
        </span>
      </span>
    );
  }

  // ── Light variant — Lead detail (default) ─────────────────────────────────
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F4F0] border border-[#E5E4DF]">
      <Icon className="w-3 h-3 text-[#8A8A6E] shrink-0" />
      <span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">
        <span className="text-[#4A4A4A]">{info.channel}</span>
        {info.platform && (
          <>
            <span className="text-[#C8C4BC] mx-1">·</span>
            <span className="text-[#8A8A6E]">{info.platform}</span>
          </>
        )}
      </span>
    </span>
  );
}

// ── Inline text-only variant ───────────────────────────────────────────────────

export function LeadSourceText({
  source,
  utmSource,
  utmMedium,
  utmCampaign,
}: Omit<LeadSourceBadgeProps, "variant">) {
  const info = formatLeadSource(source, utmSource, utmMedium, utmCampaign);
  return (
    <span className="text-xs text-[#6B6B6B]">
      {info.channel}
      {info.platform && (
        <>
          <span className="text-[#C8C4BC] mx-1">·</span>
          <span className="text-[#9E9E9E]">{info.platform}</span>
        </>
      )}
    </span>
  );
}
