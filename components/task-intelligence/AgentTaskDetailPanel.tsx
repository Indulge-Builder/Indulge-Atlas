"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SubTaskStatusBadge } from "@/components/tasks/SubTaskStatusBadge";
import { TaskPriorityBadge } from "@/components/tasks/TaskPriorityBadge";
import { CompletionRing } from "./CompletionRing";
import { getAgentPersonalTasks } from "@/lib/actions/task-intelligence";
import type {
  TaskIntelligenceAgentSummary,
  TaskIntelligencePersonalTaskRow,
} from "@/lib/types/database";
import type { AtlasTaskStatus } from "@/lib/types/database";

const IST = "Asia/Kolkata";

function DateChip({
  isoDate,
  status,
}: {
  isoDate: string | null;
  status: AtlasTaskStatus;
}) {
  if (!isoDate) return <span className="text-[11px] text-[#B5A99A]">—</span>;
  const overdue =
    status !== "done" &&
    status !== "cancelled" &&
    new Date(isoDate) < new Date();
  return (
    <span
      className={cn(
        "inline-flex text-[11px] font-medium rounded-full px-2 py-0.5",
        overdue
          ? "bg-[#C0392B]/10 text-[#C0392B]"
          : "bg-[#F2F2EE] text-[#6B6B6B]",
      )}
    >
      {format(toZonedTime(new Date(isoDate), IST), "d MMM")}
    </span>
  );
}

function Section({
  eyebrow,
  count,
  children,
}: {
  eyebrow: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A8A6E]">
          {eyebrow}
        </p>
        <span className="text-[10px] font-semibold tabular-nums text-[#B5A99A] bg-[#F2F2EE] px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function TaskRow({ task }: { task: TaskIntelligencePersonalTaskRow }) {
  const st = task.atlas_status as AtlasTaskStatus;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#E5E4DF] last:border-0">
      <SubTaskStatusBadge status={st} size="sm" />
      <span className="flex-1 text-[13px] text-[#1A1A1A] min-w-0 truncate">
        {task.title}
      </span>
      <TaskPriorityBadge priority={task.priority} size="sm" />
      <DateChip isoDate={task.due_date} status={st} />
    </div>
  );
}

interface AgentTaskDetailPanelProps {
  agent: TaskIntelligenceAgentSummary;
}

export function AgentTaskDetailPanel({ agent }: AgentTaskDetailPanelProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    overdue: TaskIntelligencePersonalTaskRow[];
    active: TaskIntelligencePersonalTaskRow[];
    completedToday: TaskIntelligencePersonalTaskRow[];
  } | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLoading(true);
    setData(null);
    startTransition(() => {
      void (async () => {
        const res = await getAgentPersonalTasks({ agentId: agent.id });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "Could not load tasks.");
          setLoading(false);
          return;
        }
        setData(res.data);
        setLoading(false);
      })();
    });
  }, [agent.id]);

  const pct = agent.todaySopCompletionPct;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="px-1 pb-8"
    >
      <div className="flex items-center gap-4 mb-8 border-b border-[#E5E4DF] pb-6">
        <Avatar className="h-12 w-12 ring-1 ring-[#E5E4DF]">
          <AvatarImage src={undefined} alt="" />
          <AvatarFallback className="bg-[#D4AF37]/15 text-[#A88B25] text-sm font-semibold">
            {getInitials(agent.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-xl font-semibold text-[#1A1A1A] truncate">
            {agent.full_name}
          </h3>
          {agent.job_title && (
            <p className="text-[13px] text-[#8A8A6E] truncate">
              {agent.job_title}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center shrink-0">
          <CompletionRing
            percentage={pct}
            size={88}
            strokeWidth={4}
            animate
            center={
              <div className="flex flex-col items-center">
                <span className="font-serif text-lg font-semibold text-[#1A1A1A] tabular-nums">
                  {pct}%
                </span>
              </div>
            }
          />
          <span className="text-[10px] text-[#8A8A6E] mt-1">
            Today&apos;s SOPs
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-[#F2F2EE] animate-pulse"
            />
          ))}
        </div>
      ) : !data ? null : (
        <AnimatePresence mode="wait">
          <motion.div
            key={agent.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {data.overdue.length === 0 &&
            data.active.length === 0 &&
            data.completedToday.length === 0 ? (
              <p className="text-[14px] text-[#8A8A6E] py-6">
                {agent.full_name} has no assigned tasks for today.
              </p>
            ) : (
              <>
                {data.overdue.length > 0 && (
                  <Section eyebrow="Overdue" count={data.overdue.length}>
                    {data.overdue.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </Section>
                )}
                {data.active.length > 0 && (
                  <Section eyebrow="Active" count={data.active.length}>
                    {data.active.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </Section>
                )}
                {data.completedToday.length > 0 && (
                  <Section
                    eyebrow="Completed Today"
                    count={data.completedToday.length}
                  >
                    {data.completedToday.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </Section>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
