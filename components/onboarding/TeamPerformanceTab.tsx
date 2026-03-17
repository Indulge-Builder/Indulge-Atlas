"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AgentPerformanceModal } from "@/components/team/AgentPerformanceModal";
import { AdminCreateTaskModal } from "@/components/tasks/AdminCreateTaskModal";
import type { AgentWithOnboardingStats } from "@/lib/actions/team-stats";
import { cn } from "@/lib/utils";

interface TeamPerformanceTabProps {
  agents: AgentWithOnboardingStats[];
}

function formatInr(value: number): string {
  if (value >= 10_00_000) return `₹${(value / 10_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function TeamPerformanceTab({ agents }: TeamPerformanceTabProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl p-12 text-center",
          "bg-white/80 backdrop-blur-2xl",
          "ring-1 ring-black/[0.03]",
          "shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
        )}
      >
        <p className="text-stone-500 text-sm">No active sales agents found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2
          className="text-lg font-semibold text-stone-800"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Team Performance
        </h2>
        <AdminCreateTaskModal defaultDepartment="onboarding" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {agents.map((agent, i) => {
          const won = agent.stats.byStatus["won"] ?? 0;
          return (
            <motion.button
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setSelectedAgentId(agent.id)}
              className={cn(
                "rounded-2xl p-5 text-left",
                "bg-white/80 backdrop-blur-2xl",
                "ring-1 ring-black/[0.03]",
                "shadow-[0_8px_30px_rgb(0,0,0,0.02)]",
                "hover:-translate-y-1 hover:shadow-md transition-all duration-200",
                "cursor-pointer"
              )}
            >
              <div className="flex gap-4">
                <Avatar className="w-16 h-16 rounded-full ring-2 ring-stone-200/60 shrink-0">
                  <AvatarImage src={undefined} />
                  <AvatarFallback className="bg-stone-100 text-stone-600 text-lg font-medium">
                    {getInitials(agent.full_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-stone-900 font-medium text-sm truncate">
                    {agent.full_name}
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5 tabular-nums">
                    Leads Attended: {agent.stats.totalLeads}
                  </p>
                  <p className="text-emerald-600/90 text-xs mt-0.5 font-semibold tabular-nums">
                    Converted: {won}
                  </p>
                  <p className="text-amber-600/95 text-sm font-semibold mt-1 tabular-nums">
                    Revenue: {formatInr(agent.stats.wonRevenue)}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <AgentPerformanceModal
        agentId={selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
      />
    </>
  );
}
