"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, UserCheck, UserX, UserPlus } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { DOMAIN_CONFIG } from "@/lib/constants/departments";
import { DomainFilterTabs } from "@/components/admin/shared/DomainFilterTabs";
import {
  addAgentToPool,
  pauseAgent,
  removeAgentFromPool,
} from "@/lib/actions/agentAssignment";
import type { AgentWithRoutingStatus, AgentPoolStatus } from "@/lib/types/agentAssignment";
import type { IndulgeDomain } from "@/lib/types/database";

interface Props {
  initialAgents: AgentWithRoutingStatus[];
}

const STATUS_CONFIG: Record<AgentPoolStatus, { label: string; dot: string; badge: string }> = {
  receiving: {
    label: "Receiving",
    dot: "bg-[#4A7C59]",
    badge: "bg-[#EBF4EF] text-[#4A7C59]",
  },
  paused: {
    label: "Paused",
    dot: "bg-[#9E9E9E]",
    badge: "bg-[#F5F5F5] text-[#9E9E9E]",
  },
  unmanaged: {
    label: "Unmanaged",
    dot: "bg-[#A88B25]",
    badge: "bg-[#FEF3C7] text-[#A88B25]",
  },
};

export function AssignmentPoolClient({ initialAgents }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [domain, setDomain] = useState<IndulgeDomain | "all">("all");

  const visible = domain === "all"
    ? initialAgents
    : initialAgents.filter((a) => a.domain === domain);

  const counts = {
    total: visible.length,
    receiving: visible.filter((a) => a.pool_status === "receiving").length,
    paused: visible.filter((a) => a.pool_status === "paused").length,
    unmanaged: visible.filter((a) => a.pool_status === "unmanaged").length,
  };

  function run(agentId: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setPendingId(agentId);
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
      setPendingId(null);
    });
  }

  return (
    <div>
      <DomainFilterTabs value={domain} onChange={setDomain} />

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total agents", value: counts.total },
          { label: "Receiving leads", value: counts.receiving, color: "text-[#4A7C59]" },
          { label: "Paused", value: counts.paused, color: "text-[#9E9E9E]" },
          { label: "Unmanaged", value: counts.unmanaged, color: "text-[#A88B25]" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}
          >
            <p className="text-xs text-[#B5A99A] mb-1">{s.label}</p>
            <p className={cn("text-2xl font-semibold text-[#1A1814]", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "overflow-hidden")}>
        {visible.length === 0 ? (
          <p className="text-center py-16 text-[#B5A99A] text-sm">
            No agents found for this domain.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EEEDE9] bg-[#FAFAF8]">
                {["Agent", "Domain", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-[#B5A99A] uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEDE9]">
              {visible.map((agent) => {
                const cfg = STATUS_CONFIG[agent.pool_status];
                const domainCfg = DOMAIN_CONFIG[agent.domain];
                const loading = isPending && pendingId === agent.id;

                return (
                  <tr key={agent.id} className="hover:bg-[#FAFAF8] transition-colors">
                    {/* Agent */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#EDE8E1] flex items-center justify-center text-xs font-semibold text-brand-gold shrink-0">
                          {getInitials(agent.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1814]">{agent.full_name}</p>
                          <p className="text-xs text-[#B5A99A]">{agent.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Domain */}
                    <td className="px-6 py-4">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ background: domainCfg.pillBg, color: domainCfg.pillColor }}
                      >
                        {domainCfg.label.replace("Indulge ", "")}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", cfg.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {agent.pool_status === "unmanaged" && (
                          <IndulgeButton
                            variant="outline"
                            size="sm"
                            loading={loading}
                            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                            onClick={() => run(agent.id, () => addAgentToPool(agent.id, agent.domain))}
                          >
                            Add to pool
                          </IndulgeButton>
                        )}

                        {agent.pool_status === "receiving" && (
                          <IndulgeButton
                            variant="outline"
                            size="sm"
                            loading={loading}
                            leftIcon={<UserX className="w-3.5 h-3.5" />}
                            onClick={() => run(agent.id, () => pauseAgent(agent.id, agent.domain))}
                          >
                            Pause
                          </IndulgeButton>
                        )}

                        {agent.pool_status === "paused" && (
                          <IndulgeButton
                            variant="outline"
                            size="sm"
                            loading={loading}
                            leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                            onClick={() => run(agent.id, () => addAgentToPool(agent.id, agent.domain))}
                          >
                            Activate
                          </IndulgeButton>
                        )}

                        {agent.pool_status !== "unmanaged" && (
                          <button
                            disabled={loading}
                            onClick={() => run(agent.id, () => removeAgentFromPool(agent.id, agent.domain))}
                            className="p-1.5 rounded text-[#B5A99A] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Remove from pool"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Unmanaged warning */}
      {counts.unmanaged > 0 && (
        <p className="mt-4 text-xs text-[#A88B25] bg-[#FEF3C7] px-4 py-2.5 rounded-lg">
          <strong>{counts.unmanaged} unmanaged agent{counts.unmanaged > 1 ? "s" : ""}</strong> — these agents may still receive leads via the fallback round-robin if no managed pool exists for their domain. Add them to the pool or pause them to take full control.
        </p>
      )}
    </div>
  );
}
