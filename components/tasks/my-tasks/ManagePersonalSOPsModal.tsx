"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import {
  createPersonalSOPTemplate,
  deletePersonalSOPTemplate,
  getPersonalSOPTemplates,
  type PersonalSOPTemplateRow,
} from "@/lib/actions/tasks";

interface ManagePersonalSOPsModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after templates or instances may have changed (refresh daily strip). */
  onApplied?: () => void;
}

export function ManagePersonalSOPsModal({ open, onClose, onApplied }: ManagePersonalSOPsModalProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PersonalSOPTemplateRow[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPersonalSOPTemplates();
    setLoading(false);
    if (!res.success) {
      toast.error(res.error ?? "Could not load your daily checklist.");
      return;
    }
    setRows(res.data ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  function addTemplate() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createPersonalSOPTemplate({ title: trimmed });
      if (!res.success) {
        toast.error(res.error ?? "Could not add item.");
        return;
      }
      setDraft("");
      toast.success("Added to your daily checklist.");
      await load();
      onApplied?.();
    });
  }

  function removeRow(id: string) {
    startTransition(async () => {
      const res = await deletePersonalSOPTemplate(id);
      if (!res.success) {
        toast.error(res.error ?? "Could not remove.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Removed.");
      onApplied?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-[#E5E4DF] bg-[#FAFAF8] px-5 py-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-serif text-lg text-[#1A1A1A]">Daily checklist</DialogTitle>
            <p className="text-[12px] font-normal text-[#8A8A6E]">
              Items you add here repeat each day on My Tasks.
            </p>
          </DialogHeader>
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-8 text-center text-[13px] text-[#8A8A6E]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#8A8A6E]">
              No checklist lines yet. Add one below.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-2 hover:border-[#E5E4DF] hover:bg-white"
                >
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-[#1A1A1A]">{r.title}</span>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    disabled={isPending}
                    className="shrink-0 rounded-lg p-2 text-[#B5A99A] opacity-70 transition-colors hover:bg-[#FDF2F2] hover:text-[#C0392B] hover:opacity-100 disabled:opacity-40"
                    aria-label={`Remove ${r.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-[#E5E4DF] bg-white px-5 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTemplate();
                }
              }}
              placeholder="Add a daily checklist item…"
              disabled={isPending}
              className="h-10 min-w-0 flex-1 rounded-lg border border-[#E5E4DF] bg-[#FAFAF8] px-3 text-[13px] text-[#1A1A1A] outline-none transition-colors placeholder:text-[#B5A99A] focus:border-[#D4AF37]/60"
            />
            <IndulgeButton
              type="button"
              variant="gold"
              size="sm"
              className="shrink-0"
              loading={isPending}
              disabled={!draft.trim()}
              onClick={addTemplate}
            >
              Add
            </IndulgeButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
