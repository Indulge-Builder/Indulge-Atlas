"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { SlaPolicy, ConciergeTicketPriority } from "@/lib/types/database";
import {
  CONCIERGE_TICKET_PRIORITIES,
  CONCIERGE_PRIORITY_LABELS,
} from "@/lib/types/database";
import type { CategoryOption } from "@/components/concierge/tickets/panelTypes";
import type { SlaPolicyInput } from "@/lib/schemas/concierge";
import {
  listSlaPolicies,
  createSlaPolicy,
  updateSlaPolicy,
  toggleSlaPolicyActive,
  deleteSlaPolicy,
} from "@/lib/actions/concierge-sla-policies";

/** Sentinel Select value for the "no category" / "all priorities" options.
 * Radix SelectItem values must be non-empty; we convert back to null on save. */
const NONE = "__none__";

/** minutes → compact human label (1440→"1d", 60→"1h", 480→"8h", 15→"15m"). */
function formatMinutes(n: number): string {
  if (n % 1440 === 0) return `${n / 1440}d`;
  if (n % 60 === 0) return `${n / 60}h`;
  return `${n}m`;
}

/** "Parent / Child" for subcategories; plain name for top-level categories. */
function labelForCategory(
  c: CategoryOption,
  byId: Map<string, CategoryOption>,
): string {
  if (c.parent_id) {
    const parent = byId.get(c.parent_id);
    return parent ? `${parent.name} / ${c.name}` : c.name;
  }
  return c.name;
}

interface EditorForm {
  name: string;
  categoryId: string; // NONE sentinel or category uuid
  priority: string; // NONE sentinel or priority literal
  firstResponseMinutes: string;
  resolutionMinutes: string;
  clock: "calendar" | "business_hours";
  isDefault: boolean;
  escalationEnabled: boolean;
  isActive: boolean;
}

const EMPTY_FORM: EditorForm = {
  name: "",
  categoryId: NONE,
  priority: NONE,
  firstResponseMinutes: "",
  resolutionMinutes: "",
  clock: "business_hours",
  isDefault: false,
  escalationEnabled: false,
  isActive: true,
};

const CLOCK_LABELS: Record<EditorForm["clock"], string> = {
  calendar: "24/7 calendar",
  business_hours: "Business hours",
};

export function SlaPoliciesClient({
  initialPolicies,
  categories,
}: {
  initialPolicies: SlaPolicy[];
  categories: CategoryOption[];
}) {
  const [policies, setPolicies] = useState<SlaPolicy[]>(initialPolicies);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SlaPolicy | null>(null);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c] as const)),
    [categories],
  );

  const categoryOptions = useMemo(
    () =>
      categories
        .map((c) => ({ id: c.id, label: labelForCategory(c, categoryById) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories, categoryById],
  );

  const renderCategory = (categoryId: string | null): string => {
    if (!categoryId) return "All categories";
    const c = categoryById.get(categoryId);
    return c ? labelForCategory(c, categoryById) : "Unknown category";
  };

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(p: SlaPolicy) {
    setEditing(p);
    setForm({
      name: p.name,
      categoryId: p.category_id ?? NONE,
      priority: p.priority ?? NONE,
      firstResponseMinutes: String(p.first_response_minutes),
      resolutionMinutes: String(p.resolution_minutes),
      clock: p.clock,
      isDefault: p.is_default,
      escalationEnabled: p.escalation_enabled,
      isActive: p.is_active,
    });
    setFormError(null);
    setOpen(true);
  }

  async function refetch() {
    setPolicies(await listSlaPolicies());
  }

  async function handleToggleActive(policy: SlaPolicy, checked: boolean) {
    // Optimistic flip; revert if the mutation fails.
    setPolicies((prev) =>
      prev.map((p) => (p.id === policy.id ? { ...p, is_active: checked } : p)),
    );
    const res = await toggleSlaPolicyActive(policy.id, checked);
    if (!res.success) {
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === policy.id ? { ...p, is_active: !checked } : p,
        ),
      );
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success(checked ? "Policy activated" : "Policy deactivated");
    await refetch();
  }

  async function handleDelete(policy: SlaPolicy) {
    if (
      !window.confirm(
        `Delete SLA policy "${policy.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    const res = await deleteSlaPolicy(policy.id);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success("Policy deleted");
    await refetch();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    const firstResponse = Number(form.firstResponseMinutes);
    const resolution = Number(form.resolutionMinutes);

    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (!Number.isFinite(firstResponse) || firstResponse < 0) {
      setFormError("First response minutes must be a non-negative number.");
      return;
    }
    if (!Number.isFinite(resolution) || resolution < 0) {
      setFormError("Resolution minutes must be a non-negative number.");
      return;
    }

    const input: SlaPolicyInput = {
      name,
      categoryId: form.categoryId === NONE ? null : form.categoryId,
      priority:
        form.priority === NONE
          ? null
          : (form.priority as ConciergeTicketPriority),
      firstResponseMinutes: firstResponse,
      resolutionMinutes: resolution,
      isDefault: form.isDefault,
      isActive: form.isActive,
      escalationEnabled: form.escalationEnabled,
      clock: form.clock,
    };

    setSaving(true);
    const res = editing
      ? await updateSlaPolicy(editing.id, input)
      : await createSlaPolicy(input);
    setSaving(false);

    if (!res.success) {
      const message = res.error ?? "Something went wrong";
      setFormError(message);
      toast.error(message);
      return;
    }

    toast.success(editing ? "Policy updated" : "Policy created");
    await refetch();
    setOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/concierge/tickets"
            className="text-xs font-medium text-[#6B6B6B] transition-colors hover:text-[#1A1A1A]"
          >
            ← Tickets
          </Link>
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">SLA Policies</h1>
          <p className="text-sm text-[#6B6B6B]">
            Response and resolution targets by category and priority. The most
            specific active policy applies to each ticket.
          </p>
        </div>
        <IndulgeButton
          variant="gold"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={openCreate}
        >
          New policy
        </IndulgeButton>
      </div>

      {/* Table */}
      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "overflow-x-auto",
        )}
      >
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#E5E4DF] text-left text-[11px] font-semibold uppercase tracking-widest text-[#6B6B6B]">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">First response</th>
              <th className="px-4 py-3">Resolution</th>
              <th className="px-4 py-3">Clock</th>
              <th className="px-4 py-3">Default</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-[#6B6B6B]"
                >
                  No SLA policies yet. Create one to start tracking response and
                  resolution targets.
                </td>
              </tr>
            ) : (
              policies.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#EFEEEA] last:border-b-0 text-[#1A1A1A]"
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-[#4A4A4A]">
                    {renderCategory(p.category_id)}
                  </td>
                  <td className="px-4 py-3 text-[#4A4A4A]">
                    {p.priority
                      ? CONCIERGE_PRIORITY_LABELS[p.priority]
                      : "All priorities"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMinutes(p.first_response_minutes)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMinutes(p.resolution_minutes)}
                  </td>
                  <td className="px-4 py-3 text-[#4A4A4A]">
                    {CLOCK_LABELS[p.clock]}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_default ? (
                      <span className="inline-flex items-center rounded-full bg-[#F2F2EE] px-2 py-0.5 text-[11px] font-semibold text-[#5f5348]">
                        Default
                      </span>
                    ) : (
                      <span className="text-[#B5A99A]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      onChange={(e) => handleToggleActive(p, e.target.checked)}
                      aria-label={`Toggle ${p.name} active`}
                      className="h-4 w-4 cursor-pointer accent-[#5f5348]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(p)}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(p)}
                        aria-label={`Delete ${p.name}`}
                        className="text-[#C0392B] hover:bg-[#FBEAE8] hover:text-[#A93226]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Editor dialog (create + edit) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit SLA policy" : "New SLA policy"}
            </DialogTitle>
            <DialogDescription>
              Targets are stored in minutes. Leave category or priority broad to
              apply the policy more widely.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <IndulgeField label="Name" htmlFor="sla-name" required>
              <Input
                id="sla-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Urgent — first response"
                required
              />
            </IndulgeField>

            <div className="grid gap-4 sm:grid-cols-2">
              <IndulgeField label="Category">
                <Select
                  value={form.categoryId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, categoryId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Applies broadly (all categories)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      Applies broadly (all categories)
                    </SelectItem>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </IndulgeField>

              <IndulgeField label="Priority">
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, priority: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All priorities</SelectItem>
                    {CONCIERGE_TICKET_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {CONCIERGE_PRIORITY_LABELS[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </IndulgeField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <IndulgeField
                label="First response minutes"
                htmlFor="sla-first-response"
                hint="e.g. 15 = 15m, 480 = 8h"
                required
              >
                <Input
                  id="sla-first-response"
                  type="number"
                  min={0}
                  value={form.firstResponseMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      firstResponseMinutes: e.target.value,
                    }))
                  }
                  placeholder="15"
                  required
                />
              </IndulgeField>

              <IndulgeField
                label="Resolution minutes"
                htmlFor="sla-resolution"
                hint="e.g. 480 = 8h, 1440 = 1d"
                required
              >
                <Input
                  id="sla-resolution"
                  type="number"
                  min={0}
                  value={form.resolutionMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      resolutionMinutes: e.target.value,
                    }))
                  }
                  placeholder="480"
                  required
                />
              </IndulgeField>
            </div>

            <IndulgeField label="Clock">
              <Select
                value={form.clock}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    clock: v as EditorForm["clock"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">24/7 calendar</SelectItem>
                  <SelectItem value="business_hours">Business hours</SelectItem>
                </SelectContent>
              </Select>
            </IndulgeField>

            <div className="flex flex-col gap-2.5 rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] p-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isDefault: e.target.checked }))
                  }
                  className="h-4 w-4 cursor-pointer accent-[#5f5348]"
                />
                Default policy
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={form.escalationEnabled}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      escalationEnabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 cursor-pointer accent-[#5f5348]"
                />
                Escalation enabled
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                  className="h-4 w-4 cursor-pointer accent-[#5f5348]"
                />
                Active
              </label>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-md border border-[#E7B7B1] bg-[#FBEAE8] px-3 py-2 text-[13px] text-[#A93226]"
              >
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <IndulgeButton type="submit" variant="gold" loading={saving}>
                {editing ? "Save changes" : "Create policy"}
              </IndulgeButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
