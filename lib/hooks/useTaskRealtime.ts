"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TaskComment, ProjectProgressUpdate, ProjectTask, TaskRemark, AtlasTaskStatus } from "@/lib/types/database";

// ── Types ──────────────────────────────────────────────────────────────────

interface UseTaskRealtimeOptions {
  taskId: string | null;
  initialComments?: TaskComment[];
  initialProgressUpdates?: ProjectProgressUpdate[];
  initialTask?: ProjectTask | null;
}

interface UseTaskRealtimeReturn {
  comments: TaskComment[];
  progressUpdates: ProjectProgressUpdate[];
  task: ProjectTask | null;
  // Exposed so the parent can seed state after an async DB fetch
  setComments: Dispatch<SetStateAction<TaskComment[]>>;
  setProgressUpdates: Dispatch<SetStateAction<ProjectProgressUpdate[]>>;
  setTask: Dispatch<SetStateAction<ProjectTask | null>>;
}

// Raw DB row shapes (before profile enrichment)
type RawComment = Omit<TaskComment, "author"> & { author: unknown };
type RawProgressUpdate = Omit<ProjectProgressUpdate, "updater"> & {
  updater: unknown;
};

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTaskRealtime({
  taskId,
  initialComments = [],
  initialProgressUpdates = [],
  initialTask = null,
}: UseTaskRealtimeOptions): UseTaskRealtimeReturn {
  const [comments, setComments] = useState<TaskComment[]>(initialComments);
  const [progressUpdates, setProgressUpdates] = useState<ProjectProgressUpdate[]>(
    initialProgressUpdates,
  );
  const [task, setTask] = useState<ProjectTask | null>(initialTask);

  const supabase = useMemo(() => createClient(), []);

  // Reset state when the task being viewed changes.
  // We deliberately depend only on taskId — not on the array/object props —
  // because those create new references every render and would cause an
  // infinite setState loop. When taskId changes we seed from the latest
  // initial* values captured in the closure at that moment.
  useEffect(() => {
    setComments(initialComments);
    setProgressUpdates(initialProgressUpdates);
    setTask(initialTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Subscribe: task_comments INSERT ──────────────────────────────────────
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_comments:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const raw = payload.new as RawComment;
          setComments((prev) => {
            if (prev.some((c) => c.id === raw.id)) return prev;
            // Add without author enrichment; RSC re-render will provide full data
            return [...prev, raw as unknown as TaskComment];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Subscribe: task_comments UPDATE (edit) ────────────────────────────────
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_comments_update:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as RawComment;
          setComments((prev) =>
            prev.map((c) =>
              c.id === updated.id
                ? { ...c, content: updated.content as string, edited_at: updated.edited_at as string | null }
                : c,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Subscribe: task_comments DELETE ──────────────────────────────────────
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_comments_delete:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { old: Record<string, unknown> }) => {
          const deleted = payload.old as { id: string };
          setComments((prev) => prev.filter((c) => c.id !== deleted.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Subscribe: task_progress_updates INSERT ───────────────────────────────
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_progress:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_progress_updates",
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const raw = payload.new as RawProgressUpdate;
          setProgressUpdates((prev) => {
            if (prev.some((p) => p.id === raw.id)) return prev;
            return [...prev, raw as unknown as ProjectProgressUpdate];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Subscribe: tasks UPDATE (status + progress from other users) ──────────
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`task_update:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new;
          setTask((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: (updated.status as ProjectTask["status"]) ?? prev.status,
              progress: (updated.progress as number) ?? prev.progress,
              title: (updated.title as string) ?? prev.title,
              notes: (updated.notes as string | null) ?? prev.notes,
              priority: (updated.priority as ProjectTask["priority"]) ?? prev.priority,
              due_date: (updated.due_date as string | null) ?? prev.due_date,
              assigned_to_users:
                (updated.assigned_to_users as string[]) ?? prev.assigned_to_users,
            };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return { comments, progressUpdates, task, setComments, setProgressUpdates, setTask };
}

// ─────────────────────────────────────────────────────────────────────────────
// Atlas Task Realtime — board-level and subtask-level subscriptions
// ─────────────────────────────────────────────────────────────────────────────

interface UseAtlasTaskRealtimeOptions {
  masterTaskId: string | null;
  subtaskId?: string | null;
  onSubtaskChanged?: (updatedId: string) => void;
  onRemarkAdded?: (remark: TaskRemark) => void;
}

interface UseAtlasTaskRealtimeReturn {
  remarks: TaskRemark[];
  setRemarks: Dispatch<SetStateAction<TaskRemark[]>>;
  boardVersion: number;
}

type RawRemark = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  source?: TaskRemark["source"];
  previous_status?: AtlasTaskStatus | null;
  state_at_time: AtlasTaskStatus;
  progress_at_time: number | null;
  created_at: string;
};

/**
 * Subscribes to:
 *   1. task_remarks INSERT on a specific subtask
 *   2. tasks UPDATE on all subtasks of the master task (board-level)
 *
 * Increments boardVersion on structural changes so consumers can trigger
 * a targeted re-fetch without a full router.refresh().
 */
export function useAtlasTaskRealtime({
  masterTaskId,
  subtaskId,
  onSubtaskChanged,
  onRemarkAdded,
}: UseAtlasTaskRealtimeOptions): UseAtlasTaskRealtimeReturn {
  const [remarks, setRemarks] = useState<TaskRemark[]>([]);
  const [boardVersion, setBoardVersion] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const bumpBoard = useCallback(() => setBoardVersion((v) => v + 1), []);

  // ── Subscribe: task_remarks INSERT on a subtask ──────────────────────────
  useEffect(() => {
    if (!subtaskId) return;

    const channel = supabase
      .channel(`tasks:subtask:${subtaskId}:remarks`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "task_remarks",
          filter: `task_id=eq.${subtaskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const raw = payload.new as RawRemark;
          const row = raw as unknown as TaskRemark;
          setRemarks((prev) => {
            if (prev.some((r) => r.id === raw.id)) return prev;
            return [row, ...prev];
          });
          onRemarkAdded?.(row);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtaskId]);

  // ── Subscribe: tasks UPDATE on subtasks of the master task ───────────────
  useEffect(() => {
    if (!masterTaskId) return;

    const channel = supabase
      .channel(`tasks:master:${masterTaskId}:board`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "tasks",
          filter: `project_id=eq.${masterTaskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updatedId = payload.new.id as string;
          onSubtaskChanged?.(updatedId);
          bumpBoard();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTaskId]);

  // ── New subtasks (INSERT) under this master ─────────────────────────────
  useEffect(() => {
    if (!masterTaskId) return;

    const channel = supabase
      .channel(`tasks:master:${masterTaskId}:inserts`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "tasks",
          filter: `project_id=eq.${masterTaskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { id?: string; unified_task_type?: string };
          if (row.unified_task_type !== "subtask") return;
          onSubtaskChanged?.(row.id ?? "");
          bumpBoard();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTaskId]);

  // ── Task group structure (rename, reorder, add/delete columns) ─────────
  useEffect(() => {
    if (!masterTaskId) return;

    const channel = supabase
      .channel(`task_groups:master:${masterTaskId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "task_groups",
          filter: `project_id=eq.${masterTaskId}`,
        },
        () => {
          onSubtaskChanged?.("");
          bumpBoard();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTaskId]);

  return { remarks, setRemarks, boardVersion };
}

// ─────────────────────────────────────────────────────────────────────────────
/** Master tasks index: refresh when any listed workspace receives subtask changes. */
// ─────────────────────────────────────────────────────────────────────────────

export function useMasterTasksIndexRealtime(masterTaskIds: string[]) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const key = masterTaskIds.slice().sort().join(",");

  useEffect(() => {
    if (masterTaskIds.length === 0) return;

    const channels = masterTaskIds.map((id) =>
      supabase
        .channel(`tasks:index:${id}`)
        .on(
          "postgres_changes",
          {
            event:  "*",
            schema: "public",
            table:  "tasks",
            filter: `project_id=eq.${id}`,
          },
          () => {
            router.refresh();
          },
        )
        .subscribe(),
    );

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router, supabase]);
}

/**
 * Task Intelligence modal: bump when any listed master workspace’s board or
 * columns change (mirrors useAtlasTaskRealtime board + task_groups coverage).
 */
export function useMasterBoardsRealtime(masterTaskIds: string[], onBump: () => void) {
  const supabase = useMemo(() => createClient(), []);
  const bumpRef = useRef(onBump);
  bumpRef.current = onBump;
  const key = masterTaskIds.slice().sort().join(",");

  useEffect(() => {
    if (masterTaskIds.length === 0) return;

    const taskChannels = masterTaskIds.map((id) =>
      supabase
        .channel(`tasks:intelligence-board:${id}`)
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "tasks",
            filter: `project_id=eq.${id}`,
          },
          () => {
            bumpRef.current();
          },
        )
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "tasks",
            filter: `project_id=eq.${id}`,
          },
          () => {
            bumpRef.current();
          },
        )
        .subscribe(),
    );

    const groupChannels = masterTaskIds.map((id) =>
      supabase
        .channel(`tasks:intelligence-groups:${id}`)
        .on(
          "postgres_changes",
          {
            event:  "*",
            schema: "public",
            table:  "task_groups",
            filter: `project_id=eq.${id}`,
          },
          () => {
            bumpRef.current();
          },
        )
        .subscribe(),
    );

    return () => {
      for (const ch of taskChannels) supabase.removeChannel(ch);
      for (const ch of groupChannels) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, supabase]);
}

// ─────────────────────────────────────────────────────────────────────────────
/** Open subtask modal / sheet: timeline + row fields from other sessions. */
// ─────────────────────────────────────────────────────────────────────────────

export function useSubtaskRealtime(
  subtaskId: string | null,
  options: {
    onRemarkInserted?: (row: TaskRemark) => void;
    onTaskUpdated?: (row: Record<string, unknown>) => void;
  },
) {
  const supabase = useMemo(() => createClient(), []);
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!subtaskId) return;

    const ch1 = supabase
      .channel(`subtask:remarks:${subtaskId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "task_remarks",
          filter: `task_id=eq.${subtaskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          optsRef.current.onRemarkInserted?.(payload.new as unknown as TaskRemark);
        },
      )
      .subscribe();

    const ch2 = supabase
      .channel(`subtask:row:${subtaskId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "tasks",
          filter: `id=eq.${subtaskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          optsRef.current.onTaskUpdated?.(payload.new);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [subtaskId, supabase]);
}
