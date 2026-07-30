"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

import type {
  TicketCategory,
  TicketChecklistTemplate,
  CannedResponse,
  WatcherAssignment,
  ConciergeGroup,
} from "@/lib/types/database";
import { QueendomScopePicker } from "@/components/admin/QueendomScopePicker";
import { listWatchers, setWatcherQueendoms } from "@/lib/actions/concierge-watchers";
import {
  listAllTicketCategories,
  createTicketCategory,
  updateTicketCategory,
  toggleTicketCategoryActive,
  deleteTicketCategory,
  listAllChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  toggleChecklistTemplateActive,
  deleteChecklistTemplate,
  listAllCannedResponses,
  createCannedResponse,
  updateCannedResponse,
  toggleCannedResponseActive,
  deleteCannedResponse,
} from "@/lib/actions/concierge-settings";

/** Radix SelectItem values must be non-empty; convert back to null on save. */
const NONE = "__none__";
const CHECK = "h-4 w-4 cursor-pointer accent-[#5f5348]";

type Tab = "categories" | "checklists" | "canned" | "watchers";

/** "Parent / Child" for a subcategory; plain name for a top-level category. */
function catLabel(c: TicketCategory, byId: Map<string, TicketCategory>): string {
  if (c.parent_id) {
    const parent = byId.get(c.parent_id);
    return parent ? `${parent.name} / ${c.name}` : c.name;
  }
  return c.name;
}

/** Ordered [category, label] pairs: each top-level followed by its children. */
function orderedCategoryOptions(categories: TicketCategory[]): { id: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const tops = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const out: { id: string; label: string }[] = [];
  for (const top of tops) {
    out.push({ id: top.id, label: top.name });
    const subs = categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const sub of subs) out.push({ id: sub.id, label: `${top.name} / ${sub.name}` });
  }
  return out;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-[#E7B7B1] bg-[#FBEAE8] px-3 py-2 text-[13px] text-[#A93226]"
    >
      {message}
    </p>
  );
}

function ActiveCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className={CHECK}
    />
  );
}

// ── Categories panel ────────────────────────────────────────────────────────────

function CategoriesPanel({
  categories,
  setCategories,
}: {
  categories: TicketCategory[];
  setCategories: (next: TicketCategory[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TicketCategory | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(NONE);
  const [isActive, setIsActive] = useState(true);
  const [isRetail, setIsRetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tops = useMemo(
    () => categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );
  const subsFor = (pid: string) =>
    categories.filter((c) => c.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order);

  async function refetch() {
    setCategories(await listAllTicketCategories());
  }

  function openCreate(preParent?: string) {
    setEditing(null);
    setName("");
    setParentId(preParent ?? NONE);
    setIsActive(true);
    setIsRetail(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(c: TicketCategory) {
    setEditing(c);
    setName(c.name);
    setParentId(c.parent_id ?? NONE);
    setIsActive(c.is_active);
    setIsRetail(c.is_retail);
    setError(null);
    setOpen(true);
  }

  async function handleToggle(c: TicketCategory, checked: boolean) {
    setCategories(categories.map((x) => (x.id === c.id ? { ...x, is_active: checked } : x)));
    const res = await toggleTicketCategoryActive(c.id, checked);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      await refetch();
      return;
    }
    toast.success(checked ? "Category activated" : "Category deactivated");
  }

  async function handleDelete(c: TicketCategory) {
    const kids = subsFor(c.id).length;
    const warn = kids > 0 ? ` This also deletes ${kids} subcategor${kids === 1 ? "y" : "ies"}.` : "";
    if (!window.confirm(`Delete "${c.name}"?${warn} If it has tickets you'll be asked to deactivate instead.`)) return;
    const res = await deleteTicketCategory(c.id);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success("Category deleted");
    await refetch();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    // A category can only be top-level or a subcategory of a top-level (one level deep).
    const parent = parentId === NONE ? null : parentId;
    const siblings = categories.filter((c) => (c.parent_id ?? null) === parent);
    const nextSort = siblings.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1;

    setSaving(true);
    const input = {
      name: trimmed,
      parentId: parent,
      isActive,
      isRetail,
      ...(editing ? {} : { sortOrder: nextSort }),
    };
    const res = editing
      ? await updateTicketCategory(editing.id, { ...input, sortOrder: editing.sort_order })
      : await createTicketCategory(input);
    setSaving(false);
    if (!res.success) {
      const m = res.error ?? "Something went wrong";
      setError(m);
      toast.error(m);
      return;
    }
    toast.success(editing ? "Category updated" : "Category created");
    await refetch();
    setOpen(false);
  }

  const parentOptions = tops; // subcategories can only hang off a top-level category

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6B6B6B]">
          Types and subcategories used across ticket creation, filters, and checklists.
        </p>
        <IndulgeButton variant="gold" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
          New category
        </IndulgeButton>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "divide-y divide-[#EFEEEA]")}>
        {tops.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#6B6B6B]">No categories yet.</p>
        ) : (
          tops.map((top) => (
            <div key={top.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={cn("font-medium text-[#1A1A1A]", !top.is_active && "text-[#B5A99A] line-through")}>
                  {top.name}
                </span>
                {top.is_retail && (
                  <span className="rounded-full bg-[#F2F2EE] px-2 py-0.5 text-[10px] font-semibold text-brand-gold">
                    Retail
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <ActiveCheckbox checked={top.is_active} onChange={(v) => handleToggle(top, v)} label={`Toggle ${top.name}`} />
                  <Button variant="ghost" size="icon-sm" onClick={() => openCreate(top.id)} aria-label={`Add subcategory to ${top.name}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(top)} aria-label={`Edit ${top.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(top)}
                    aria-label={`Delete ${top.name}`}
                    className="text-[#C0392B] hover:bg-[#FBEAE8] hover:text-[#A93226]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {subsFor(top.id).length > 0 && (
                <ul className="mt-2 space-y-1 border-l border-[#E5E4DF] pl-4">
                  {subsFor(top.id).map((sub) => (
                    <li key={sub.id} className="flex items-center gap-3 py-1">
                      <span className={cn("text-sm text-[#4A4A4A]", !sub.is_active && "text-[#B5A99A] line-through")}>
                        {sub.name}
                      </span>
                      {sub.is_retail && (
                        <span className="rounded-full bg-[#F2F2EE] px-2 py-0.5 text-[10px] font-semibold text-brand-gold">
                          Retail
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <ActiveCheckbox checked={sub.is_active} onChange={(v) => handleToggle(sub, v)} label={`Toggle ${sub.name}`} />
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(sub)} aria-label={`Edit ${sub.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(sub)}
                          aria-label={`Delete ${sub.name}`}
                          className="text-[#C0392B] hover:bg-[#FBEAE8] hover:text-[#A93226]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>
              Leave the parent empty for a top-level type, or pick one to add a subcategory.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <IndulgeField label="Name" htmlFor="cat-name" required>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Travel" required />
            </IndulgeField>
            <IndulgeField label="Parent category" hint="Empty = top-level type">
              <Select value={parentId} onValueChange={setParentId} disabled={!!editing}>
                <SelectTrigger>
                  <SelectValue placeholder="Top-level (no parent)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Top-level (no parent)</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className={CHECK} />
              Active
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[#1A1A1A]">
              <input
                type="checkbox"
                checked={isRetail}
                onChange={(e) => setIsRetail(e.target.checked)}
                className={cn(CHECK, "mt-0.5")}
              />
              <span>
                Retail category
                <span className="block text-xs text-[#6B6B6B]">
                  Tickets here (and in its subcategories) are visible to the Shop/Retail team across all Queendoms.
                </span>
              </span>
            </label>
            <ErrorBanner message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <IndulgeButton type="submit" variant="gold" loading={saving}>
                {editing ? "Save changes" : "Create"}
              </IndulgeButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Checklists panel ────────────────────────────────────────────────────────────

function ChecklistsPanel({
  categories,
  initial,
}: {
  categories: TicketCategory[];
  initial: TicketChecklistTemplate[];
}) {
  const options = useMemo(() => orderedCategoryOptions(categories), [categories]);
  const [selected, setSelected] = useState<string>(options[0]?.id ?? "");
  const [items, setItems] = useState<TicketChecklistTemplate[]>(initial);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TicketChecklistTemplate | null>(null);
  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Templates are seeded from the RSC props; refetch only after a mutation.
  async function refetch() {
    setItems(await listAllChecklistTemplates());
  }

  const filtered = items.filter((t) => t.category_id === selected).sort((a, b) => a.sort_order - b.sort_order);

  function openCreate() {
    setEditing(null);
    setLabel("");
    setIsActive(true);
    setError(null);
    setOpen(true);
  }
  function openEdit(t: TicketChecklistTemplate) {
    setEditing(t);
    setLabel(t.label);
    setIsActive(t.is_active);
    setError(null);
    setOpen(true);
  }

  async function handleToggle(t: TicketChecklistTemplate, checked: boolean) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: checked } : x)));
    const res = await toggleChecklistTemplateActive(t.id, checked);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      await refetch();
    }
  }

  async function handleDelete(t: TicketChecklistTemplate) {
    if (!window.confirm(`Delete checklist item "${t.label}"?`)) return;
    const res = await deleteChecklistTemplate(t.id);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success("Checklist item deleted");
    await refetch();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Label is required.");
      return;
    }
    if (!selected) {
      setError("Pick a category first.");
      return;
    }
    const siblings = items.filter((t) => t.category_id === selected);
    const nextSort = siblings.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1;
    setSaving(true);
    const res = editing
      ? await updateChecklistTemplate(editing.id, { categoryId: selected, label: trimmed, isActive, sortOrder: editing.sort_order })
      : await createChecklistTemplate({ categoryId: selected, label: trimmed, isActive, sortOrder: nextSort });
    setSaving(false);
    if (!res.success) {
      const m = res.error ?? "Something went wrong";
      setError(m);
      toast.error(m);
      return;
    }
    toast.success(editing ? "Checklist item updated" : "Checklist item added");
    await refetch();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B6B6B]">Category</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-auto min-w-56">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <IndulgeButton variant="gold" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!selected}>
          Add item
        </IndulgeButton>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "divide-y divide-[#EFEEEA]")}>
        {!selected ? (
          <p className="px-4 py-10 text-center text-sm text-[#6B6B6B]">Create a category first.</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#6B6B6B]">
            No checklist items for this category yet.
          </p>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("text-sm text-[#1A1A1A]", !t.is_active && "text-[#B5A99A] line-through")}>{t.label}</span>
              <div className="ml-auto flex items-center gap-1">
                <ActiveCheckbox checked={t.is_active} onChange={(v) => handleToggle(t, v)} label={`Toggle ${t.label}`} />
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(t)} aria-label={`Edit ${t.label}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(t)}
                  aria-label={`Delete ${t.label}`}
                  className="text-[#C0392B] hover:bg-[#FBEAE8] hover:text-[#A93226]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit checklist item" : "New checklist item"}</DialogTitle>
            <DialogDescription>
              Snapshotted onto new tickets in this category — existing tickets are unaffected.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <IndulgeField label="Label" htmlFor="cl-label" required>
              <Input id="cl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Boarding pass" required />
            </IndulgeField>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className={CHECK} />
              Active
            </label>
            <ErrorBanner message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <IndulgeButton type="submit" variant="gold" loading={saving}>
                {editing ? "Save changes" : "Add"}
              </IndulgeButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Canned responses panel ──────────────────────────────────────────────────────

function CannedPanel({
  categories,
  initial,
}: {
  categories: TicketCategory[];
  initial: CannedResponse[];
}) {
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);
  const options = useMemo(() => orderedCategoryOptions(categories), [categories]);
  const [items, setItems] = useState<CannedResponse[]>(initial);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [name, setName] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    setItems(await listAllCannedResponses());
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setShortcut("");
    setBody("");
    setCategoryId(NONE);
    setIsActive(true);
    setError(null);
    setOpen(true);
  }
  function openEdit(c: CannedResponse) {
    setEditing(c);
    setName(c.name);
    setShortcut(c.shortcut ?? "");
    setBody(c.body_template);
    setCategoryId(c.category_id ?? NONE);
    setIsActive(c.is_active);
    setError(null);
    setOpen(true);
  }

  async function handleToggle(c: CannedResponse, checked: boolean) {
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: checked } : x)));
    const res = await toggleCannedResponseActive(c.id, checked);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      await refetch();
    }
  }

  async function handleDelete(c: CannedResponse) {
    if (!window.confirm(`Delete canned response "${c.name}"?`)) return;
    const res = await deleteCannedResponse(c.id);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success("Canned response deleted");
    await refetch();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!body.trim()) {
      setError("Body is required.");
      return;
    }
    const input = {
      name: name.trim(),
      shortcut: shortcut.trim() || null,
      bodyTemplate: body.trim(),
      categoryId: categoryId === NONE ? null : categoryId,
      isActive,
    };
    setSaving(true);
    const res = editing ? await updateCannedResponse(editing.id, input) : await createCannedResponse(input);
    setSaving(false);
    if (!res.success) {
      const m = res.error ?? "Something went wrong";
      setError(m);
      toast.error(m);
      return;
    }
    toast.success(editing ? "Canned response updated" : "Canned response created");
    await refetch();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6B6B6B]">
          Preset note templates. Use <code className="rounded bg-[#F2F2EE] px-1">{"{{client_name}}"}</code>,{" "}
          <code className="rounded bg-[#F2F2EE] px-1">{"{{agent_name}}"}</code> etc. for auto-fill.
        </p>
        <IndulgeButton variant="gold" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          New response
        </IndulgeButton>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "overflow-x-auto")}>
        <table className="w-full min-w-180 border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#E5E4DF] text-left text-[11px] font-semibold uppercase tracking-widest text-[#6B6B6B]">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Shortcut</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#6B6B6B]">
                  No canned responses yet.
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="border-b border-[#EFEEEA] last:border-b-0 text-[#1A1A1A]">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-[#4A4A4A]">
                    {c.shortcut ? <code className="rounded bg-[#F2F2EE] px-1">{c.shortcut}</code> : <span className="text-[#B5A99A]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#4A4A4A]">
                    {c.category_id ? (byId.get(c.category_id) ? catLabel(byId.get(c.category_id)!, byId) : "Unknown") : "All categories"}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveCheckbox checked={c.is_active} onChange={(v) => handleToggle(c, v)} label={`Toggle ${c.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(c)}
                        aria-label={`Delete ${c.name}`}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit canned response" : "New canned response"}</DialogTitle>
            <DialogDescription>Available in the ticket note composer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <IndulgeField label="Name" htmlFor="cr-name" required>
                <Input id="cr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Resolution Message" required />
              </IndulgeField>
              <IndulgeField label="Shortcut" htmlFor="cr-shortcut" hint="Optional, e.g. /c">
                <Input id="cr-shortcut" value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/c" />
              </IndulgeField>
            </div>
            <IndulgeField label="Category" hint="Empty = available on every ticket">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All categories</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>
            <IndulgeField label="Body" htmlFor="cr-body" required>
              <Textarea
                id="cr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Dear {{client_name}}, …"
                required
              />
            </IndulgeField>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[#1A1A1A]">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className={CHECK} />
              Active
            </label>
            <ErrorBanner message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <IndulgeButton type="submit" variant="gold" loading={saving}>
                {editing ? "Save changes" : "Create"}
              </IndulgeButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Watchers panel ──────────────────────────────────────────────────────────────

function WatchersPanel({ initial }: { initial: WatcherAssignment[] }) {
  const [watchers, setWatchers] = useState<WatcherAssignment[]>(initial);

  async function refetch() {
    setWatchers(await listWatchers());
  }

  async function handleChange(id: string, groups: ConciergeGroup[]) {
    setWatchers((prev) => prev.map((w) => (w.id === id ? { ...w, groups } : w)));
    const res = await setWatcherQueendoms(id, groups);
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      await refetch();
      return;
    }
    toast.success("Watcher Queendoms updated");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B6B]">
        Watchers get <span className="font-medium">read-only</span> oversight of every ticket in the
        Queendoms you assign — across the normal isolation boundary. Set a user&rsquo;s department to
        Watcher in Admin → User Management, then choose their Queendoms here.
      </p>

      {watchers.length === 0 ? (
        <div
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "px-4 py-10 text-center text-sm text-[#6B6B6B]",
          )}
        >
          No watchers yet. Set a user&rsquo;s department to <span className="font-medium">Watcher</span> in
          User Management first, then they&rsquo;ll appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {watchers.map((w) => (
            <div key={w.id} className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
              <div className="mb-3">
                <p className="text-sm font-medium text-[#1A1A1A]">{w.full_name}</p>
                <p className="text-xs text-[#8A8A6E]">{w.email}</p>
              </div>
              <QueendomScopePicker value={w.groups} onChange={(g) => void handleChange(w.id, g)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────────

export function ConciergeSettingsClient({
  initialCategories,
  initialChecklists,
  initialCanned,
  initialWatchers,
}: {
  initialCategories: TicketCategory[];
  initialChecklists: TicketChecklistTemplate[];
  initialCanned: CannedResponse[];
  initialWatchers: WatcherAssignment[];
}) {
  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<TicketCategory[]>(initialCategories);

  const TABS: { key: Tab; label: string }[] = [
    { key: "categories", label: "Categories" },
    { key: "checklists", label: "Checklists" },
    { key: "canned", label: "Canned Responses" },
    { key: "watchers", label: "Watchers" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[#1A1A1A]">Ticket Settings</h1>
        <p className="text-sm text-[#6B6B6B]">
          Configure categories, checklists, and canned responses without touching code.
          SLA targets live under{" "}
          <a href="/concierge/tickets/sla-policies" className="font-medium text-brand-gold underline underline-offset-2">
            SLA Policies
          </a>
          .
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesPanel categories={categories} setCategories={setCategories} />}
      {tab === "checklists" && <ChecklistsPanel categories={categories} initial={initialChecklists} />}
      {tab === "canned" && <CannedPanel categories={categories} initial={initialCanned} />}
      {tab === "watchers" && <WatchersPanel initial={initialWatchers} />}
    </div>
  );
}
