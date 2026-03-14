"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X } from "lucide-react";
import { useSLA_Monitor, getLeadDisplayName, getMinsWaiting } from "@/lib/hooks/useSLA_Monitor";
import { markLeadSLAAlertSent } from "@/lib/actions/leads";
import type { BreachedLead } from "@/lib/hooks/useSLA_Monitor";

const STORAGE_KEY = "dismissed_sla_alerts";

function getDismissedFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addDismissedToStorage(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getDismissedFromStorage();
    if (current.includes(id)) return;
    const next = [...current, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

const STRIKE_STYLES: Record<1 | 2 | 3, { msg: string; className: string }> = {
  1: {
    msg: "Lead waiting.",
    className: "border-amber-600/50 shadow-[0_0_20px_rgba(180,83,9,0.2)] animate-pulse",
  },
  2: {
    msg: "Warning: SLA breaching soon.",
    className: "border-red-800/60 shadow-[0_0_24px_rgba(127,29,29,0.3)] animate-pulse",
  },
  3: {
    msg: "ESCALATED: Manager notified.",
    className: "border-red-700 ring-2 ring-red-600/30",
  },
};

function AlertCard({ lead, onDismiss }: { lead: BreachedLead; onDismiss: () => void }) {
  const mins = getMinsWaiting(lead.assigned_at, lead.created_at, lead.is_off_duty);
  const style = STRIKE_STYLES[lead.breachLevel];
  const name = getLeadDisplayName(lead.first_name, lead.last_name);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`
        rounded-xl overflow-hidden
        bg-[#1A1A1A]/95 backdrop-blur-xl
        border ${style.className}
      `}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white/90 font-medium tracking-wide">
              {lead.breachLevel === 3 ? "Action Required" : "SLA Alert"}
            </p>
            <p className="text-[12px] text-white/60 mt-1 leading-relaxed">
              {name} — {style.msg} ({mins}m)
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
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
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    const stored = getDismissedFromStorage();
    setDismissedIds(new Set(stored));
    setStorageLoaded(true);
  }, []);

  const visible = breachedLeads
    .filter((l) => !dismissedIds.has(l.id))
    .slice(0, 3);

  const markedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    visible.forEach((lead) => {
      if (markedRef.current.has(lead.id)) return;
      markedRef.current.add(lead.id);
      markLeadSLAAlertSent(lead.id, lead.breachLevel >= 1, lead.breachLevel >= 3).catch(
        () => {}
      );
    });
  }, [visible]);

  const handleDismiss = (id: string) => {
    addDismissedToStorage(id);
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  if (loading || !storageLoaded || visible.length === 0) return null;

  return (
    <AnimatePresence mode="popLayout">
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 max-w-md w-[calc(100%-3rem)]"
        role="alert"
      >
        {visible.map((lead) => (
          <AlertCard key={lead.id} lead={lead} onDismiss={() => handleDismiss(lead.id)} />
        ))}
      </div>
    </AnimatePresence>
  );
}
