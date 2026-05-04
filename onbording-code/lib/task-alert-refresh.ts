/** Fired so TaskAlertProvider can adjust overdue banner count without hammering Supabase. */
export const TASK_ALERT_REFRESH_EVENT = "indulge:task-alert-refresh";

export type TaskAlertRefreshDetail =
  | { action: "decrement" }
  | { action: "increment" }
  | { action: "fetch" };

export function dispatchTaskAlertRefresh(detail: TaskAlertRefreshDetail = { action: "fetch" }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TASK_ALERT_REFRESH_EVENT, { detail }));
  }
}

/** Matches `getMyOverdueTaskCount`: pending and due strictly before now. */
export function isTaskCountedOverdue(task: { status: string; due_date: string }): boolean {
  return task.status === "pending" && new Date(task.due_date).getTime() < Date.now();
}

/** After complete/delete: bump count down without a query when this row was in the overdue set. */
export function dispatchTaskAlertAfterCompleteOrDelete(task: { status: string; due_date: string }) {
  dispatchTaskAlertRefresh(
    isTaskCountedOverdue(task) ? { action: "decrement" } : { action: "fetch" },
  );
}
