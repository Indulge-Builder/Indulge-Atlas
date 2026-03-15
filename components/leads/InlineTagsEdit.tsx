"use client";

import { useState, useRef, useCallback } from "react";
import { Tag, Loader2, X } from "lucide-react";
import { updateLeadTags } from "@/lib/actions/leads";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface InlineTagsEditProps {
  leadId:     string;
  initialTags: string[];
}

export function InlineTagsEdit({ leadId, initialTags }: InlineTagsEditProps) {
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const saveTags = useCallback(
    async (newTags: string[]) => {
      setSaving(true);
      const result = await updateLeadTags(leadId, newTags);
      setSaving(false);
      if (!result.success) {
        toast.error(result.error ?? "Failed to update tags.");
        setTags(initialTags);
        return;
      }
      toast.success("Tags updated.");
      setTags(newTags);
      router.refresh();
    },
    [leadId, initialTags, router]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = input.trim().toLowerCase();
      if (!trimmed) return;
      if (tags.includes(trimmed)) {
        setInput("");
        return;
      }
      const next = [...tags, trimmed];
      setTags(next);
      setInput("");
      saveTags(next);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      const next = tags.slice(0, -1);
      setTags(next);
      saveTags(next);
    }
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    saveTags(next);
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[#F2F2EE] flex items-center justify-center shrink-0 mt-0.5">
        <Tag className="w-3.5 h-3.5 text-[#8A8A6E]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium mb-1.5">
          Tags
        </p>
        <div
          className={cn(
            "flex flex-wrap gap-1.5 items-center",
            "min-h-[32px] px-2.5 py-1.5 rounded-lg",
            "bg-[#FAFAF8] border border-[#E5E4DF]",
            "focus-within:border-[#D4AF37]/40 focus-within:ring-1 focus-within:ring-[#D4AF37]/20"
          )}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
                "bg-[#1A1A1A]/8 text-[#4A4A4A] text-xs font-medium"
              )}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="opacity-60 hover:opacity-100 transition-opacity p-0.5 -mr-0.5 rounded"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type tag, press Enter…"
            disabled={saving}
            className={cn(
              "flex-1 min-w-[120px] bg-transparent border-none outline-none",
              "text-sm text-[#1A1A1A] placeholder:text-[#9E9E9E]",
              "py-0.5"
            )}
          />
          {saving && (
            <Loader2 className="w-3.5 h-3.5 text-[#B5A99A] animate-spin shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
