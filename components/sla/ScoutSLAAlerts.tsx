"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSLA_Monitor, getLeadDisplayName, LEVEL_1_HOURS, LEVEL_2_HOURS } from "@/lib/hooks/useSLA_Monitor";
import { reassignLead } from "@/lib/actions/leads";
import { toast } from "sonner";
import type { BreachedLead } from "@/lib/hooks/useSLA_Monitor";

interface Agent {
  id: string;
  full_name: string;
}

function hoursWaiting(assignedAt: string): number {
  return Math.floor((Date.now() - new Date(assignedAt).getTime()) / (60 * 60 * 1000));
}

function ReassignDropdown({
  lead,
  agents,
  onReassigned,
}: {
  lead: BreachedLead;
  agents: Agent[];
  onReassigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelect(agentId: string) {
    if (agentId === lead.assigned_agent?.id) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await reassignLead(lead.id, agentId);
    setSaving(false);
    setOpen(false);
    if (result.success) {
      toast.success("Lead reassigned.");
      onReassigned();
    } else {
      toast.error(result.error ?? "Failed to reassign.");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="
          px-3 py-1.5 rounded-lg text-[12px] font-medium
          bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25
          text-[#1A1A1A] transition-colors
          disabled:opacity-60
        "
      >
        {saving ? "Reassigning…" : "Reassign"}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="
                absolute right-0 top-full mt-1 z-50
                min-w-[180px] py-1
                bg-[#F9F9F6] border border-black/8 rounded-lg shadow-lg
                max-h-48 overflow-y-auto
              "
            >
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.id)}
                  className="
                    w-full px-3 py-2 text-left text-[13px]
                    hover:bg-black/[0.04] transition-colors
                  "
                >
                  {agent.full_name}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ScoutSLAAlertsProps {
  userId: string;
}

export function ScoutSLAAlerts({ userId }: ScoutSLAAlertsProps) {
  const { breachedLeads, refetch } = useSLA_Monitor(userId, "scout");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (drawerOpen && agents.length === 0) {
      createClient()
        .from("profiles")
        .select("id, full_name")
        .eq("role", "agent")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .then(({ data }) => setAgents(data ?? []));
    }
  }, [drawerOpen, agents.length]);

  const hasBreaches = breachedLeads.length > 0;

  return (
    <>
      {/* Muted warning bell with crimson dot — fixed top-right of content area */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="
          fixed top-6 right-16 z-40
          w-9 h-9 rounded-xl flex items-center justify-center
          text-[#9E9E9E] hover:text-[#1A1A1A]
          hover:bg-black/[0.04] transition-colors
          relative
        "
        aria-label="SLA Alerts"
      >
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        {hasBreaches && (
          <span
            className="absolute top-2 right-2 w-2 h-2 bg-red-700 rounded-full ring-2 ring-[#F9F9F6]"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Escalated Leads Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="
                fixed top-0 right-0 h-full w-full max-w-md
                bg-[#F9F9F6] border-l border-black/[0.06]
                shadow-2xl z-50 flex flex-col
              "
            >
              <div className="px-6 py-5 border-b border-black/[0.06]">
                <h2 className="text-lg font-semibold text-[#1A1A1A] tracking-tight">
                  Escalated Leads
                </h2>
                <p className="text-[13px] text-[#9E9E9E] mt-0.5">
                  Leads breaching 3h or 5h SLA
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {!hasBreaches ? (
                  <p className="text-[13px] text-[#9E9E9E]">
                    No escalated leads at the moment.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {breachedLeads.map((lead) => {
                      const hrs = hoursWaiting(lead.assigned_at);
                      const name = getLeadDisplayName(lead.first_name, lead.last_name);
                      const agentName = lead.assigned_agent?.full_name ?? "Unassigned";
                      const levelLabel = lead.breachLevel === 2 ? "5h+" : "3h+";
                      return (
                        <div
                          key={lead.id}
                          className="
                            p-4 rounded-xl
                            bg-white border border-red-900/20
                            shadow-sm
                          "
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <p className="font-medium text-[#1A1A1A] text-[14px]">
                                {name}
                              </p>
                              <p className="text-[12px] text-[#9E9E9E] mt-0.5">
                                {agentName} · {hrs}h waiting
                              </p>
                            </div>
                            <ReassignDropdown
                              lead={lead}
                              agents={agents}
                              onReassigned={refetch}
                            />
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`
                                text-[10px] font-medium px-2 py-0.5 rounded
                                ${lead.breachLevel === 2 ? "bg-red-900/20 text-red-900" : "bg-amber-900/20 text-amber-900"}
                              `}
                            >
                              {levelLabel}
                            </span>
                            <a
                              href={`/leads/${lead.id}`}
                              className="text-[12px] text-[#D4AF37] hover:underline"
                            >
                              View lead →
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
