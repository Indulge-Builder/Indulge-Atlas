"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type {
  EmployeeDepartment,
  EmployeeHealthSignal,
  IndulgeDomain,
  Profile,
  TaskIntelligenceAgentSummary,
} from "@/lib/types/database";
import { AgentHealthCard } from "./AgentHealthCard";
import { EmployeeDossierModal } from "./EmployeeDossierModal";

interface DepartmentIndividualTasksViewProps {
  agents: TaskIntelligenceAgentSummary[];
  departmentId: EmployeeDepartment | null;
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
}

function summaryToProfile(
  agent: TaskIntelligenceAgentSummary,
  fallbackDepartmentId: EmployeeDepartment | null,
): Profile {
  const department: EmployeeDepartment | null =
    agent.department ?? fallbackDepartmentId;
  const domain: IndulgeDomain = agent.domain;

  return {
    id: agent.id,
    full_name: agent.full_name,
    email: "",
    phone: null,
    dob: null,
    role: "agent",
    domain,
    department,
    job_title: agent.job_title,
    reports_to: null,
    is_on_leave: agent.is_on_leave,
    is_active: true,
    created_at: "",
    updated_at: "",
  };
}

function activePersonalCount(agent: TaskIntelligenceAgentSummary): number {
  let n = 0;
  const skip = new Set<string>(["done", "cancelled"]);
  for (const [st, c] of Object.entries(agent.statusCounts)) {
    if (!skip.has(st)) n += c ?? 0;
  }
  return n;
}

function deriveEmployeeHealthSignal(
  agent: TaskIntelligenceAgentSummary,
): EmployeeHealthSignal {
  if (agent.is_on_leave) return "on_leave";
  if (agent.overduePersonalCount > 2) return "at_risk";
  if (
    agent.overduePersonalCount > 0 &&
    agent.todaySopCompletionPct < 45
  ) {
    return "overloaded";
  }
  return "on_track";
}

export function DepartmentIndividualTasksView({
  agents,
  departmentId,
  currentUser,
}: DepartmentIndividualTasksViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const filteredAgentList = useMemo(
    () => agents.map((a) => summaryToProfile(a, departmentId)),
    [agents, departmentId],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {agents.map((agent) => (
          <AgentHealthCard
            key={agent.id}
            profile={summaryToProfile(agent, departmentId)}
            healthSignal={deriveEmployeeHealthSignal(agent)}
            completionRate={
              agent.todaySopCompletionPct > 0 ? agent.todaySopCompletionPct : 0
            }
            activeTaskCount={activePersonalCount(agent)}
            overdueCount={agent.overduePersonalCount}
            isOnLeave={agent.is_on_leave}
            onSelect={(id) => setSelectedAgentId(id)}
          />
        ))}
      </div>

      <p className="text-center font-serif text-[15px] italic text-[#8A8A6E]">
        Click an agent card to open their dossier.
      </p>

      <AnimatePresence>
        {selectedAgentId ? (
          <EmployeeDossierModal
            key="dossier"
            agentId={selectedAgentId}
            agentList={filteredAgentList}
            currentUser={currentUser}
            onClose={() => setSelectedAgentId(null)}
            onNavigate={(id) => setSelectedAgentId(id)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
