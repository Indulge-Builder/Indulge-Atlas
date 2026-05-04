"use client";

import { useState, useTransition, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, Search, Check, Building2, Globe } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
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
import { InfoRow } from "@/components/ui/info-row";
import { useProfile } from "@/components/sla/ProfileProvider";
import {
  DEPARTMENT_CONFIG,
  DOMAIN_CONFIG,
  departmentsVisibleForDomain,
} from "@/lib/constants/departments";
import { isPrivilegedRole } from "@/lib/types/database";
import type { EmployeeDepartment, IndulgeDomain } from "@/lib/types/database";
import {
  createMasterTask,
  updateMasterTask,
  addMasterTaskMember,
  searchProfilesForTasks,
} from "@/lib/actions/tasks";
import { CreateMasterTaskSchema, type CreateMasterTaskFormValues, type CreateMasterTaskInput } from "@/lib/schemas/tasks";
import type { MasterTask } from "@/lib/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#D4AF37", "#4F46E5", "#10B981", "#F97316",
  "#8B5CF6", "#EF4444", "#0D9488", "#EC4899",
  "#6366F1", "#1A1814",
];

const PRESET_ICONS = [
  "Briefcase", "Rocket", "Target", "Code2",
  "ShoppingBag", "Users", "BarChart3", "Globe",
  "Sparkles", "Trophy", "Zap", "Star",
  "Layers", "Compass", "Flag", "Heart",
  "Building2", "Gem", "Lightbulb", "Leaf",
];

const DOMAIN_OPTIONS = (Object.keys(DOMAIN_CONFIG) as IndulgeDomain[]).sort((a, b) =>
  DOMAIN_CONFIG[a].label.localeCompare(DOMAIN_CONFIG[b].label),
);

const ALL_DEPARTMENT_IDS = (Object.keys(DEPARTMENT_CONFIG) as EmployeeDepartment[]).sort((a, b) =>
  DEPARTMENT_CONFIG[a].label.localeCompare(DEPARTMENT_CONFIG[b].label),
);

type ProfileResult = { id: string; full_name: string; role: string; job_title: string | null };

function parseOptionalIso(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ── Mini preview card ─────────────────────────────────────────────────────────

interface PreviewCardProps {
  title:      string;
  color:      string;
  iconKey:    string;
}

function PreviewCard({ title, color, iconKey }: PreviewCardProps) {
  const icons = LucideIcons as unknown as Record<string, ComponentType<{ className?: string; style?: React.CSSProperties }>>;
  const Icon  = iconKey ? icons[iconKey] : null;

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm overflow-hidden"
      aria-hidden
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: color }}
      />

      {/* Icon badge */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ml-1"
        style={{ backgroundColor: `${color}20` }}
      >
        {Icon ? (
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        ) : (
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm font-semibold text-zinc-900 truncate leading-tight">
          {title || "Task title preview"}
        </p>
        <p className="text-[10px] text-zinc-400 mt-0.5">Master Task</p>
      </div>

      {/* Progress ring placeholder */}
      <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0">
        <circle cx="14" cy="14" r="11" fill="none" stroke="#f4f4f5" strokeWidth="3" />
        <circle
          cx="14" cy="14" r="11"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${2 * Math.PI * 11 * 0.15} ${2 * Math.PI * 11}`}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
        <text x="14" y="18" textAnchor="middle" fontSize="7" fill={color} fontWeight="600">
          0%
        </text>
      </svg>
    </div>
  );
}

// ── Icon picker grid ──────────────────────────────────────────────────────────

interface IconPickerProps {
  selected:  string;
  color:     string;
  onChange:  (icon: string) => void;
}

function IconPicker({ selected, color, onChange }: IconPickerProps) {
  const icons = LucideIcons as unknown as Record<string, ComponentType<{ className?: string; style?: React.CSSProperties }>>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* None option */}
      <button
        type="button"
        onClick={() => onChange("")}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] font-medium transition-all",
          selected === ""
            ? "border-zinc-800 bg-zinc-800 text-white"
            : "border-zinc-200 text-zinc-400 hover:border-zinc-300",
        )}
        aria-pressed={selected === ""}
        aria-label="No icon"
      >
        —
      </button>

      {PRESET_ICONS.map((name) => {
        const Icon  = icons[name];
        const isSelected = selected === name;
        if (!Icon) return null;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
              isSelected
                ? "border-transparent scale-110 shadow-sm"
                : "border-zinc-200 hover:border-zinc-300 hover:scale-105",
            )}
            style={isSelected ? { backgroundColor: `${color}20`, borderColor: color } : undefined}
            aria-pressed={isSelected}
            aria-label={name}
          >
            <Icon
              className="h-4 w-4"
              style={{ color: isSelected ? color : "#71717a" }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── People picker ─────────────────────────────────────────────────────────────

interface PeoplePickerProps {
  selected:  ProfileResult[];
  onChange:  (profiles: ProfileResult[]) => void;
}

function PeoplePicker({ selected, onChange }: PeoplePickerProps) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]         = useState(false);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const data = await searchProfilesForTasks(q);
      setResults(data.filter((p) => !selected.some((s) => s.id === p.id)));
      setOpen(true);
      setSearching(false);
    }, 300);
  }, [selected]);

  function addPerson(p: ProfileResult) {
    onChange([...selected, p]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function removePerson(id: string) {
    onChange(selected.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 pl-1 pr-2 py-0.5 text-xs font-medium text-zinc-700"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-600">
                {getInitials(p.full_name)}
              </span>
              {p.full_name}
              <button
                type="button"
                onClick={() => removePerson(p.id)}
                className="ml-0.5 text-zinc-400 hover:text-zinc-700"
                aria-label={`Remove ${p.full_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search team members…"
          className="pl-8 h-8 text-sm"
          aria-label="Search members to add"
        />
        {searching && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin rounded-full border border-zinc-300 border-t-[#D4AF37]" />
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => addPerson(p)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-600">
                {getInitials(p.full_name)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{p.full_name}</p>
                {p.job_title && (
                  <p className="text-[10px] text-zinc-400 truncate">{p.job_title}</p>
                )}
              </div>
              <Check className="ml-auto h-3.5 w-3.5 text-emerald-500 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface CreateMasterTaskModalProps {
  open:      boolean;
  onClose:   () => void;
  editTask?: MasterTask | null;
}

export function CreateMasterTaskModal({
  open,
  onClose,
  editTask,
}: CreateMasterTaskModalProps) {
  const router = useRouter();
  const profile = useProfile();
  const [isPending, startTransition]  = useTransition();
  const [selectedColor, setSelectedColor] = useState(editTask?.cover_color ?? "#D4AF37");
  const [selectedIcon,  setSelectedIcon]  = useState(editTask?.icon_key   ?? "");
  const [members, setMembers]             = useState<ProfileResult[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    control,
  } = useForm<CreateMasterTaskFormValues>({
    resolver: zodResolver(CreateMasterTaskSchema),
    defaultValues: {
      title:       "",
      description: "",
      department:  "concierge",
      domain:      "indulge_concierge",
      due_date:    undefined,
    },
  });

  const managerDepartmentIds = useMemo(() => {
    if (!profile || profile.role !== "manager") return ALL_DEPARTMENT_IDS;
    return [...departmentsVisibleForDomain(profile.domain)].sort((a, b) =>
      DEPARTMENT_CONFIG[a].label.localeCompare(DEPARTMENT_CONFIG[b].label),
    );
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    const dept = (editTask?.department ??
      profile?.department ??
      "concierge") as EmployeeDepartment;
    const dom = (editTask?.domain ?? profile?.domain ?? "indulge_concierge") as IndulgeDomain;
    reset({
      title:       editTask?.title       ?? "",
      description: editTask?.description ?? "",
      department:  dept,
      domain:      dom,
      due_date:    editTask?.due_date    ?? undefined,
    });
    setSelectedColor(editTask?.cover_color ?? "#D4AF37");
    setSelectedIcon(editTask?.icon_key ?? "");
    if (!editTask) setMembers([]);
  }, [open, editTask?.id, profile?.id, reset]);

  useEffect(() => {
    if (!open || !profile || profile.role !== "manager") return;
    setValue("domain", profile.domain, { shouldValidate: true, shouldDirty: false });
  }, [open, profile, setValue]);

  useEffect(() => {
    if (!open || !profile) return;
    if (isPrivilegedRole(profile.role) || profile.role === "manager") return;
    setValue("department", (profile.department ?? "concierge") as EmployeeDepartment, {
      shouldValidate: true,
      shouldDirty: false,
    });
    setValue("domain", profile.domain, { shouldValidate: true, shouldDirty: false });
  }, [open, profile, setValue]);

  const titleWatch = watch("title");
  const deptWatch = watch("department");
  const domainWatch = watch("domain");

  function handleClose() {
    reset({
      title: "",
      description: "",
      department: (profile?.department ?? "concierge") as EmployeeDepartment,
      domain: (profile?.domain ?? "indulge_concierge") as IndulgeDomain,
      due_date: undefined,
    });
    setSelectedColor("#D4AF37");
    setSelectedIcon("");
    setMembers([]);
    onClose();
  }

  function onSubmit(raw: CreateMasterTaskFormValues) {
    const parsed = CreateMasterTaskSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    const data = parsed.data;
    startTransition(async () => {
      const base = {
        ...data,
        cover_color: selectedColor || undefined,
        icon_key:    selectedIcon  || undefined,
      };
      const params = editTask
        ? { ...base, due_date: base.due_date ?? null }
        : base;

      let result;
      if (editTask) {
        result = await updateMasterTask(editTask.id, params);
      } else {
        result = await createMasterTask(params);
      }

      if (result.success) {
        const newTaskId = !editTask && "data" in result
          ? (result.data as { id: string } | null)?.id
          : null;

        // Add selected members to a newly created task
        if (newTaskId && members.length > 0) {
          await Promise.allSettled(
            members.map((m) =>
              addMasterTaskMember({ masterTaskId: newTaskId, profileId: m.id, role: "member" }),
            ),
          );
        }

        // Add members to an existing task (same flow as create — PeoplePicker is available in edit mode)
        if (editTask && members.length > 0) {
          const addOut = await Promise.all(
            members.map((m) =>
              addMasterTaskMember({ masterTaskId: editTask.id, profileId: m.id, role: "member" }),
            ),
          );
          if (addOut.some((r) => !r.success)) {
            toast.error(
              addOut.find((r) => !r.success)?.error ??
                "Some members could not be added. Only owners and task managers can invite people.",
            );
          }
        }

        toast.success(editTask ? "Task updated" : "Master task created");
        handleClose();
        if (newTaskId) {
          router.push(`/tasks/${newTaskId}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {editTask ? "Edit Task" : "New Group Task"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">

          {/* ── Live preview card ── */}
          <PreviewCard
            title={titleWatch}
            color={selectedColor}
            iconKey={selectedIcon}
          />

          {/* ── Title ── */}
          <IndulgeField label="Title" required htmlFor="mt-title" error={errors.title?.message}>
            <Input
              id="mt-title"
              {...register("title")}
              placeholder="e.g. App Update Q2, Website Redesign…"
              className={cn(errors.title && "border-red-400")}
            />
          </IndulgeField>

          {/* ── Description ── */}
          <IndulgeField label="Description" htmlFor="mt-desc">
            <Textarea
              id="mt-desc"
              {...register("description")}
              placeholder="What is this task about?"
              className="min-h-[64px] resize-none text-sm"
              maxLength={2000}
            />
          </IndulgeField>

          {/* ── Department & domain ── */}
          {profile && isPrivilegedRole(profile.role) && (
            <div className="grid grid-cols-2 gap-4">
              <IndulgeField
                label="Department"
                required
                htmlFor="mt-dept"
                error={errors.department?.message}
              >
                <Controller
                  name="department"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="mt-dept"
                        className={cn(errors.department && "border-red-400")}
                        aria-invalid={!!errors.department}
                      >
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_DEPARTMENT_IDS.map((id) => (
                          <SelectItem key={id} value={id}>
                            {DEPARTMENT_CONFIG[id].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </IndulgeField>
              <IndulgeField
                label="Domain"
                required
                htmlFor="mt-domain"
                error={errors.domain?.message}
              >
                <Controller
                  name="domain"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="mt-domain"
                        className={cn(errors.domain && "border-red-400")}
                        aria-invalid={!!errors.domain}
                      >
                        <SelectValue placeholder="Domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOMAIN_OPTIONS.map((id) => (
                          <SelectItem key={id} value={id}>
                            {DOMAIN_CONFIG[id].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </IndulgeField>
            </div>
          )}

          {profile?.role === "manager" && (
            <div className="grid grid-cols-2 gap-4">
              <input type="hidden" {...register("domain")} />
              <IndulgeField
                label="Department"
                required
                htmlFor="mt-dept-mgr"
                error={errors.department?.message}
              >
                <Controller
                  name="department"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="mt-dept-mgr"
                        className={cn(errors.department && "border-red-400")}
                        aria-invalid={!!errors.department}
                      >
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        {managerDepartmentIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {DEPARTMENT_CONFIG[id].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </IndulgeField>
              <div className="flex flex-col justify-end pb-0.5 min-w-0">
                <InfoRow
                  icon={Globe}
                  label="Domain"
                  value={DOMAIN_CONFIG[profile.domain].label}
                />
              </div>
            </div>
          )}

          {profile &&
            !isPrivilegedRole(profile.role) &&
            profile.role !== "manager" && (
              <div className="space-y-3 rounded-lg border border-[#E5E4DF] bg-[#FAFAF8] p-3">
                <input type="hidden" {...register("department")} />
                <input type="hidden" {...register("domain")} />
                <InfoRow
                  icon={Building2}
                  label="Department"
                  value={
                    DEPARTMENT_CONFIG[deptWatch as EmployeeDepartment]?.label ?? deptWatch
                  }
                />
                <InfoRow
                  icon={Globe}
                  label="Domain"
                  value={
                    DOMAIN_CONFIG[domainWatch as IndulgeDomain]?.label ?? domainWatch
                  }
                />
                <p className="text-[11px] text-zinc-500 pl-9 -mt-1">
                  Task will be created in your department.
                </p>
              </div>
            )}

          {/* ── Accent colour ── */}
          <IndulgeField label="Accent Colour">
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-[3px] transition-transform hover:scale-110",
                    selectedColor === c ? "border-zinc-700 scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Select colour ${c}`}
                  aria-pressed={selectedColor === c}
                />
              ))}
            </div>
          </IndulgeField>

          {/* ── Icon picker (visual grid) ── */}
          <IndulgeField label="Icon">
            <IconPicker
              selected={selectedIcon}
              color={selectedColor}
              onChange={setSelectedIcon}
            />
          </IndulgeField>

          {/* ── Due date ── */}
          <IndulgeField label="Due Date" error={errors.due_date?.message}>
            <LuxuryDatePicker
              className="h-9 min-h-9 text-sm"
              value={parseOptionalIso(watch("due_date"))}
              onChange={(date) =>
                setValue("due_date", date ? date.toISOString() : undefined, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              placeholder="Optional — pick date & time"
            />
          </IndulgeField>

          {/* ── Members (create + edit — invite teammates any time) ── */}
          <IndulgeField
            label={editTask ? "Add members" : "Add Members"}
            hint={
              editTask
                ? "Search and add people here, then save — they are added to this group task."
                : "Optional — you can also add people after the task is created via Edit."
            }
            htmlFor="mt-members"
          >
            <div className="relative">
              <PeoplePicker selected={members} onChange={setMembers} />
            </div>
          </IndulgeField>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-1">
            <IndulgeButton type="button" variant="outline" onClick={handleClose}>
              Cancel
            </IndulgeButton>
            <IndulgeButton
              type="submit"
              variant="gold"
              loading={isPending}
              leftIcon={editTask ? undefined : <Plus className="h-4 w-4" />}
            >
              {editTask ? "Save Changes" : "Create Task"}
            </IndulgeButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
