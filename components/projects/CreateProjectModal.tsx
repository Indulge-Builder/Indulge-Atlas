"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { cn } from "@/lib/utils";
import { createProject, searchProfilesForProject } from "@/lib/actions/projects";
import { toast } from "sonner";
import {
  Briefcase,
  Code,
  Users,
  Star,
  Zap,
  Globe,
  BarChart3,
  Megaphone,
  ShoppingBag,
  Heart,
  Layers,
  Rocket,
  Settings,
  BookOpen,
  Camera,
  Music,
  Calendar,
  Lightbulb,
  Target,
  Award,
  X,
  ChevronRight,
  Search,
  Pencil,
} from "lucide-react";

// ── Config ─────────────────────────────────────────────────────────────────

const PALETTE_COLORS = [
  "#D4AF37", // Gold
  "#4F46E5", // Indigo
  "#10B981", // Emerald
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#8B5CF6", // Violet
  "#0EA5E9", // Sky
  "#EC4899", // Pink
];

const ICON_OPTIONS = [
  { name: "Briefcase", icon: Briefcase },
  { name: "Code", icon: Code },
  { name: "Users", icon: Users },
  { name: "Star", icon: Star },
  { name: "Zap", icon: Zap },
  { name: "Globe", icon: Globe },
  { name: "BarChart3", icon: BarChart3 },
  { name: "Megaphone", icon: Megaphone },
  { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Heart", icon: Heart },
  { name: "Layers", icon: Layers },
  { name: "Rocket", icon: Rocket },
  { name: "Settings", icon: Settings },
  { name: "BookOpen", icon: BookOpen },
  { name: "Camera", icon: Camera },
  { name: "Music", icon: Music },
  { name: "Calendar", icon: Calendar },
  { name: "Lightbulb", icon: Lightbulb },
  { name: "Target", icon: Target },
  { name: "Award", icon: Award },
];

const DEPARTMENTS = [
  "sales",
  "concierge",
  "tech",
  "finance",
  "marketing",
  "hr",
  "management",
  "operations",
];

// ── Form state ─────────────────────────────────────────────────────────────

interface MemberEntry {
  id: string;
  full_name: string;
  role: string;
  memberRole: "manager" | "member" | "viewer";
}

interface FormState {
  title: string;
  description: string;
  color: string;
  icon: string;
  due_date: string;
  department: string;
  domain: string;
  members: MemberEntry[];
}

// ── Helper ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Step indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            s === current ? "w-8 bg-[#D4AF37]" : s < current ? "w-4 bg-[#D4AF37]/50" : "w-4 bg-zinc-200",
          )}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface CreateProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectModal({ open, onOpenChange }: CreateProjectModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; full_name: string; role: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    color: PALETTE_COLORS[0],
    icon: "Briefcase",
    due_date: "",
    department: "",
    domain: "",
    members: [],
  });

  // Auto-focus title input when editing
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  // Start editing title automatically when modal opens on step 1
  useEffect(() => {
    if (open && step === 1) {
      const t = setTimeout(() => setEditingTitle(true), 120);
      return () => clearTimeout(t);
    }
  }, [open, step]);

  function reset() {
    setStep(1);
    setEditingTitle(false);
    setForm({
      title: "",
      description: "",
      color: PALETTE_COLORS[0],
      icon: "Briefcase",
      due_date: "",
      department: "",
      domain: "",
      members: [],
    });
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleClose() {
    onOpenChange(false);
    reset();
  }

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await searchProfilesForProject(query.trim());
    setIsSearching(false);
    setSearchResults(results);
  }, []);

  function addMember(profile: { id: string; full_name: string; role: string }) {
    if (form.members.some((m) => m.id === profile.id)) return;
    setForm((f) => ({
      ...f,
      members: [
        ...f.members,
        { id: profile.id, full_name: profile.full_name, role: profile.role, memberRole: "member" },
      ],
    }));
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeMember(id: string) {
    setForm((f) => ({ ...f, members: f.members.filter((m) => m.id !== id) }));
  }

  function updateMemberRole(id: string, role: "manager" | "member" | "viewer") {
    setForm((f) => ({
      ...f,
      members: f.members.map((m) => (m.id === id ? { ...m, memberRole: role } : m)),
    }));
  }

  function handleCreate() {
    if (!form.title.trim()) {
      toast.error("Project title is required");
      setStep(1);
      setEditingTitle(true);
      return;
    }
    startTransition(async () => {
      const result = await createProject({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        color: form.color,
        icon: form.icon,
        due_date: form.due_date || undefined,
        department: form.department || undefined,
        domain: form.domain || undefined,
        initialMemberIds: form.members.map((m) => m.id),
      });

      if (result.success) {
        toast.success("Project created!");
        handleClose();
        if (result.data?.id) router.push(`/projects/${result.data.id}`);
      } else {
        toast.error(result.error ?? "Failed to create project");
      }
    });
  }

  const SelectedIcon =
    ICON_OPTIONS.find((o) => o.name === form.icon)?.icon ?? Briefcase;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>New Project</DialogTitle>
            <StepIndicator current={step} />
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Step {step} of 3 —{" "}
            {step === 1 ? "Identity" : step === 2 ? "Team" : "Settings"}
          </p>
        </DialogHeader>

        {/* ── Step 1: Identity ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            {/* Inline-editable project identity badge */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] group cursor-text"
              onClick={() => setEditingTitle(true)}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${form.color}18`, border: `1.5px solid ${form.color}30` }}
              >
                <SelectedIcon className="w-5 h-5" style={{ color: form.color }} />
              </div>

              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
                  }}
                  placeholder="Project name…"
                  maxLength={200}
                  className="flex-1 text-sm font-medium text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400 placeholder:font-normal min-w-0"
                />
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate",
                    form.title ? "text-[#1A1A1A]" : "text-zinc-400 font-normal italic",
                  )}>
                    {form.title || "Click to name your project…"}
                  </p>
                  <Pencil className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 shrink-0 transition-colors" />
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">
                Description <span className="text-zinc-300 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this project about?"
                rows={2}
                maxLength={2000}
                className="w-full text-sm text-[#1A1A1A] px-3 py-2 rounded-xl border border-[#E5E4DF] bg-white resize-none focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] placeholder:text-zinc-400"
              />
            </div>

            {/* Color */}
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "w-7 h-7 rounded-full ring-2 ring-offset-2 transition-all",
                      form.color === c ? "ring-[#1A1A1A]" : "ring-transparent",
                    )}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            {/* Icon */}
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-2">Icon</label>
              <div className="grid grid-cols-10 gap-1.5">
                {ICON_OPTIONS.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: name }))}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      form.icon === name
                        ? "bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]/40"
                        : "bg-zinc-50 hover:bg-zinc-100",
                    )}
                    aria-label={name}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        form.icon === name ? "text-[#D4AF37]" : "text-zinc-500",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Team ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-zinc-400">
              You are the project owner. Add team members below.
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full text-sm text-[#1A1A1A] pl-8 pr-3 py-2 rounded-xl border border-[#E5E4DF] bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] placeholder:text-zinc-400"
              />
              {isSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                  …
                </span>
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-[#E5E4DF] divide-y divide-[#F0F0EE] overflow-hidden">
                {searchResults.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addMember(p)}
                    disabled={form.members.some((m) => m.id === p.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-50 text-left disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-[9px] bg-stone-100 text-stone-600 font-medium">
                        {getInitials(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-[#1A1A1A] flex-1">{p.full_name}</span>
                    <span className="text-[10px] text-zinc-400 capitalize">{p.role}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Added members */}
            {form.members.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500">Team members</p>
                {form.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 p-2 rounded-xl border border-[#E5E4DF]"
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-[10px] bg-stone-100 text-stone-600 font-medium">
                        {getInitials(m.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-[#1A1A1A] flex-1 truncate">{m.full_name}</span>
                    <select
                      value={m.memberRole}
                      onChange={(e) =>
                        updateMemberRole(m.id, e.target.value as "manager" | "member" | "viewer")
                      }
                      className="text-xs text-[#1A1A1A] border border-[#E5E4DF] rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    >
                      <option value="manager">Manager</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                      aria-label="Remove member"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {form.members.length === 0 && !searchQuery && (
              <p className="text-xs text-zinc-300 italic text-center py-4">
                No members added yet — this is fine, you can invite later.
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Settings ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {/* Due date */}
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1.5">
                Due date <span className="text-zinc-300 font-normal">(optional)</span>
              </label>
              <LuxuryDatePicker
                hideTime
                placeholder="Pick a due date…"
                value={form.due_date ? new Date(form.due_date) : undefined}
                onChange={(date) =>
                  setForm((f) => ({
                    ...f,
                    due_date: date ? date.toISOString().split("T")[0] : "",
                  }))
                }
              />
            </div>

            {/* Department */}
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1.5">
                Department <span className="text-zinc-300 font-normal">(optional)</span>
              </label>
              <select
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full text-sm text-[#1A1A1A] px-3 py-2 rounded-xl border border-[#E5E4DF] bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="">No department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] p-3 space-y-1.5">
              <p className="text-xs font-semibold text-zinc-600">Summary</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${form.color}18` }}
                >
                  <SelectedIcon className="w-3.5 h-3.5" style={{ color: form.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{form.title}</p>
                  {form.members.length > 0 && (
                    <p className="text-[10px] text-zinc-400">
                      {form.members.length} team member{form.members.length !== 1 ? "s" : ""}
                    </p>
                  )}
                  {form.due_date && (
                    <p className="text-[10px] text-zinc-400">
                      Due {new Date(form.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={isPending}
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                if (step === 1 && !form.title.trim()) {
                  toast.error("Project title is required");
                  setEditingTitle(true);
                  return;
                }
                setStep((s) => s + 1);
              }}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              variant="gold"
              size="sm"
              onClick={handleCreate}
              disabled={isPending}
            >
              {isPending ? "Creating…" : "Create Project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
