"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, GripVertical, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateSubTaskChecklist } from "@/lib/actions/tasks";
import type { ChecklistItem } from "@/lib/types/database";

interface TaskChecklistProps {
  taskId: string;
  initialItems: ChecklistItem[];
  editable?: boolean;
}

export function TaskChecklist({ taskId, initialItems, editable = false }: TaskChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [expanded, setExpanded] = useState(false);
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const PREVIEW_COUNT = 5;
  const hasMore = items.length > PREVIEW_COUNT;
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);

  const completedCount = items.filter((i) => i.checked).length;

  async function saveItems(updated: ChecklistItem[]) {
    setSaving(true);
    try {
      await updateSubTaskChecklist(taskId, updated);
    } finally {
      setSaving(false);
    }
  }

  function toggleItem(id: string) {
    const updated = items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    );
    setItems(updated);
    saveItems(updated);
  }

  function deleteItem(id: string) {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    saveItems(updated);
  }

  function addItem() {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const updated: ChecklistItem[] = [
      ...items,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: trimmed, checked: false },
    ];
    setItems(updated);
    setNewText("");
    saveItems(updated);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      {/* Progress summary */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1 rounded-full bg-[#E5E4DF] overflow-hidden">
            <motion.div
              className="h-full bg-[#D4AF37] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-[11px] text-[#8A8A6E] font-medium shrink-0 tabular-nums">
            {completedCount}/{items.length}
          </span>
          {saving && (
            <span className="text-[10px] text-[#B5A99A] animate-pulse">saving…</span>
          )}
        </div>
      )}

      {/* Item list */}
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {visible.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChecklistRow
                item={item}
                editable={editable}
                onToggle={() => toggleItem(item.id)}
                onDelete={() => deleteItem(item.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Show more / less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-[12px] text-[#8A8A6E] hover:text-[#D4AF37] transition-colors"
        >
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
          {expanded ? "Show fewer items" : `Show all ${items.length} items`}
        </button>
      )}

      {/* Add item (edit mode only) */}
      {editable && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#E5E4DF]">
          <div
            className="w-4 h-4 rounded flex-shrink-0 border border-[#E5E4DF]"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addItem(); }
            }}
            placeholder="Add an action item…"
            className="flex-1 text-[13px] text-[#1A1A1A] placeholder:text-[#B5A99A] bg-transparent outline-none border-none"
          />
          {newText.trim() && (
            <button
              type="button"
              onClick={addItem}
              className="p-1 rounded hover:bg-[#D4AF37]/10 text-[#D4AF37] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !editable && (
        <p className="text-[12px] text-[#B5A99A] italic">No action items defined.</p>
      )}
    </div>
  );
}

// ── Single checklist row ───────────────────────────────────────────────────────

interface ChecklistRowProps {
  item: ChecklistItem;
  editable: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function ChecklistRow({ item, editable, onToggle, onDelete }: ChecklistRowProps) {
  return (
    <div className="group flex items-start gap-2.5 py-0.5">
      {editable && (
        <div className="mt-0.5 cursor-grab text-[#D0C8BE] opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Custom animated checkbox — read-only surfaces use a static div (no actions). */}
      {editable ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all duration-[120ms] ease-in-out",
            item.checked
              ? "bg-[#D4AF37] border-[#D4AF37]"
              : "border-[#D0C8BE] hover:border-[#D4AF37] bg-transparent",
          )}
          aria-label={item.checked ? "Mark incomplete" : "Mark complete"}
          aria-checked={item.checked}
          role="checkbox"
        >
          <AnimatePresence>
            {item.checked && (
              <motion.svg
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                viewBox="0 0 10 8"
                className="w-2.5 h-2 text-white"
                fill="none"
              >
                <path
                  d="M1 4l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </button>
      ) : (
        <div
          className={cn(
            "mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center pointer-events-none",
            item.checked ? "bg-[#D4AF37] border-[#D4AF37]" : "border-[#D0C8BE] bg-transparent",
          )}
          aria-hidden
        >
          {item.checked && (
            <svg viewBox="0 0 10 8" className="w-2.5 h-2 text-white" fill="none">
              <path
                d="M1 4l3 3 5-6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}

      {/* Text */}
      <span
        className={cn(
          "flex-1 text-[13px] leading-relaxed transition-all duration-[120ms]",
          item.checked
            ? "line-through text-[#B5A99A]"
            : "text-[#1A1A1A]",
        )}
      >
        {item.text}
      </span>

      {/* Delete (edit mode hover) */}
      {editable && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-[#B5A99A] hover:text-[#C0392B] transition-all"
          aria-label="Delete item"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
