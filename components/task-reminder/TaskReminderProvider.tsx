"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { getTasksForReminders } from "@/lib/actions/tasks";
import { TaskReminderNotification } from "./TaskReminderNotification";
import type { TaskWithLead } from "@/lib/types/database";

const MAX_SCHEDULE_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFETCH_INTERVAL_MS = 15 * 60 * 1000; // 15 min — pick up tasks entering the 24h window

/** Statuses that mean "do not ring" — clear any scheduled timeout */
const TERMINAL_STATUSES: readonly string[] = ["completed", "overdue"];

interface TaskReminderContextValue {
  queueTask: (task: TaskWithLead) => void;
}

const TaskReminderContext = createContext<TaskReminderContextValue | null>(null);

export function useTaskReminder() {
  const ctx = useContext(TaskReminderContext);
  return ctx;
}

interface TaskReminderProviderProps {
  children: React.ReactNode;
}

export function TaskReminderProvider({ children }: TaskReminderProviderProps) {
  const [activeTask, setActiveTask] = useState<TaskWithLead | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const activeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  function scheduleTask(task: TaskWithLead) {
    const now = Date.now();
    const due = new Date(task.due_date).getTime();
    const delayMs = due - now;

    if (delayMs <= 0 || Number.isNaN(delayMs)) {
      console.log(
        `[Task Engine] Task ${task.id} is in the past. Ignoring timer.`,
        { delayMs, due_date: task.due_date }
      );
      return;
    }

    if (delayMs > MAX_SCHEDULE_MS) {
      console.log(`[Task Engine] Task ${task.id} is > 24h out. Skipping.`);
      return;
    }

    const id = task.id;
    if (activeTimers.current.has(id)) {
      console.log(`[Task Engine] Task ${id} already has a timer. Skipping duplicate.`);
      return;
    }

    const taskLabel = task.notes?.trim() || task.title || task.task_type || "Task";
    console.log(
      "[Task Engine] Timer SET for task:",
      taskLabel,
      "| Delay (ms):",
      delayMs,
      "| Fires in",
      Math.round(delayMs / 1000),
      "s"
    );

    const timeoutId = setTimeout(() => {
      activeTimers.current.delete(id);
      console.log("[Task Engine] RINGING! Triggering UI for:", taskLabel);

      try {
        const chime = new Audio("/sounds/chime.mp3");
        chime.volume = 0.4;
        chime.play().catch(() => {
          console.warn("[Task Engine] Audio blocked by browser policy, proceeding to UI popup.");
        });
      } catch {
        console.warn("[Task Engine] Audio failed, proceeding to UI popup.");
      }

      setActiveTask(task);
    }, delayMs);

    activeTimers.current.set(id, timeoutId);
  }

  function queueTask(task: TaskWithLead) {
    if (task.status !== "pending") return;
    const due = new Date(task.due_date).getTime();
    const now = Date.now();
    if (due <= now) return;
    scheduleTask(task);
  }

  function clearScheduledTask(taskId: string) {
    const timeoutId = activeTimers.current.get(taskId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimers.current.delete(taskId);
      console.log("[Task Engine] Cleared timer for task:", taskId);
    }
  }

  function dismissNotification() {
    setActiveTask(null);
  }

  function loadAndScheduleTasks() {
    getTasksForReminders()
      .then((tasks) => {
        if (!Array.isArray(tasks)) {
          console.warn("[Task Engine] getTasksForReminders returned non-array:", tasks);
          return;
        }
        activeTimers.current.forEach((id) => clearTimeout(id));
        activeTimers.current.clear();
        tasks.forEach((task) => scheduleTask(task));
      })
      .catch((err) => {
        console.warn("[Task Engine] Failed to fetch tasks:", err);
      });
  }

  useEffect(() => {
    console.log("[Task Engine] Initializing. Fetching pending tasks...");

    const supabase = createClient();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      setUserId(user.id);

      loadAndScheduleTasks();

      intervalId = setInterval(loadAndScheduleTasks, REFETCH_INTERVAL_MS);

      const channel = supabase
        .channel("custom-task-channel")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `assigned_to_users=cs.{${user.id}}`,
          },
          (payload) => {
            console.log("[Task Engine] Realtime Payload Received:", payload);

            const { eventType, new: newRow, old: oldRow } = payload;
            const newRecord = newRow as Record<string, unknown> | null;

            if (eventType === "INSERT" && newRecord) {
              const status = newRecord.status as string;
              const dueDateStr = newRecord.due_date as string;
              const due = new Date(dueDateStr).getTime();
              const now = Date.now();
              const delayMs = due - now;

              if (status === "pending" && delayMs > 0 && delayMs <= MAX_SCHEDULE_MS) {
                const task = { ...newRecord, lead: null } as TaskWithLead;
                queueTask(task);
              } else if (status !== "pending") {
                console.log("[Task Engine] Realtime: Ignored INSERT — status", status);
              } else if (delayMs <= 0) {
                console.log("[Task Engine] Realtime: Ignored INSERT — due_date in past");
              } else {
                console.log("[Task Engine] Realtime: Ignored INSERT — due_date > 24h");
              }
            }

            if (eventType === "UPDATE" && newRecord) {
              const taskId = (newRecord.id ?? (oldRow as Record<string, unknown>)?.id) as string;
              const newStatus = newRecord.status as string;

              if (TERMINAL_STATUSES.includes(newStatus)) {
                clearScheduledTask(taskId);
                console.log("[Task Engine] Realtime: Cleared timer for task", taskId, "— status", newStatus);
              } else if (newStatus === "pending") {
                const dueDateStr = newRecord.due_date as string;
                const due = new Date(dueDateStr).getTime();
                const now = Date.now();
                const delayMs = due - now;

                if (delayMs > 0 && delayMs <= MAX_SCHEDULE_MS) {
                  const task = { ...newRecord, lead: null } as TaskWithLead;
                  queueTask(task);
                } else {
                  clearScheduledTask(taskId);
                }
              }
            }
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            console.log("[Task Engine] Realtime: Subscribed to custom-task-channel");
          }
        });

      channelRef.current = channel;
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      activeTimers.current.forEach((id) => clearTimeout(id));
      activeTimers.current.clear();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      console.log("[Task Engine] Cleanup complete. All timers cleared.");
    };
  }, []);

  const notification = (
    <AnimatePresence>
      {activeTask && userId && (
        <TaskReminderNotification
          key={activeTask.id}
          task={activeTask}
          onDismiss={dismissNotification}
        />
      )}
    </AnimatePresence>
  );

  return (
    <TaskReminderContext.Provider value={{ queueTask }}>
      {children}
      {portalTarget && createPortal(notification, portalTarget)}
    </TaskReminderContext.Provider>
  );
}
