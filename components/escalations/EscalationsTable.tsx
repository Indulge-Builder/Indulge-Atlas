"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Shield } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import type { LeadStatus } from "@/lib/types/database";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;

export interface EscalationRow {
  id: string;
  first_name: string;
  last_name: string | null;
  status: string;
  assigned_at: string | null;
  agent_alert_sent: boolean;
  manager_alert_sent: boolean;
}

interface EscalationsTableProps {
  rows: EscalationRow[];
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-6 py-3.5 text-[10px] font-bold text-white uppercase tracking-widest whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 px-6 gap-5">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <Shield className="w-7 h-7 text-white/[0.18]" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-white/50 text-sm font-medium">Perfect Record.</p>
        <p className="text-white/[0.22] text-xs tracking-wide">
          No SLA breaches logged.
        </p>
      </div>
    </div>
  );
}

function formatAssignedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy • h:mm a");
  } catch {
    return iso;
  }
}

export function EscalationsTable({ rows }: EscalationsTableProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="w-full text-sm" style={{ minWidth: "720px" }}>
        <thead>
          <tr className="border-b border-white/[0.06]">
            <Th>Lead Name</Th>
            <Th>Status</Th>
            <Th>Assigned Time</Th>
            <Th align="right">Breach Level</Th>
          </tr>
        </thead>

        <tbody>
          <AnimatePresence mode="popLayout">
            {rows.map((row, i) => (
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
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-white/50 shrink-0 select-none">
                      {getInitials(
                        [row.first_name, row.last_name].filter(Boolean).join(" ")
                      )}
                    </div>
                    <span className="font-semibold text-white/90 truncate max-w-[200px] leading-none">
                      {row.first_name} {row.last_name ?? ""}
                    </span>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <LeadStatusBadge status={row.status as LeadStatus} size="sm" />
                </td>

                <td className="px-6 py-4">
                  <span className="text-white/50 text-xs font-medium tabular-nums">
                    {formatAssignedAt(row.assigned_at)}
                  </span>
                </td>

                <td className="px-6 py-4 text-right">
                  {row.manager_alert_sent ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-900/25 border border-red-700/30 text-red-400 tracking-wide">
                      Manager Escalated
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-900/20 border border-amber-700/25 text-amber-400/90 tracking-wide">
                      Agent Warning
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
