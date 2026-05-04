"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ChevronDown, Loader2, X, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { createTask, getTeamMembersForAdmin } from "@/lib/actions/tasks";
import type { TeamMemberForPicker } from "@/lib/actions/tasks";

// ── Schema ──────────────────────────────────────────────────

const schema = z.object({
  subject: z.string().min(2, "Subject is required"),
  body: z.string().optional(),
  due_date: z.string().min(1, "Due date & time is required"),
  assigned_to_users: z.array(z.string().uuid()).min(1, "Please select at least one team member"),
});

type FormValues = z.infer<typeof schema>;

// ── Department order (default) ───────────────────────────────

const DEPARTMENT_ORDER = [
  "Marketing",
  "Shop",
  "Onboarding",
  "Concierge",
  "Tech",
  "Other",
];

const MARKETING_NAMES = ["Smruti", "Manaswini", "Prajith", "Pixel", "Danish"];
const ONBOARDING_NAMES = ["Samson", "Amit", "Meghna", "Kanika", "Kaniisha"];
const SHOP_NAMES = ["Vikram", "Harsh", "Katya", "Nikita"];

// ── Sub-components ──────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
      {children}
      {required && <span className="text-amber-600 ml-0.5">*</span>}
    </Label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[11px] text-rose-600 mt-1"
    >
      {message}
    </motion.p>
  );
}

// ── Multi-assignee Picker (context-aware, keyboard accessible) ────────────────────

interface MultiAssigneePickerProps {
  value: string[];
  members: TeamMemberForPicker[];
  onChange: (ids: string[]) => void;
  defaultDepartment?: string;
  error?: string;
  disabled?: boolean;
}

function MultiAssigneePicker({
  value,
  members,
  onChange,
  defaultDepartment = "",
  error,
  disabled,
}: MultiAssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => members.filter((m) => value.includes(m.id)),
    [members, value],
  );

  const sortedMembers = useMemo(() => {
    if (defaultDepartment === "marketing") {
      const dept = members.filter((m) => {
        const first = m.full_name?.split(" ")[0] ?? "";
        return MARKETING_NAMES.includes(first) || m.department === "Marketing";
      });
      const rest = members.filter((m) => !dept.includes(m));
      return [...dept, ...rest];
    }
    if (defaultDepartment === "onboarding") {
      const dept = members.filter((m) => {
        const first = m.full_name?.split(" ")[0] ?? "";
        return ONBOARDING_NAMES.includes(first) || m.department === "Onboarding";
      });
      const rest = members.filter((m) => !dept.includes(m));
      return [...dept, ...rest];
    }
    if (defaultDepartment === "shop") {
      const dept = members.filter((m) => {
        const first = m.full_name?.split(" ")[0] ?? "";
        return SHOP_NAMES.includes(first) || m.department === "Shop";
      });
      const rest = members.filter((m) => !dept.includes(m));
      return [...dept, ...rest];
    }
    return members;
  }, [members, defaultDepartment]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedMembers;
    const q = search.toLowerCase();
    return sortedMembers.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.department ?? "").toLowerCase().includes(q),
    );
  }, [sortedMembers, search]);

  const byDept = useMemo(() => {
    const map = new Map<string, TeamMemberForPicker[]>();
    for (const m of filtered) {
      const dept = m.department || "Other";
      const arr = map.get(dept) ?? [];
      arr.push(m);
      map.set(dept, arr);
    }
    return map;
  }, [filtered]);

  const flatOptions = useMemo(() => {
    const out: TeamMemberForPicker[] = [];
    for (const dept of DEPARTMENT_ORDER) {
      const arr = byDept.get(dept) ?? [];
      out.push(...arr);
    }
    return out;
  }, [byDept]);

  const toggleMember = useCallback(
    (m: TeamMemberForPicker) => {
      if (value.includes(m.id)) {
        onChange(value.filter((id) => id !== m.id));
      } else {
        onChange([...value, m.id]);
      }
    },
    [value, onChange],
  );

  const removeLast = useCallback(() => {
    if (value.length > 0) onChange(value.slice(0, -1));
  }, [value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Backspace" && value.length > 0) {
          e.preventDefault();
          removeLast();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, flatOptions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatOptions[highlightedIndex]) {
        e.preventDefault();
        toggleMember(flatOptions[highlightedIndex]);
      } else if (e.key === "Backspace" && value.length > 0 && !search) {
        e.preventDefault();
        removeLast();
      }
    },
    [open, flatOptions, highlightedIndex, value, search, removeLast, toggleMember],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, filtered]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex flex-wrap items-center gap-2 min-h-11 w-full px-3 py-2 rounded-xl border transition-colors text-left",
            "border-stone-200 bg-white/80 hover:bg-stone-50/80",
            "focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/40",
            error && "border-rose-300 focus:ring-rose-500/30",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          {selected.length > 0 ? (
            <>
              {selected.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-stone-100 text-stone-700 ring-1 ring-stone-200/50 text-xs font-medium"
                >
                  {m.full_name.split(" ")[0]}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(value.filter((id) => id !== m.id));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(value.filter((id) => id !== m.id));
                      }
                    }}
                    className="p-0.5 rounded-full hover:bg-stone-200/80 transition-colors cursor-pointer"
                    aria-label={`Remove ${m.full_name}`}
                  >
                    <X className="w-4 h-4" />
                  </span>
                </span>
              ))}
            </>
          ) : (
            <span className="flex items-center gap-2 text-stone-500">
              <User className="w-4 h-4 shrink-0" />
              <span className="text-sm">Search team member…</span>
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-stone-400 shrink-0 ml-auto transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={() => inputRef.current?.focus()}
          className="z-[200] w-[var(--radix-popover-trigger-width)] max-w-sm p-0 outline-none rounded-xl border border-stone-200 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
        >
          <div className="p-2 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search team member…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-stone-200 bg-stone-50/80 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/40"
              />
            </div>
          </div>

          <ScrollArea className="h-[240px]">
            <div className="p-2 space-y-3">
              {DEPARTMENT_ORDER.map((dept) => {
                const deptMembers = byDept.get(dept) ?? [];
                if (deptMembers.length === 0) return null;
                return (
                  <div key={dept}>
                    <p className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-widest">
                      {dept}
                    </p>
                    <div className="space-y-0.5">
                      {deptMembers.map((m) => {
                        const idx = flatOptions.findIndex((o) => o.id === m.id);
                        const isHighlighted = idx === highlightedIndex;
                        const isSelected = value.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            ref={(el) => {
                              if (isHighlighted && el) {
                                el?.scrollIntoView({ block: "nearest" });
                              }
                            }}
                            onClick={() => toggleMember(m)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors",
                              "hover:bg-amber-50/80",
                              isSelected && "bg-amber-50/80 border border-amber-200/50",
                              isHighlighted && "bg-amber-50/60",
                            )}
                          >
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="bg-stone-100 text-stone-600 text-xs font-medium">
                                {m.full_name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-stone-700">
                              {m.full_name}
                            </span>
                            {isSelected && (
                              <span className="ml-auto text-[10px] text-amber-600 font-semibold">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-stone-500">
              No team members match your search
            </p>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ── Main component ──────────────────────────────────────────

interface AdminCreateTaskModalProps {
  defaultDate?: Date;
  defaultDepartment?: string;
  onSuccess?: () => void;
  /** Custom trigger element; when provided, replaces the default "Delegate Task" button */
  trigger?: React.ReactNode;
}

export function AdminCreateTaskModal({
  defaultDate,
  defaultDepartment,
  onSuccess,
  trigger,
}: AdminCreateTaskModalProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberForPicker[]>([]);

  const defaultDueAt = (() => {
    const d = defaultDate ? new Date(defaultDate) : new Date();
    if (!defaultDate) {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
    return d.toISOString().slice(0, 16);
  })();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      subject: "",
      body: "",
      due_date: defaultDueAt,
      assigned_to_users: [],
    },
  });

  useEffect(() => {
    if (open) {
      getTeamMembersForAdmin().then((res) =>
        setMembers(res.success && res.data ? res.data : []),
      );
    }
  }, [open]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await createTask({
        leadId: null,
        title: values.subject,
        dueAt: new Date(values.due_date),
        type: "general_follow_up",
        notes: values.body?.trim() || null,
        assignedToUsers: values.assigned_to_users,
      });
      if (!result.success) {
        setServerError(result.error ?? "Failed to create task");
      } else {
        reset();
        setOpen(false);
        onSuccess?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    setServerError(null);
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        {trigger ?? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          >
            Delegate Task
          </motion.button>
        )}
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md" />
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-2xl rounded-2xl p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <DialogTitle
                  className="text-stone-800 text-lg font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Delegate Task
                </DialogTitle>
                <DialogDescription className="text-stone-500 text-xs mt-0.5">
                  Assign to one or more team members across departments
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Subject */}
              <div className="space-y-1.5">
                <FieldLabel required>Subject</FieldLabel>
                <Input
                  {...register("subject")}
                  placeholder="Task subject"
                  className="h-10 text-sm bg-stone-50/50 border-stone-200 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500/30"
                />
                <FieldError message={errors.subject?.message} />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <FieldLabel>Body</FieldLabel>
                <textarea
                  {...register("body")}
                  placeholder="Add context, instructions, or notes…"
                  rows={3}
                  className={cn(
                    "w-full px-3 py-2.5 text-sm rounded-xl border border-stone-200 bg-stone-50/50 resize-none",
                    "text-stone-700 placeholder:text-stone-400",
                    "focus:outline-none focus:ring-1 focus:ring-amber-500/30",
                  )}
                />
              </div>

              {/* Assignees */}
              <div className="space-y-1.5">
                <FieldLabel required>Assign to</FieldLabel>
                <Controller
                  name="assigned_to_users"
                  control={control}
                  render={({ field }) => (
                    <MultiAssigneePicker
                      value={field.value}
                      members={members}
                      onChange={field.onChange}
                      defaultDepartment={defaultDepartment}
                      error={errors.assigned_to_users?.message}
                    />
                  )}
                />
                <FieldError message={errors.assigned_to_users?.message} />
              </div>

              {/* Due date */}
              <div className="space-y-1.5">
                <FieldLabel required>Due Date & Time</FieldLabel>
                <Controller
                  name="due_date"
                  control={control}
                  render={({ field }) => (
                    <LuxuryDatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : "")
                      }
                      placeholder="Pick date & time…"
                      disabled={(d) =>
                        d < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                    />
                  )}
                />
                <FieldError message={errors.due_date?.message} />
              </div>

              {/* Server error */}
              <AnimatePresence>
                {serverError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg"
                  >
                    {serverError}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Footer */}
              <div className="flex gap-3 pt-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-stone-200 text-stone-600 hover:bg-stone-50 text-sm"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-stone-800 text-white hover:bg-stone-900 text-sm font-medium"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    "Create Task"
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
