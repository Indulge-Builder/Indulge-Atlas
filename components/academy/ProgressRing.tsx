/**
 * ProgressRing — minimal circular progress indicator.
 *
 * Server-safe. Pure SVG, no library. Colours come from tokens only, so this can
 * sit on the dark canvas or a white panel without knowing which.
 */

import type { JSX } from "react";
import { cn } from "@/lib/utils";

export function ProgressRing({
  percent,
  size = 40,
  strokeWidth = 3,
  showLabel = true,
  className,
  tone = "accent",
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
  tone?: "accent" | "gold";
}): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // A full ring at 100% and an empty one at 0% — offset walks between them.
  const offset = circumference - (clamped / 100) * circumference;
  const centre = size / 2;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-chat-divider"
        />
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-500 ease-out",
            tone === "gold" ? "stroke-brand-gold" : "stroke-chat-accent-dark",
          )}
        />
      </svg>
      {showLabel ? (
        <span
          className="absolute font-medium tabular-nums text-chat-ink"
          style={{ fontSize: Math.max(9, size * 0.26) }}
        >
          {clamped}
        </span>
      ) : null}
    </div>
  );
}

/** Slim linear bar — used for group and day progress inside the panel. */
export function ProgressBar({
  percent,
  className,
  tone = "accent",
}: {
  percent: number;
  className?: string;
  tone?: "accent" | "gold";
}): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-chat-divider", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "gold" ? "bg-brand-gold" : "bg-chat-accent-dark",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
