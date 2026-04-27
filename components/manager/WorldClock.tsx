"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── City definitions ──────────────────────────────────────────

const ZONES = [
  { city: "London",   code: "LON",  tz: "Europe/London"    },
  { city: "Dubai",    code: "DXB",  tz: "Asia/Dubai"       },
  { city: "New York", code: "NYC",  tz: "America/New_York" },
] as const;

// ── Helpers ───────────────────────────────────────────────────

function getTzAbbr(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone:     tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

interface ZoneTime {
  display:  string; // "09:42"
  hourDeg:  number;
  minDeg:   number;
  secDeg:   number;
}

function calcZoneTime(tz: string): ZoneTime {
  const now = new Date();
  const str = now.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour:     "2-digit",
    minute:   "2-digit",
    second:   "2-digit",
    hour12:   false,
  });
  const parts = str.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);

  // Degrees — always increasing so CSS transitions never sweep backwards
  const hourDeg = ((h % 12) / 12) * 360 + (m / 60) * 30 + (s / 3600) * 30;
  const minDeg  = (m / 60) * 360 + (s / 60) * 6;
  const secDeg  = (s / 60) * 360;

  return {
    display: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    hourDeg,
    minDeg,
    secDeg,
  };
}

// ── SVG analog clock face (light-mode palette) ────────────────

interface ClockFaceProps {
  t:           ZoneTime | undefined;
  initialized: boolean;
}

function ClockFace({ t, initialized }: ClockFaceProps) {
  if (!t) {
    return (
      <div className="w-[52px] h-[52px] rounded-full bg-black/[0.04] flex-shrink-0 animate-pulse" />
    );
  }

  return (
    <svg
      viewBox="0 0 60 60"
      className="w-[52px] h-[52px] flex-shrink-0"
      aria-hidden
    >
      {/* Outer ring */}
      <circle
        cx="30" cy="30" r="28"
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="1"
      />

      {/* Hour tick marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const rad    = ((i * 30) - 90) * (Math.PI / 180);
        const isCard = i % 3 === 0;
        const r1     = isCard ? 22 : 24;
        const r2     = 27;
        return (
          <line
            key={i}
            x1={30 + r1 * Math.cos(rad)}
            y1={30 + r1 * Math.sin(rad)}
            x2={30 + r2 * Math.cos(rad)}
            y2={30 + r2 * Math.sin(rad)}
            stroke={isCard ? "rgba(212,175,55,0.65)" : "rgba(0,0,0,0.12)"}
            strokeWidth={isCard ? "1.5" : "0.75"}
            strokeLinecap="round"
          />
        );
      })}

      {/* Hour hand */}
      <line
        x1="30" y1="30" x2="30" y2="16"
        stroke="rgba(26,26,26,0.80)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{
          transformOrigin: "30px 30px",
          transform:       `rotate(${t.hourDeg}deg)`,
          transition:      initialized ? "transform 0.9s cubic-bezier(0.4,0,0.2,1)" : "none",
        }}
      />

      {/* Minute hand */}
      <line
        x1="30" y1="30" x2="30" y2="10"
        stroke="rgba(26,26,26,0.50)"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          transformOrigin: "30px 30px",
          transform:       `rotate(${t.minDeg}deg)`,
          transition:      initialized ? "transform 0.6s cubic-bezier(0.4,0,0.2,1)" : "none",
        }}
      />

      {/* Second hand — gold, snaps — mechanical tick feel */}
      <line
        x1="30" y1="34" x2="30" y2="8"
        stroke="#D4AF37"
        strokeWidth="0.8"
        strokeLinecap="round"
        style={{
          transformOrigin: "30px 30px",
          transform:       `rotate(${t.secDeg}deg)`,
        }}
      />

      {/* Center dot */}
      <circle cx="30" cy="30" r="2.8" fill="#D4AF37" />
      <circle cx="30" cy="30" r="1.2" fill="rgba(249,249,246,0.95)" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────

export function WorldClock() {
  const [clocks, setClocks] = useState<Record<string, ZoneTime>>({});
  const [abbrs,  setAbbrs]  = useState<Record<string, string>>({});
  const [ready,  setReady]  = useState(false);

  useEffect(() => {
    const tzMap: Record<string, string> = {};
    ZONES.forEach((z) => { tzMap[z.city] = getTzAbbr(z.tz); });
    setAbbrs(tzMap);

    const tick = () => {
      const next: Record<string, ZoneTime> = {};
      ZONES.forEach((z) => { next[z.city] = calcZoneTime(z.tz); });
      setClocks(next);
      setReady(true);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className={cn(
        "rounded-2xl bg-white px-6 py-6",
        "border border-[#EAEAE5]",
        "shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]",
        "relative overflow-hidden"
      )}
    >
      {/* Subtle gold accent — top right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 w-32 h-32
                   rounded-full bg-[#D4AF37]/[0.06] blur-2xl"
      />

      {/* Header */}
      <p className="text-[9px] font-semibold text-[#B0ADA8] uppercase tracking-[0.26em] mb-6">
        Global Pulse
      </p>

      {/* City rows */}
      <div className="space-y-0">
        {ZONES.map((zone, i) => (
          <div key={zone.city}>
            <div className="flex items-center gap-4">
              {/* Analog clock */}
              <ClockFace t={clocks[zone.city]} initialized={ready} />

              {/* Digital readout */}
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-[#D4AF37]/80
                              uppercase tracking-[0.22em] mb-0.5">
                  {zone.code}
                </p>
                <p
                  className="text-[#1A1A1A] text-[1.6rem] font-semibold
                             leading-none tracking-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {clocks[zone.city]?.display ?? "—"}
                </p>
                <p className="text-[#C0BDB5] text-[10px] mt-0.5 font-medium tabular-nums">
                  {abbrs[zone.city] ?? ""}
                </p>
              </div>
            </div>

            {i < ZONES.length - 1 && (
              <div className="my-5 h-px bg-[#EAEAE5]" />
            )}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[9px] text-[#C0BDB5] mt-6 tracking-wide">
        Times update in real time
      </p>
    </motion.div>
  );
}
