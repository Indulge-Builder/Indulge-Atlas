"use client";

import { useMemo } from "react";
import type {
  EmployeeDepartment,
  IndulgeDomain,
  Profile,
  TaskIntelligenceAgentSummary,
} from "@/lib/types/database";
import { AgentHealthCard } from "./AgentHealthCard";

interface DepartmentIndividualTasksViewProps {
  agents: TaskIntelligenceAgentSummary[];
  departmentId: EmployeeDepartment | null;
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
  /** When set, dossier page includes ?from= for back navigation */
  returnToPath?: string | null;
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

function agentDossierHref(agentId: string, returnToPath?: string | null): string {
  if (returnToPath && returnToPath.length > 0) {
    return `/task-insights/agents/${agentId}?from=${encodeURIComponent(returnToPath)}`;
  }
  return `/task-insights/agents/${agentId}`;
}

export function DepartmentIndividualTasksView({
  agents,
  departmentId,
  currentUser,
  returnToPath = null,
}: DepartmentIndividualTasksViewProps) {
  const orderedAgents = useMemo(() => {
    const me = currentUser.id;
    return [...agents].sort((a, b) => {
      if (a.id === me) return -1;
      if (b.id === me) return 1;
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
    });
  }, [agents, currentUser.id]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:thin]">
        {orderedAgents.map((agent) => (
          <AgentHealthCard
            key={agent.id}
            profile={summaryToProfile(agent, departmentId)}
            activeTaskCount={activePersonalCount(agent)}
            isOnLeave={agent.is_on_leave}
            href={agentDossierHref(agent.id, returnToPath)}
          />
        ))}
      </div>

      <p className="text-center font-[family-name:var(--font-playfair)] text-sm italic text-stone-500">
        Click on a card to open.
      </p>
    </div>
  );
}
