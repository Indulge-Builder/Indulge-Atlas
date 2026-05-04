"use client";

import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export type ClientSummaryPhase = "idle" | "loading" | "content" | "empty";

export interface ClientSummaryCardProps {
  clientFirstName: string;
  summary: string;
  phase: ClientSummaryPhase;
  onGenerateSummary: () => void;
}

const GOLD_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)' opacity='0.11'/%3E%3C/svg%3E\")";

export function ClientSummaryCard({
  clientFirstName,
  summary,
  phase,
  onGenerateSummary,
}: ClientSummaryCardProps) {
  const displayName = clientFirstName.trim() || "this member";
  const loading = phase === "loading";

  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "stone", elevation: "sm" }),
        "relative flex h-full min-h-[140px] shrink-0 flex-col overflow-hidden rounded-2xl px-4 py-3",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-repeat opacity-[0.08]"
        style={{ backgroundImage: GOLD_GRAIN }}
        aria-hidden
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#D4AF37]/45 bg-white/90 font-[family-name:var(--font-playfair)] text-xs font-semibold text-[#9A7B2E] shadow-sm"
              aria-hidden
            >
              E
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-stone-400">
              Elia&apos;s Read
            </span>
          </div>
          {phase === "content" ? (
            <span className="text-xs text-stone-500">Generated just now</span>
          ) : loading ? (
            <span className="text-xs text-stone-500">Generating…</span>
          ) : phase === "idle" ? (
            <span className="text-xs text-stone-500">On demand</span>
          ) : (
            <span className="text-xs text-stone-500" />
          )}
        </div>

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex flex-col gap-2 pt-1">
              <div className="h-3 w-[92%] rounded bg-[#D4AF37]/15 animate-pulse" />
              <div className="h-3 w-[88%] rounded bg-[#D4AF37]/15 animate-pulse" />
              <div className="h-3 w-[70%] rounded bg-[#D4AF37]/15 animate-pulse" />
            </div>
          ) : phase === "idle" ? (
            <div className="flex flex-col items-start gap-3 pt-1">
              <p className="text-sm leading-relaxed text-stone-600">
                Generate a short AI read of {displayName}&apos;s profile and
                support context. Uses Elia (tokens apply).
              </p>
              <IndulgeButton
                type="button"
                variant="gold"
                size="sm"
                leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}
                onClick={onGenerateSummary}
              >
                Generate summary
              </IndulgeButton>
            </div>
          ) : phase === "empty" ? (
            <p className="font-[family-name:var(--font-playfair)] text-base italic leading-relaxed text-stone-400">
              Elia is still learning about {displayName}. Add profile data to
              generate insights.
            </p>
          ) : (
            <p className="font-[family-name:var(--font-playfair)] text-base italic leading-relaxed text-stone-800">
              {summary.trim()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
