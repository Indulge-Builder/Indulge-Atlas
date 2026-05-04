"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useSlaAlerts } from "@/lib/hooks/useSlaAlerts";
import { getLeadDisplayName, getMinsWaiting } from "@/lib/hooks/useSLA_Monitor";
import { dismissSlaAlert } from "@/lib/actions/sla";
import { markLeadSLAAlertSent } from "@/lib/actions/leads";
import type { SlaAlert } from "@/lib/hooks/useSlaAlerts";

// Matches ScoutSLAAlerts + app theme: border-[#E5E4DF], soft shadows, subtle accent rings
const STRIKE_STYLES: Record<1 | 2 | 3, { msg: string; borderClass: string }> = {
  1: {
    msg: "Lead waiting.",
    borderClass:
      "border-amber-900/25 ring-1 ring-amber-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.06)]",
  },
  2: {
    msg: "Warning: SLA breaching soon.",
    borderClass:
      "border-red-900/30 ring-1 ring-red-200/50 shadow-[0_4px_20px_rgb(0,0,0,0.06)]",
  },
  3: {
    msg: "ESCALATED: Manager notified.",
    borderClass:
      "border-red-700/45 ring-1 ring-red-300/40 shadow-[0_4px_20px_rgb(0,0,0,0.06),0_0_12px_rgba(185,28,28,0.08)]",
  },
};

function SlaAlertToastContent({
  lead,
  onAcknowledge,
}: {
  lead: SlaAlert;
  onAcknowledge: () => void;
}) {
  const mins = getMinsWaiting(lead.assigned_at, lead.created_at, lead.is_off_duty);
  const style = STRIKE_STYLES[lead.breachLevel];
  const name = getLeadDisplayName(lead.first_name, lead.last_name);

  return (
    <div
      className={`
        rounded-2xl overflow-hidden
        bg-white
        border ${style.borderClass}
      `}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-stone-700 font-medium tracking-wide">
              {lead.breachLevel === 3 ? "Action Required" : "SLA Alert"}
            </p>
            <p className="text-[12px] text-stone-500 mt-1 leading-relaxed">
              {name} — {style.msg} ({mins}m)
            </p>
          </div>
          <button
            onClick={onAcknowledge}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            aria-label="Acknowledge"
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
              bg-[#F4F3F0] hover:bg-[#EBEAE5]
              text-[#1A1A1A] text-[12px] font-medium
              border border-[#E5E4DF]
              transition-colors duration-200
            "
          >
            Review Lead
          </Link>
        </div>
      </div>
    </div>
  );
}

interface AgentSLAAlertProps {
  userId: string;
}

export function AgentSLAAlert({ userId }: AgentSLAAlertProps) {
  const { unreadAlerts, loading } = useSlaAlerts(userId);
  const toastedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (loading || unreadAlerts.length === 0) return;

    unreadAlerts.forEach((lead) => {
      if (toastedIds.current.has(lead.id)) return;
      toastedIds.current.add(lead.id);

      markLeadSLAAlertSent(lead.id, lead.breachLevel >= 1, lead.breachLevel >= 3).catch(
        () => {}
      );

      const handleAcknowledge = () => {
        toast.dismiss(`sla-${lead.id}`);
        dismissSlaAlert(lead.id).catch(() => {});
      };

      toast.custom(
        () => (
          <SlaAlertToastContent
            lead={lead}
            onAcknowledge={handleAcknowledge}
          />
        ),
        {
          id: `sla-${lead.id}`,
          duration: Infinity,
          position: "bottom-center",
          onDismiss: () => dismissSlaAlert(lead.id),
        }
      );
    });
  }, [unreadAlerts, loading]);

  return null;
}
