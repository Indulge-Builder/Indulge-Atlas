"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CompletionRingProps {
  percentage: number;
  size: number;
  /** Optional tiny label inside the ring (mini selector). Prefer `center` for large rings. */
  label?: string;
  /** Center overlay — e.g. Playfair percentage + caption. */
  center?: ReactNode;
  animate?: boolean;
  className?: string;
  strokeWidth?: number;
}

/**
 * SVG stroke-dasharray progress ring. Brand gold arc on neutral track.
 */
export function CompletionRing({
  percentage,
  size,
  label,
  center,
  animate = false,
  className,
  strokeWidth: sw = 3,
}: CompletionRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;

  const [offset, setOffset] = useState(animate ? c : c - filled);

  useEffect(() => {
    if (!animate) {
      setOffset(c - filled);
      return;
    }
    const t = requestAnimationFrame(() => setOffset(c - filled));
    return () => cancelAnimationFrame(t);
  }, [animate, c, filled]);

  return (
    <div
      className={cn("relative inline-flex flex-col items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E5E4DF"
          strokeWidth={sw}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: animate ? "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          }}
        />
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {center}
        </div>
      )}
      {!center && label && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-[#6B6B6B] text-center px-1 leading-tight pointer-events-none">
          {label}
        </span>
      )}
    </div>
  );
}
