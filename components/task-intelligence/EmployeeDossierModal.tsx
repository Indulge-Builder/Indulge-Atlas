"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { getEmployeeDossier } from "@/lib/actions/task-intelligence";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import { useEmployeeDossierRealtime } from "@/lib/hooks/useTaskIntelligenceRealtime";
import type {
  EmployeeDepartment,
  EmployeeDossierPayload,
  Profile,
} from "@/lib/types/database";
import { EmployeeProfilePanel } from "./EmployeeProfilePanel";
import { EmployeeTaskList } from "./EmployeeTaskList";

export interface EmployeeDossierModalProps {
  agentId: string | null;
  agentList: Profile[];
  onClose: () => void;
  onNavigate: (agentId: string) => void;
}

export function EmployeeDossierModal({
  agentId,
  agentList,
  onClose,
  onNavigate,
}: EmployeeDossierModalProps) {
  const [mounted, setMounted] = useState(false);
  const [dossier, setDossier] = useState<EmployeeDossierPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

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
    if (!agentId) return;
    void load(agentId);
  }, [agentId, load]);

  const refetch = useCallback(() => {
    if (agentId) void load(agentId);
  }, [agentId, load]);

  useEmployeeDossierRealtime(agentId ?? "", refetch);

  const currentIndex = agentList.findIndex((a) => a.id === agentId);
  const prevAgent =
    currentIndex > 0 ? agentList[currentIndex - 1] ?? null : null;
  const nextAgent =
    currentIndex >= 0 && currentIndex < agentList.length - 1
      ? agentList[currentIndex + 1] ?? null
      : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && prevAgent) {
        onNavigate(prevAgent.id);
        return;
      }
      if (e.key === "ArrowRight" && nextAgent) {
        onNavigate(nextAgent.id);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, onNavigate, prevAgent, nextAgent]);

  if (!mounted || !agentId) return null;

  const headerAgent = dossier?.profile ?? agentList[currentIndex];
  const dept = headerAgent?.department as EmployeeDepartment | null;
  const deptLabel =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].label
      : (dept ?? "");

  return createPortal(
    <AnimatePresence mode="wait">
      <>
        <motion.button
          key="backdrop"
          type="button"
          aria-label="Close"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          key={agentId}
          role="dialog"
          aria-modal
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-4 z-[111] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-1)] shadow-2xl shadow-black/60 md:inset-[5%]"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex h-12 shrink-0 items-center border-b border-white/8 px-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-xl leading-none text-white/50 hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
            <div className="flex flex-1 items-center justify-center gap-2 px-2">
              {loading && !headerAgent ? (
                <div className="h-4 w-32 animate-pulse rounded bg-white/8" />
              ) : headerAgent ? (
                <>
                  <span className="max-w-[40vw] truncate text-sm font-semibold text-white">
                    {headerAgent.full_name}
                  </span>
                  {deptLabel ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
                      {deptLabel}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={!prevAgent}
                onClick={() => prevAgent && onNavigate(prevAgent.id)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/5 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-20"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={!nextAgent}
                onClick={() => nextAgent && onNavigate(nextAgent.id)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/5 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-20"
              >
                Next →
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-white/8 md:w-[300px]">
              {loading && !dossier ? (
                <div className="flex flex-col gap-4 p-6">
                  <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-white/8" />
                  <div className="h-3 w-full animate-pulse rounded bg-white/8" />
                  <div className="h-3 w-full animate-pulse rounded bg-white/8" />
                  <div className="h-3 w-[75%] animate-pulse rounded bg-white/8" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-4 p-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-red-400/80" />
                  <p className="text-sm text-white/70">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load(agentId)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                  >
                    Retry
                  </button>
                </div>
              ) : dossier ? (
                <EmployeeProfilePanel
                  profile={dossier.profile}
                  metrics={dossier.metrics}
                />
              ) : null}
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading && !dossier ? (
                <div className="flex flex-col gap-2 p-4">
                  <div className="mb-2 flex gap-2">
                    <div className="h-8 flex-1 animate-pulse rounded bg-white/8" />
                    <div className="h-8 flex-1 animate-pulse rounded bg-white/8" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded-lg bg-white/[0.06]"
                    />
                  ))}
                </div>
              ) : dossier ? (
                <EmployeeTaskList
                  personalTasks={dossier.personalTasks}
                  workspaceSubtasks={dossier.workspaceSubtasks}
                  agentName={dossier.profile.full_name}
                />
              ) : null}
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>,
    document.body,
  );
}
