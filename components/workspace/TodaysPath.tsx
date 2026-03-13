"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatLocalTime } from "@/lib/utils/date-format";
import { completeTask } from "@/lib/actions/tasks";
import type { TaskWithLead } from "@/lib/types/database";

// ── Custom olive checkbox SVG ─────────────────────────────
// Draws a soft circle; on completion animates a check stroke.

function OliveCheckbox({
  done,
  onToggle,
}: {
  done:     boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex-shrink-0 mt-0.5 w-5 h-5 focus:outline-none transition-opacity"
      aria-label={done ? "Mark incomplete" : "Mark complete"}
    >
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle
          cx="10" cy="10" r="8.5"
          stroke={done ? "#4A7C59" : "#C8C4BE"}
          strokeWidth="1.4"
          className="transition-colors duration-300"
        />
        {/* Fill on done */}
        <AnimatePresence>
          {done && (
            <motion.circle
              key="fill"
              cx="10" cy="10" r="8.5"
              fill="#4A7C59"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "backOut" }}
              style={{ transformOrigin: "10px 10px" }}
            />
          )}
        </AnimatePresence>
        {/* Check path */}
        <AnimatePresence>
          {done && (
            <motion.path
              key="check"
              d="M6.5 10.5 L9 13 L13.5 7.5"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              exit={{ pathLength: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </svg>
    </button>
  );
}

// ── Task row ──────────────────────────────────────────────

function TaskRow({
  task,
  index,
}: {
  task:  TaskWithLead;
  index: number;
}) {
  const [done, setDone]       = useState(task.status === "completed");
  const [, startTransition]   = useTransition();

  function handleToggle() {
    if (done) return; // tasks can only be completed, not un-completed
    setDone(true);
    startTransition(async () => {
      await completeTask(task.id);
    });
  }

  const dueTime = formatLocalTime(task.due_date);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-start gap-3.5 py-3"
    >
      <OliveCheckbox done={done} onToggle={handleToggle} />

      <div className="flex-1 min-w-0">
        <motion.p
          animate={{ opacity: done ? 0.3 : 1 }}
          transition={{ duration: 0.4 }}
          className="text-[#1A1A1A] text-[13.5px] font-medium leading-snug truncate"
          style={{
            textDecorationLine: done ? "line-through" : "none",
            textDecorationColor: done ? "#9E9E9E" : undefined,
          }}
        >
          {task.title}
        </motion.p>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-[#B0ADA8] tabular-nums">{dueTime}</span>

          {task.lead && (
            <>
              <span className="text-[#D8D4CE] text-[10px]">·</span>
              <span className="text-[10px] text-[#B0ADA8] truncate max-w-[120px]">
                {(task.lead?.first_name + " " + (task.lead?.last_name ?? ""))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Done label fades in */}
      <AnimatePresence>
        {done && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25 }}
            className="text-[10px] text-[#4A7C59] font-medium bg-[#4A7C59]/10 px-2 py-0.5 rounded-full shrink-0 self-center"
          >
            Done
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────

function EmptyPath() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center justify-center py-10 gap-3"
    >
      {/* Olive circle ornament */}
      <div className="w-10 h-10 rounded-full border border-[#C8C4BE] flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#4A7C59]/40" />
      </div>
      <p
        className="text-[#C0BDB5] text-[13px] italic text-center leading-relaxed"
        style={{ fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif" }}
      >
        A clear path lies ahead.
        <br />
        No tasks scheduled for today.
      </p>
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────

interface TodaysPathProps {
  tasks: TaskWithLead[];
}

export function TodaysPath({ tasks }: TodaysPathProps) {
  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-[0.26em]">
          Today&rsquo;s Path
        </p>

        {tasks.length > 0 && (
          <span className="text-[10px] text-[#C0BDB5] tabular-nums">
            {tasks.filter((t) => t.status === "completed").length}/{tasks.length}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-black/[0.05] mb-1" />

      {/* Task list */}
      {tasks.length === 0 ? (
        <EmptyPath />
      ) : (
        <div className="divide-y divide-black/[0.04]">
          {tasks.map((task, i) => (
            <TaskRow key={task.id} task={task} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
