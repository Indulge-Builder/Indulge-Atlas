"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TicketTagsInputProps } from "@/components/concierge/tickets/panelTypes";

const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

/**
 * Freshdesk-style multi-tag chip input. Renders the chips + inline typing input
 * (+ optional preset chips) only — the parent supplies the IndulgeField label.
 *
 * Rules enforced before every onChange: trim, ignore empty, cap length at 40
 * chars, case-insensitive dedupe (display casing preserved), and cap the total
 * at 20 tags.
 */
export function TicketTagsInput({
  value,
  onChange,
  presets,
}: TicketTagsInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const hasTag = (candidate: string) => {
    const lower = candidate.toLowerCase();
    return value.some((tag) => tag.toLowerCase() === lower);
  };

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.length >= MAX_TAGS) return;
    const capped = trimmed.slice(0, MAX_TAG_LENGTH);
    if (hasTag(capped)) return;
    onChange([...value, capped]);
  };

  const removeTagAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const commitDraft = () => {
    addTag(draft);
    setDraft("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      event.preventDefault();
      removeTagAt(value.length - 1);
    }
  };

  const availablePresets = (presets ?? []).filter(
    (preset) => preset.trim().length > 0 && !hasTag(preset.trim()),
  );

  const atCapacity = value.length >= MAX_TAGS;

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1.5",
          "transition-colors focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/20",
        )}
      >
        {value.map((tag, index) => (
          <span
            key={`${tag.toLowerCase()}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-brand-gold/10 px-2 py-0.5 text-xs font-medium text-brand-gold"
          >
            {tag}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeTagAt(index);
              }}
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 text-brand-gold/60 transition-colors hover:bg-brand-gold/20 hover:text-brand-gold"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          maxLength={MAX_TAG_LENGTH}
          disabled={atCapacity}
          aria-label="Add tag"
          placeholder={
            atCapacity
              ? "Tag limit reached"
              : value.length === 0
                ? "Add tags…"
                : ""
          }
          className="h-6 min-w-28 flex-1 border-0 bg-transparent px-0.5 py-0 text-sm shadow-none focus:border-transparent focus:ring-0"
        />
      </div>

      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availablePresets.map((preset) => (
            <button
              key={preset.toLowerCase()}
              type="button"
              onClick={() => addTag(preset)}
              disabled={atCapacity}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-200 px-2 py-0.5 text-xs text-neutral-600",
                "transition-colors hover:border-brand-gold/40 hover:text-brand-gold",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:text-neutral-600",
              )}
            >
              <Plus className="h-3 w-3" />
              {preset.trim()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
