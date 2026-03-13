"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { format } from "date-fns";
import { Trophy } from "lucide-react";
import { getInitials } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────

export interface ConversionRow {
  id: string;
  first_name: string;
  last_name: string | null;
  deal_value: number | null;
  deal_duration: string | null;
  updated_at: string;
}

interface ConversionsTableProps {
  conversions: ConversionRow[];
}

// ── Helpers ────────────────────────────────────────────────

function formatDealValue(value: number | null): string {
  if (value === null) return "—";
  // Format as Indian locale (e.g. ₹ 4,00,000)
  return "₹ " + value.toLocaleString("en-IN");
}

function formatConvertedAt(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy • h:mm a");
  } catch {
    return iso;
  }
}

// ── Table header cell ──────────────────────────────────────

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-6 py-3.5 text-[10px] font-semibold text-white/[0.28] uppercase tracking-widest whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

// ── Empty state ────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-6 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <Trophy className="w-7 h-7 text-white/[0.18]" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-white/50 text-sm font-medium">No conversions yet.</p>
        <p className="text-white/[0.22] text-xs tracking-wide">
          Your closed deals will appear here.
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export function ConversionsTable({ conversions }: ConversionsTableProps) {
  const router = useRouter();

  if (conversions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="w-full text-sm" style={{ minWidth: "720px" }}>
        <thead>
          <tr className="border-b border-white/[0.06]">
            <Th>Client</Th>
            <Th>Deal Value</Th>
            <Th>Time Converted</Th>
            <Th>Duration</Th>
          </tr>
        </thead>

        <tbody>
          <AnimatePresence mode="popLayout">
            {conversions.map((row, i) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  delay: Math.min(i, 7) * 0.03,
                  duration: 0.35,
                  ease: luxuryEasing,
                }}
                onClick={() => router.push(`/leads/${row.id}`)}
                className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors duration-300 group"
              >
                {/* ── Client ─────────────────────────── */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/15 flex items-center justify-center text-[10px] font-semibold text-[#D4AF37]/70 shrink-0 select-none">
                      {getInitials(
                        [row.first_name, row.last_name]
                          .filter(Boolean)
                          .join(" "),
                      )}
                    </div>
                    <span className="font-semibold text-white/90 truncate max-w-[200px] leading-none">
                      {row.first_name} {row.last_name ?? ""}
                    </span>
                  </div>
                </td>

                {/* ── Deal Value ─────────────────────── */}
                <td className="px-6 py-4">
                  <span className="text-[#D4AF37] font-semibold text-sm tabular-nums">
                    {formatDealValue(row.deal_value)}
                  </span>
                </td>

                {/* ── Time Converted ─────────────────── */}
                <td className="px-6 py-4">
                  <span className="text-white/50 text-xs font-medium tabular-nums">
                    {formatConvertedAt(row.updated_at)}
                  </span>
                </td>

                {/* ── Duration ───────────────────────── */}
                <td className="px-6 py-4">
                  {row.deal_duration ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/50 tracking-wide">
                      {row.deal_duration}
                    </span>
                  ) : (
                    <span className="text-white/[0.18] text-xs select-none">
                      —
                    </span>
                  )}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
