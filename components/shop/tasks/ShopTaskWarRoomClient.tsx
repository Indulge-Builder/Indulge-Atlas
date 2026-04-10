"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { surfaceCardVariants } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { TaskActionBar } from "@/components/shop/tasks/TaskActionBar";
import type { TaskProgressUpdate, TaskWithLead } from "@/lib/types/database";
import type { ShopMasterTargetPriority } from "@/lib/types/database";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function priorityLabel(p: ShopMasterTargetPriority) {
  if (p === "super_high") return "Super High";
  if (p === "high") return "High";
  return "Normal";
}

/** Radial progress using circumference = 2πr and stroke-dasharray. */
function SalesRadialRing({
  sold,
  target,
  size = 80,
  stroke = 6,
}: {
  sold: number;
  target: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = target > 0 ? Math.min(1, Math.max(0, sold / target)) : 0;
  const dash = frac * c;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-stone-100"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-emerald-500 transition-[stroke-dasharray] duration-500 ease-out"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-medium tabular-nums text-stone-800">
          {target > 0 ? `${sold}/${target}` : "—"}
        </span>
      </div>
    </div>
  );
}

export function ShopTaskWarRoomClient({
  initialTask,
}: {
  initialTask: TaskWithLead;
}) {
  const [task, setTask] = useState(initialTask);

  useEffect(() => {
    setTask(initialTask);
  }, [initialTask]);

  const deadlineIso = task.deadline ?? task.due_date;
  const deadline = useMemo(() => new Date(deadlineIso), [deadlineIso]);
  const taskTitle =
    task.shop_product_name?.trim() || task.title || "Untitled operation";
  const description =
    task.notes?.trim() ||
    "No briefing notes yet — add context when creating the task.";

  const updates = (task.progress_updates ?? []) as TaskProgressUpdate[];
  const sorted = [...updates].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const target = task.target_inventory ?? null;
  const sold = task.target_sold ?? 0;

  const daysLeft = useMemo(
    () => differenceInDays(deadline, new Date()),
    [deadline],
  );
  const urgent = daysLeft >= 0 && daysLeft < 3;
  const overdue = daysLeft < 0;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shop-task-${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${task.id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const n = payload.new;
          setTask((prev) => ({
            ...prev,
            progress_updates:
              (n.progress_updates as TaskProgressUpdate[]) ??
              prev.progress_updates,
            target_sold: (n.target_sold as number) ?? prev.target_sold,
            due_date: (n.due_date as string) ?? prev.due_date,
            deadline: (n.deadline as string | null) ?? prev.deadline,
            status: (n.status as TaskWithLead["status"]) ?? prev.status,
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [task.id]);

  const dueLabel = format(deadline, "MMM d, yyyy");
  const dueShort = format(deadline, "'Due' MMM d");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-6">
      <Link
        href="/shop/workspace"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Shop workspace
      </Link>

      {/* Phase 2–3: Top dashboard — fixed height block, does not grow */}
      <div
        className={cn(
          surfaceCardVariants({
            tone: "luxury",
            elevation: "sm",
            overflow: "visible",
          }),
          "shrink-0 p-6 md:p-8",
        )}
      >
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: name, description, team */}
          <div className="min-w-0 flex-1 space-y-4">
            <h1
              className="text-2xl font-semibold tracking-tight text-stone-900"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {taskTitle}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-stone-500">
              {description}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200/60">
                {priorityLabel(task.shop_task_priority ?? "normal")}
              </span>
              {(task.assigned_to_profiles ?? []).map((p) => (
                <span
                  key={p.id}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200/80"
                >
                  {p.full_name}
                </span>
              ))}
            </div>
            <div className="flex -space-x-2 pt-1">
              {(task.assigned_to_profiles ?? []).map((p) => (
                <Avatar
                  key={p.id}
                  className="h-10 w-10 border-2 border-white ring-1 ring-stone-200"
                  title={p.full_name}
                >
                  <AvatarFallback className="text-[10px] bg-stone-100 text-stone-700">
                    {initials(p.full_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>

          {/* Right: countdown + ring */}
          <div className="flex shrink-0 flex-col items-stretch gap-8 border-t border-stone-100 pt-8 sm:flex-row sm:items-center sm:justify-end sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <div className="flex flex-col items-end text-right">
              <span
                className={cn(
                  "text-5xl font-light tabular-nums tracking-tight",
                  overdue && "text-rose-500",
                  urgent && !overdue && "text-amber-600",
                  !urgent && !overdue && "text-stone-800",
                )}
              >
                {overdue ? Math.abs(daysLeft) : Math.max(0, daysLeft)}
              </span>
              <span className="mt-1 text-xs font-medium uppercase tracking-widest text-stone-500">
                {overdue ? "Days overdue" : "Days left"}
              </span>
              <span className="mt-2 text-sm text-stone-600">{dueShort}</span>
              <time className="text-xs text-stone-400" dateTime={deadlineIso}>
                {dueLabel}
              </time>
            </div>

            <div className="flex flex-col items-center gap-2">
              {target != null && target > 0 ? (
                <SalesRadialRing
                  sold={sold}
                  target={target}
                  size={80}
                  stroke={6}
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-400">
                  No target
                </div>
              )}
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Progress
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 4: Activity — scrolls inside this region only */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <h2
            className="text-sm font-semibold text-stone-900"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Activity
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Timeline — updates from everyone on this task
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-4">
          <div className="space-y-3 pb-2">
            {sorted.length === 0 ? (
              <p className="text-sm text-stone-500">No updates yet.</p>
            ) : (
              sorted.map((u, i) => (
                <article
                  key={`${u.timestamp}-${i}`}
                  className={cn(
                    surfaceCardVariants({ tone: "subtle", elevation: "xs" }),
                    "p-4",
                  )}
                >
                  <p className="text-sm leading-relaxed text-stone-800">
                    {u.message}
                  </p>
                  <p className="mt-2 text-[11px] text-stone-500">
                    {u.user_name} ·{" "}
                    {format(new Date(u.timestamp), "MMM d, HH:mm")}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <TaskActionBar taskId={task.id} productLabel={taskTitle} />
      </div>
    </div>
  );
}
