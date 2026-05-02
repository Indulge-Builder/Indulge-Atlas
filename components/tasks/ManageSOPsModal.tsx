"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, ListChecks } from "lucide-react";
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
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import type { EmployeeDepartment } from "@/lib/types/database";
import {
  createSOPTemplate,
  deleteSOPTemplate,
  listSOPTemplates,
  type SOPTemplateRow,
} from "@/lib/actions/tasks";
import type { TaskPriority } from "@/lib/types/database";

const DEPT_OPTIONS = Object.keys(DEPARTMENT_CONFIG) as EmployeeDepartment[];

const PRIORITY_OPTIONS: TaskPriority[] = ["urgent", "high", "medium", "low"];

interface ManageSOPsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ManageSOPsModal({ open, onClose }: ManageSOPsModalProps) {
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<SOPTemplateRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<EmployeeDepartment>("concierge");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [checklist, setChecklist] = useState<string[]>([""]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setTemplatesLoading(true);
    const res = await listSOPTemplates();
    setTemplatesLoading(false);
    if (!res.success) {
      toast.error(res.error ?? "Could not load templates.");
      return;
    }
    setTemplates(res.data ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  function addChecklistRow() {
    setChecklist((c) => [...c, ""]);
  }

  function updateChecklistRow(i: number, v: string) {
    setChecklist((c) => c.map((x, j) => (j === i ? v : x)));
  }

  function removeChecklistRow(i: number) {
    setChecklist((c) => c.filter((_, j) => j !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const items = checklist.map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) {
      toast.error("Add at least one checklist item.");
      return;
    }
    startTransition(async () => {
      const res = await createSOPTemplate({
        title: trimmed,
        description: description.trim() || undefined,
        department,
        priority,
        checklist: items,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to save.");
        return;
      }
      toast.success("SOP template saved. Cron will spawn copies each IST midnight.");
      setTitle("");
      setDescription("");
      setChecklist([""]);
      void load();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteSOPTemplate(id);
      if (!res.success) {
        toast.error(res.error ?? "Delete failed.");
        return;
      }
      toast.success("Template removed.");
      void load();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg border-[#E5E4DF] bg-[#FDFCF8] p-0 gap-0 overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-[#D4AF37] via-[#E8C84A] to-[#D4AF37]" />
        <DialogHeader className="px-6 pt-5 pb-2">
          <DialogTitle className="font-serif text-xl text-[#1A1A1A] flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-[#A88B25]" aria-hidden />
            Daily SOP templates
          </DialogTitle>
          <p className="text-[12px] text-[#8A8A6E] font-normal leading-snug pt-1">
            Templates clone nightly (00:01 IST) into each active agent&apos;s personal tasks in the
            selected department. Runs in Postgres via pg_cron — see migration 081.
          </p>
        </DialogHeader>

        <div className="max-h-[min(70vh,560px)] overflow-y-auto px-6 pb-6 space-y-5">
          {templatesLoading && templates.length === 0 ? (
            <p className="text-sm text-[#8A8A6E]">Loading…</p>
          ) : templates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
                Active templates
              </p>
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#1A1A1A] truncate">{t.title}</p>
                      <p className="text-[11px] text-[#8A8A6E]">
                        {DEPARTMENT_CONFIG[t.department as EmployeeDepartment]?.label ?? t.department}
                        {" · "}
                        {t.checklistCount} steps
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="shrink-0 rounded-lg p-1.5 text-[#C0392B] hover:bg-[#FEF2F2]"
                      aria-label="Delete template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4 border-t border-[#E5E4DF] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
              New template
            </p>
            <IndulgeField label="Title" required htmlFor="sop-title">
              <Input
                id="sop-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Morning concierge checklist"
                className="h-10"
              />
            </IndulgeField>
            <IndulgeField label="Notes" htmlFor="sop-notes">
              <Textarea
                id="sop-notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional context for managers…"
                className="resize-none"
              />
            </IndulgeField>
            <IndulgeField label="Rollout department" htmlFor="sop-dept">
              <select
                id="sop-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value as EmployeeDepartment)}
                className="h-10 w-full rounded-lg border border-[#E5E4DF] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30"
              >
                {DEPT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_CONFIG[d].label}
                  </option>
                ))}
              </select>
            </IndulgeField>
            <IndulgeField label="Priority" htmlFor="sop-priority">
              <select
                id="sop-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="h-10 w-full rounded-lg border border-[#E5E4DF] bg-white px-3 text-[13px]"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </IndulgeField>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E] mb-2">
                Checklist items
              </p>
              <div className="space-y-2">
                {checklist.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={line}
                      onChange={(e) => updateChecklistRow(i, e.target.value)}
                      placeholder={`Step ${i + 1}`}
                      className="h-9 flex-1"
                    />
                    {checklist.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeChecklistRow(i)}
                        className="shrink-0 px-2 text-[12px] text-[#8A8A6E] hover:text-[#C0392B]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addChecklistRow}
                  className="text-[12px] text-[#A88B25] hover:underline"
                >
                  + Add step
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <IndulgeButton type="button" variant="outline" size="sm" onClick={onClose}>
                Close
              </IndulgeButton>
              <IndulgeButton type="submit" variant="gold" size="sm" loading={isPending}>
                Save template
              </IndulgeButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
