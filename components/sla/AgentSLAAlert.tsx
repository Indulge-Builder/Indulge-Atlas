"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSLA_Monitor, getLeadDisplayName, LEVEL_1_HOURS, LEVEL_2_HOURS } from "@/lib/hooks/useSLA_Monitor";
import type { BreachedLead } from "@/lib/hooks/useSLA_Monitor";

function hoursWaiting(assignedAt: string): number {
  return Math.floor((Date.now() - new Date(assignedAt).getTime()) / (60 * 60 * 1000));
}

function AlertCard({ lead, onDismiss }: { lead: BreachedLead; onDismiss?: () => void }) {
  const hrs = hoursWaiting(lead.assigned_at);
  const threshold = lead.breachLevel === 2 ? LEVEL_2_HOURS : LEVEL_1_HOURS;
  const name = getLeadDisplayName(lead.first_name, lead.last_name);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="
        rounded-xl overflow-hidden
        bg-[#1A1A1A]/95 backdrop-blur-xl
        border border-red-900/50
        shadow-[0_0_24px_rgba(127,29,29,0.15)]
      "
    >
      <div className="px-5 py-4">
        <p className="text-[13px] text-white/90 font-medium tracking-wide">
          Action Required
        </p>
        <p className="text-[12px] text-white/60 mt-1 leading-relaxed">
          {name} has been waiting for <span className="text-white/80 font-medium">{hrs}</span> hours.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/leads/${lead.id}`}
            className="
              inline-flex items-center justify-center
              px-4 py-2 rounded-lg
              bg-red-900/40 hover:bg-red-900/60
              text-white/95 text-[12px] font-medium
              transition-colors duration-200
            "
          >
            Review Lead
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

interface AgentSLAAlertProps {
  userId: string;
}

export function AgentSLAAlert({ userId }: AgentSLAAlertProps) {
  const { breachedLeads, loading } = useSLA_Monitor(userId, "agent");

  if (loading || breachedLeads.length === 0) return null;

  return (
    <AnimatePresence mode="popLayout">
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 max-w-md w-[calc(100%-3rem)]"
        role="alert"
      >
        {breachedLeads.slice(0, 3).map((lead) => (
          <AlertCard key={lead.id} lead={lead} />
        ))}
      </div>
    </AnimatePresence>
  );
}
