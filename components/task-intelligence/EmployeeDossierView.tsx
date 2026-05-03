"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getEmployeeDossier } from "@/lib/actions/task-intelligence";
import { useEmployeeDossierRealtime } from "@/lib/hooks/useTaskIntelligenceRealtime";
import { SubTaskModal } from "@/components/tasks/SubTaskModal";
import type { EmployeeDossierPayload, Profile } from "@/lib/types/database";
import { EmployeeProfilePanel } from "./EmployeeProfilePanel";
import { EmployeeTaskList } from "./EmployeeTaskList";

export interface EmployeeDossierViewProps {
  agentId: string;
  /** Shown on “Back” (e.g. `/task-insights` or `/task-insights/tech`) */
  backHref: string;
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
  /** Optional carousel for Prev / Next */
  agentList?: Profile[];
  onNavigateAgent?: (agentId: string) => void;
}

export function EmployeeDossierView({
  agentId,
  backHref,
  currentUser,
  agentList = [],
  onNavigateAgent,
}: EmployeeDossierViewProps) {
  const [dossier, setDossier] = useState<EmployeeDossierPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTaskOpenRef = useRef(false);

  useEffect(() => {
    detailTaskOpenRef.current = detailTaskId !== null;
  }, [detailTaskId]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setDossier(null);
    const result = await getEmployeeDossier(id);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "Failed to load dossier");
      return;
    }
    if (result.data) setDossier(result.data);
  }, []);

  useEffect(() => {
    void load(agentId);
  }, [agentId, load]);

  useEffect(() => {
    setDetailTaskId(null);
  }, [agentId]);

  const refetch = useCallback(() => {
    void load(agentId);
  }, [agentId, load]);

  useEmployeeDossierRealtime(agentId, refetch);

  const currentIndex = agentList.findIndex((a) => a.id === agentId);
  const prevAgent =
    currentIndex > 0 ? agentList[currentIndex - 1] ?? null : null;
  const nextAgent =
    currentIndex >= 0 && currentIndex < agentList.length - 1
      ? agentList[currentIndex + 1] ?? null
      : null;

  const navigate = (id: string) => {
    if (onNavigateAgent) onNavigateAgent(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F9F9F6]">
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-6 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back
          </Link>
          {agentList.length > 1 && onNavigateAgent ? (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={!prevAgent}
                onClick={() => prevAgent && navigate(prevAgent.id)}
                className="rounded-lg px-3 py-1.5 text-xs text-stone-500 transition-all hover:bg-stone-200/60 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-25"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={!nextAgent}
                onClick={() => nextAgent && navigate(nextAgent.id)}
                className="rounded-lg px-3 py-1.5 text-xs text-stone-500 transition-all hover:bg-stone-200/60 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-25"
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden border-x border-[#E5E4DF] bg-white shadow-sm md:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-b border-[#E5E4DF] bg-[#F9F9F6] md:w-[300px] md:border-b-0 md:border-r">
          {loading && !dossier ? (
            <div className="flex flex-col gap-4 p-6">
              <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-stone-200" />
              <div className="h-3 w-full animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-full animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-[75%] animate-pulse rounded bg-stone-200" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/90" />
              <p className="text-sm text-stone-600">{error}</p>
              <button
                type="button"
                onClick={() => void load(agentId)}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800"
              >
                Retry
              </button>
            </div>
          ) : dossier ? (
            <EmployeeProfilePanel profile={dossier.profile} metrics={dossier.metrics} />
          ) : null}
        </aside>

        <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden bg-white md:min-h-0">
          {loading && !dossier ? (
            <div className="flex flex-col gap-2 p-4">
              <div className="mb-2 flex gap-2">
                <div className="h-8 flex-1 animate-pulse rounded bg-stone-200" />
                <div className="h-8 flex-1 animate-pulse rounded bg-stone-200" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />
              ))}
            </div>
          ) : dossier ? (
            <EmployeeTaskList
              personalTasks={dossier.personalTasks}
              workspaceSubtasks={dossier.workspaceSubtasks}
              agentName={dossier.profile.full_name}
              onOpenWorkspaceSubtask={(id) => setDetailTaskId(id)}
              onOpenPersonalTask={(id) => setDetailTaskId(id)}
            />
          ) : null}
        </div>
      </div>

      {detailTaskId ? (
        <SubTaskModal
          taskId={detailTaskId}
          currentUser={currentUser}
          stackClassName="z-[125]"
          onClose={() => {
            setDetailTaskId(null);
            void load(agentId);
          }}
        />
      ) : null}
    </div>
  );
}
