"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import { formatInTimeZone } from "date-fns-tz";
import { KanbanSquare, ListTodo, Search, Send, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import {
  CreatePersonalTaskSchema,
  taskPrioritySchema,
  uuidSchema,
} from "@/lib/schemas/tasks";
import { createPersonalTask, createSubTask, getMasterTaskDetail, searchProfilesForTasks } from "@/lib/actions/tasks";
import { getMasterWorkspacesForDashboard } from "@/lib/actions/task-intelligence";
import type { TaskInsightsWorkspaceCard, TaskPriority } from "@/lib/types/database";

const AssignTaskFormSchema = z
  .object({
    title: CreatePersonalTaskSchema.shape.title,
    description: CreatePersonalTaskSchema.shape.description,
    priority: taskPrioritySchema,
    assigned_to: z.string(),
  })
  .refine((data) => uuidSchema.safeParse(data.assigned_to).success, {
    message: "Select a team member",
    path: ["assigned_to"],
  });

type AssignTaskFormValues = z.infer<typeof AssignTaskFormSchema>;

type TaskKind = "personal" | "daily" | "workspace";

const TASK_KIND_OPTIONS: Array<{
  id: TaskKind;
  label: string;
  hint: string;
  icon: typeof UserRound;
}> = [
  {
    id: "personal",
    label: "My task",
    hint: "One-off personal",
    icon: UserRound,
  },
  {
    id: "daily",
    label: "Daily",
    hint: "Today’s row (IST)",
    icon: ListTodo,
  },
  {
    id: "workspace",
    label: "Workspace",
    hint: "Group / board subtask",
    icon: KanbanSquare,
  },
];

type ProfileHit = {
  id: string;
  full_name: string;
  role: string;
  job_title: string | null;
};

const PRIORITY_PILLS: Array<{
  value: TaskPriority;
  label: string;
  activeClass: string;
  dotClass: string;
}> = [
  {
    value: "urgent",
    label: "Critical",
    activeClass: "bg-[#C0392B] text-white border-[#C0392B]",
    dotClass: "bg-[#C0392B]",
  },
  {
    value: "high",
    label: "High",
    activeClass: "bg-[#E8824A] text-white border-[#E8824A]",
    dotClass: "bg-[#E8824A]",
  },
  {
    value: "medium",
    label: "Medium",
    activeClass: "bg-brand-gold text-[#1A1A1A] border-brand-gold",
    dotClass: "bg-brand-gold",
  },
  {
    value: "low",
    label: "Low",
    activeClass: "bg-[#B5A99A] text-white border-[#B5A99A]",
    dotClass: "bg-[#B5A99A]",
  },
];

function formatRoleLine(p: ProfileHit): string {
  const title = p.job_title?.trim();
  if (title) return title;
  return p.role
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

interface AssignTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export function AssignTaskModal({ open, onClose }: AssignTaskModalProps) {
  const router = useRouter();
  const [taskKind, setTaskKind] = useState<TaskKind>("personal");
  const [workspaces, setWorkspaces] = useState<TaskInsightsWorkspaceCard[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [taskGroups, setTaskGroups] = useState<{ id: string; title: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeHits, setAssigneeHits] = useState<ProfileHit[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearching, setAssigneeSearching] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<ProfileHit | null>(null);
  const assigneeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  const form = useForm<AssignTaskFormValues>({
    resolver: zodResolver(AssignTaskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      assigned_to: "",
    },
  });

  const resetAll = useCallback(() => {
    form.reset({ title: "", description: "", priority: "medium", assigned_to: "" });
    setTaskKind("personal");
    setSelectedMasterId("");
    setSelectedGroupId("");
    setTaskGroups([]);
    setDueDate(undefined);
    setAssigneeQuery("");
    setAssigneeHits([]);
    setAssigneeOpen(false);
    setSelectedAssignee(null);
  }, [form]);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [onClose, resetAll]);

  useEffect(() => {
    if (!open) return;
    resetAll();
  }, [open, resetAll]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWorkspacesLoading(true);
    void (async () => {
      const res = await getMasterWorkspacesForDashboard();
      if (cancelled) return;
      setWorkspacesLoading(false);
      setWorkspaces(res.success && res.data ? res.data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || taskKind !== "workspace" || !selectedMasterId) {
      setTaskGroups([]);
      setSelectedGroupId("");
      return;
    }
    let cancelled = false;
    setGroupsLoading(true);
    void (async () => {
      const res = await getMasterTaskDetail(selectedMasterId);
      if (cancelled) return;
      setGroupsLoading(false);
      if (!res.success || !res.data) {
        setTaskGroups([]);
        setSelectedGroupId("");
        return;
      }
      const list = res.data.taskGroups.map((g) => ({
        id: g.id as string,
        title: (g.title as string) || "Untitled column",
      }));
      setTaskGroups(list);
      setSelectedGroupId((prev) => (list.some((g) => g.id === prev) ? prev : (list[0]?.id ?? "")));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskKind, selectedMasterId]);

  useEffect(() => {
    if (!open || !assigneeOpen) return;
    const q = assigneeQuery.trim();
    if (q.length < 2) {
      setAssigneeHits([]);
      setAssigneeSearching(false);
      return;
    }
    if (assigneeDebounceRef.current) clearTimeout(assigneeDebounceRef.current);
    assigneeDebounceRef.current = setTimeout(() => {
      void (async () => {
        setAssigneeSearching(true);
        const rows = await searchProfilesForTasks(q);
        setAssigneeHits(rows as ProfileHit[]);
        setAssigneeSearching(false);
      })();
    }, 280);
    return () => {
      if (assigneeDebounceRef.current) clearTimeout(assigneeDebounceRef.current);
    };
  }, [assigneeOpen, assigneeQuery, open]);

  useEffect(() => {
    if (!open || !assigneeOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = pickerContainerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, assigneeOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (assigneeOpen) {
        e.stopPropagation();
        setAssigneeOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, assigneeOpen]);

  function pickAssignee(p: ProfileHit) {
    setSelectedAssignee(p);
    form.setValue("assigned_to", p.id, { shouldValidate: true });
    setAssigneeQuery("");
    setAssigneeHits([]);
    setAssigneeOpen(false);
  }

  function clearAssignee() {
    setSelectedAssignee(null);
    form.setValue("assigned_to", "");
    form.clearErrors("assigned_to");
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const name = selectedAssignee?.full_name?.trim() || "teammate";

    if (taskKind === "workspace") {
      if (!selectedMasterId || !uuidSchema.safeParse(selectedMasterId).success) {
        toast.error("Choose a workspace.");
        return;
      }
      if (!selectedGroupId || !uuidSchema.safeParse(selectedGroupId).success) {
        toast.error("Choose a column (task group).");
        return;
      }
      const result = await createSubTask({
        master_task_id: selectedMasterId,
        group_id: selectedGroupId,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        priority: values.priority,
        due_date: dueDate ? dueDate.toISOString() : undefined,
        assigned_to: values.assigned_to,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not create workspace task.");
        return;
      }
      toast.success(`Workspace task assigned to ${name}`);
      await router.refresh();
      handleClose();
      return;
    }

    const result = await createPersonalTask({
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      priority: values.priority,
      due_date: dueDate ? dueDate.toISOString() : undefined,
      assigned_to: values.assigned_to,
      is_daily: taskKind === "daily",
    });
    if (!result.success) {
      toast.error(result.error ?? "Could not assign task.");
      return;
    }
    if (taskKind === "daily") {
      toast.success(`Daily task assigned to ${name}`);
    } else {
      toast.success(`Task assigned to ${name}`);
    }
    await router.refresh();
    handleClose();
  });

  const priority = form.watch("priority");
  const titleRegister = form.register("title");
  const descRegister = form.register("description");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        className={cn(
          "max-w-lg gap-0 overflow-hidden border border-white/10 bg-[var(--surface-1)] p-0 shadow-2xl shadow-black/50",
          "text-white",
          "[&>button]:text-white/50 [&>button]:hover:bg-white/10 [&>button]:hover:text-white",
        )}
        onPointerDownOutside={() => setAssigneeOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="h-0.5 w-full bg-gradient-to-r from-brand-gold/80 via-brand-gold-light to-brand-gold/80" />

          <div className="px-6 pt-6 pb-2">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="font-serif text-xl font-semibold tracking-tight text-white">
                Assign Task
              </DialogTitle>
              <p className="text-[13px] font-normal leading-snug text-white/40">
                Choose task type, assignee, and details — personal, daily (IST), or a workspace subtask.
              </p>
            </DialogHeader>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-6 pb-6 pt-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Task type
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TASK_KIND_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = taskKind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setTaskKind(opt.id);
                        if (opt.id !== "workspace") {
                          setSelectedMasterId("");
                          setSelectedGroupId("");
                          setTaskGroups([]);
                        }
                      }}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-150",
                        active
                          ? "border-brand-gold/70 bg-brand-gold/12 text-white shadow-sm"
                          : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:text-white",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                        <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                        {opt.label}
                      </span>
                      <span className="text-[10px] leading-snug text-white/40">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {taskKind === "workspace" && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <IndulgeField label="Workspace" labelClassName="text-white/40">
                  <Select
                    value={selectedMasterId || "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setSelectedMasterId("");
                        return;
                      }
                      setSelectedMasterId(v);
                    }}
                    disabled={workspacesLoading || workspaces.length === 0}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-10 border-white/10 bg-white/5 text-sm text-white",
                        "focus:ring-brand-gold/25 focus:ring-2",
                      )}
                    >
                      <SelectValue placeholder={workspacesLoading ? "Loading…" : "Select workspace"} />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#1c1916] text-white">
                      <SelectItem
                        value="__none__"
                        className="text-white/50 focus:bg-white/10 focus:text-white"
                      >
                        Choose…
                      </SelectItem>
                      {workspaces.map((w) => (
                        <SelectItem
                          key={w.id}
                          value={w.id}
                          className="focus:bg-white/10 focus:text-white"
                        >
                          {w.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </IndulgeField>
                {!workspacesLoading && workspaces.length === 0 && (
                  <p className="text-[11px] text-amber-200/80">
                    No workspaces visible to your account. Create or join a master task first.
                  </p>
                )}
                <IndulgeField label="Column" labelClassName="text-white/40">
                  <Select
                    value={selectedGroupId || "__none__"}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setSelectedGroupId("");
                        return;
                      }
                      setSelectedGroupId(v);
                    }}
                    disabled={!selectedMasterId || groupsLoading || taskGroups.length === 0}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-10 border-white/10 bg-white/5 text-sm text-white",
                        "focus:ring-brand-gold/25 focus:ring-2",
                      )}
                    >
                      <SelectValue
                        placeholder={
                          !selectedMasterId
                            ? "Pick a workspace first"
                            : groupsLoading
                              ? "Loading columns…"
                              : "Select column"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#1c1916] text-white">
                      <SelectItem
                        value="__none__"
                        className="text-white/50 focus:bg-white/10 focus:text-white"
                      >
                        Choose…
                      </SelectItem>
                      {taskGroups.map((g) => (
                        <SelectItem
                          key={g.id}
                          value={g.id}
                          className="focus:bg-white/10 focus:text-white"
                        >
                          {g.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </IndulgeField>
              </div>
            )}

            <div className="relative space-y-2" ref={pickerContainerRef}>
              <IndulgeField
                label="Assign to"
                required
                htmlFor="assign-to-search"
                error={form.formState.errors.assigned_to?.message}
                labelClassName="text-white/40"
              >
                {selectedAssignee ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-2 text-sm text-white">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white/90">
                        {getInitials(selectedAssignee.full_name)}
                      </span>
                      <span className="max-w-[200px] truncate font-medium">
                        {selectedAssignee.full_name}
                      </span>
                      <button
                        type="button"
                        onClick={clearAssignee}
                        className="rounded-full p-0.5 text-white/45 hover:bg-white/10 hover:text-white"
                        aria-label="Remove assignee"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                    <Input
                      id="assign-to-search"
                      value={assigneeQuery}
                      onChange={(e) => {
                        setAssigneeQuery(e.target.value);
                        setAssigneeOpen(true);
                      }}
                      onFocus={() => assigneeHits.length > 0 && setAssigneeOpen(true)}
                      placeholder="Search by name…"
                      autoComplete="off"
                      className={cn(
                        "h-10 border-white/10 bg-white/5 pl-9 text-sm text-white placeholder:text-white/35",
                        "focus-visible:border-brand-gold/50 focus-visible:ring-brand-gold/25",
                      )}
                      aria-expanded={assigneeOpen}
                      aria-controls="assign-profile-results"
                      aria-autocomplete="list"
                    />
                    {assigneeSearching && (
                      <div className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-white/20 border-t-brand-gold" />
                    )}
                  </div>
                )}
              </IndulgeField>

              <AnimatePresence>
                {assigneeOpen && !selectedAssignee && assigneeHits.length > 0 && (
                  <motion.ul
                    id="assign-profile-results"
                    role="listbox"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-[60] mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1c1916] py-1 shadow-xl"
                  >
                    {assigneeHits.map((p) => (
                      <li key={p.id} role="option">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickAssignee(p)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/90">
                            {getInitials(p.full_name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{p.full_name}</p>
                            <p className="truncate text-[11px] text-white/40">{formatRoleLine(p)}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
              <p className="text-[10px] text-white/30">Type at least 2 characters to search.</p>
            </div>

            <IndulgeField
              label="Title"
              required
              htmlFor="assign-title"
              error={form.formState.errors.title?.message}
              labelClassName="text-white/40"
            >
              <Input
                id="assign-title"
                {...titleRegister}
                placeholder="What should they do?"
                className={cn(
                  "h-10 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35",
                  "focus-visible:border-brand-gold/50 focus-visible:ring-brand-gold/25",
                )}
                error={!!form.formState.errors.title}
              />
            </IndulgeField>

            <IndulgeField
              label="Description"
              htmlFor="assign-desc"
              error={form.formState.errors.description?.message}
              labelClassName="text-white/40"
              hint="Optional context or links."
            >
              <Textarea
                id="assign-desc"
                {...descRegister}
                placeholder="Add details…"
                rows={3}
                maxLength={2000}
                className="min-h-[88px] resize-none border-white/10 bg-white/5 text-sm text-white placeholder:text-white/35 focus-visible:border-brand-gold/50 focus-visible:ring-brand-gold/25"
              />
            </IndulgeField>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Priority
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITY_PILLS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => form.setValue("priority", p.value, { shouldValidate: true })}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-all duration-150",
                      priority === p.value
                        ? p.activeClass
                        : "border-white/10 bg-white/5 text-white/55 hover:border-white/20 hover:text-white/80",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        priority === p.value ? "bg-current opacity-80" : p.dotClass,
                      )}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Due (optional)
              </p>
              <LuxuryDatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="Pick date & time (preview in IST)"
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 text-left text-[13px] text-white/90 hover:border-brand-gold/40"
              />
              {dueDate && (
                <p className="mt-1.5 text-[11px] text-white/40">
                  {formatInTimeZone(dueDate, "Asia/Kolkata", "PPP p 'IST'")}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
              <IndulgeButton
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="border-white/15 bg-transparent text-white hover:bg-white/10"
              >
                Cancel
              </IndulgeButton>
              <IndulgeButton
                type="submit"
                variant="gold"
                size="sm"
                loading={form.formState.isSubmitting}
                leftIcon={<Send className="h-3.5 w-3.5" />}
              >
                Assign task
              </IndulgeButton>
            </div>
          </form>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
