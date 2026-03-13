"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { cn } from "@/lib/utils";

interface AnimatedMetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  icon: React.ReactNode;
  trend?: string;
  trendPositive?: boolean;
  delay?: number;
  highlight?: boolean;
}

function useCountUp(target: number, duration = 1800, decimals = 0) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setDisplay(0);
      return;
    }
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(parseFloat((eased * target).toFixed(decimals)));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      startRef.current = null;
    };
  }, [target, duration, decimals]);

  return display;
}

export function AnimatedMetricCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  icon,
  trend,
  trendPositive,
  delay = 0,
  highlight = false,
}: AnimatedMetricCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const displayValue = useCountUp(
    inView ? value : 0,
    prefersReducedMotion ? 0 : 1200,
    decimals
  );

  const formatted =
    decimals > 0
      ? displayValue.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(displayValue).toLocaleString("en-US");

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: luxuryEasing }}
      className={cn(
        "relative rounded-2xl p-6 overflow-hidden",
        highlight
          ? "bg-[#D4AF37]/10 border border-[#D4AF37]/25"
          : "bg-white border border-[#EAEAEA]"
      )}
    >
      {/* Subtle background glow for highlight card */}
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-transparent to-transparent pointer-events-none" />
      )}

      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            highlight
              ? "bg-[#D4AF37]/20 border border-[#D4AF37]/30"
              : "bg-[#F4F4F0] border border-[#E8E8E0]"
          )}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium px-2.5 py-1 rounded-full",
              trendPositive
                ? "bg-[#EBF4EF] text-[#4A7C59]"
                : "bg-[#FAEAE8] text-[#C0392B]"
            )}
          >
            {trend}
          </span>
        )}
      </div>

      <div>
        <p
          className={cn(
            "font-playfair text-3xl font-semibold tracking-tight",
            highlight ? "text-[#D4AF37]" : "text-[#1A1A1A]"
          )}
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {prefix}
          {formatted}
          {suffix}
        </p>
        <p className="mt-1.5 text-sm text-[#9E9E9E] font-medium">{label}</p>
      </div>
    </motion.div>
  );
}
