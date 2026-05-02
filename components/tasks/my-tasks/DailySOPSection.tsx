"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, CheckCircle2, Circle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { completePersonalTask, getDailyPersonalTasks } from "@/lib/actions/tasks";
import type { PersonalTask } from "@/lib/types/database";
import { ManagePersonalSOPsModal } from "./ManagePersonalSOPsModal";
import { visiblePersonalTaskTagsForList } from "@/lib/constants/personalTaskTags";

interface DailySOPSectionProps {
  initialTasks: PersonalTask[];
  onParentRefresh?: () => void;
}

export function DailySOPSection({ initialTasks, onParentRefresh }: DailySOPSectionProps) {
  const [tasks, setTasks] = useState<PersonalTask[]>(initialTasks);
  const [modalOpen, setModalOpen] = useState(false);
  const [optimisticDoneIds, setOptimisticDoneIds] = useState<Set<string>>(new Set());
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  async function reloadFromServer() {
    const res = await getDailyPersonalTasks();
    if (res.success && res.data) setTasks(res.data.items);
  }

  function handleModalApplied() {
    void (async () => {
      await reloadFromServer();
      onParentRefresh?.();
    })();
  }

  async function handleToggleComplete(task: PersonalTask) {
    if (task.atlas_status === "done" || optimisticDoneIds.has(task.id) || completingId) return;

    setOptimisticDoneIds((s) => new Set(s).add(task.id));
    setCompletingId(task.id);

    const result = await completePersonalTask(task.id);

    if (!result.success) {
      toast.error(result.error ?? "Could not update.");
      setOptimisticDoneIds((s) => {
        const n = new Set(s);
        n.delete(task.id);
        return n;
      });
    } else {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, atlas_status: "done", progress: 100 } : t,
        ),
      );
      onParentRefresh?.();
    }

    setOptimisticDoneIds((s) => {
      const n = new Set(s);
      n.delete(task.id);
      return n;
    });
    setCompletingId(null);
  }

  const activeRows = tasks.filter((t) => t.atlas_status !== "cancelled");
  const hasAny = activeRows.length > 0;

  return (
    <>
      <section
        className={cn(
          "relative overflow-hidden rounded-xl border border-[#D4AF37]/20",
          "bg-[#D4AF37]/[0.04] shadow-[0_0_32px_rgba(212,175,55,0.06)]",
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-[#D4AF37]/10" aria-hidden />

        <div className="relative flex items-center justify-between gap-3 border-b border-[#D4AF37]/15 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
            <h2 className="font-serif text-[15px] font-semibold tracking-tight text-[#1A1A1A]">
              My Daily SOP
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/25 bg-white/80 text-[#6B6B6B] shadow-sm transition-colors hover:border-[#D4AF37]/45 hover:text-[#1A1A1A]"
            aria-label="Manage daily checklist"
            title="Manage daily checklist"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="relative px-3 py-2">
          {!hasAny ? (
            <p className="px-1 py-6 text-center text-[12px] leading-relaxed text-[#8A8A6E]">
              You have no daily routines set. Click the gear icon to set up your Daily SOP.
            </p>
          ) : (
            <ul className="divide-y divide-[#D4AF37]/10">
              {activeRows.map((task) => {
                const done =
                  task.atlas_status === "done" || optimisticDoneIds.has(task.id);
                const busy = completingId === task.id;
                const rowTags = visiblePersonalTaskTagsForList(task.tags);

                return (
                  <li key={task.id} className="flex items-center gap-3 py-2.5 pl-1 pr-2">
                    <button
                      type="button"
                      disabled={done || busy}
                      onClick={() => void handleToggleComplete(task)}
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                        done
                          ? "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#B8962E]"
                          : "border-[#D4AF37]/30 text-[#B5A99A] hover:border-[#D4AF37]/55 hover:text-[#D4AF37]",
                        busy && "opacity-50",
                      )}
                      aria-label={done ? "Completed" : "Mark complete"}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-[#D4AF37]" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] font-medium leading-snug transition-colors",
                          done ? "text-[#1A1A1A]/30 line-through" : "text-[#1A1A1A]/85",
                        )}
                      >
                        {task.title}
                      </span>
                      {rowTags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rowTags.map((tag) => (
                            <span
                              key={tag}
                              className="max-w-[120px] truncate rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-[#1A1A1A] ring-1 ring-[#D4AF37]/25"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <ManagePersonalSOPsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onApplied={handleModalApplied}
      />
    </>
  );
}
