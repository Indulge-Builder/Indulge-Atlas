"use client";

import { useState } from "react";
import { AgentCard } from "./AgentCard";
import { AgentPerformanceModal } from "./AgentPerformanceModal";
import type { AgentWithStats } from "@/lib/actions/team-stats";

interface TeamGridProps {
  agents: AgentWithStats[];
}

export function TeamGrid({ agents }: TeamGridProps) {
  const [selected, setSelected] = useState<AgentWithStats | null>(null);

  return (
    <>
      {agents.length === 0 ? (
        <div className="col-span-full text-center py-20">
          <p className="text-[#9E9E9E] text-sm">No active agents found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {agents.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              onClick={setSelected}
            />
          ))}
        </div>
      )}

      <AgentPerformanceModal
        agent={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
