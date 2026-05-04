"use client";

import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AD_HOC_QUICK_TAG,
  PERSONAL_TASK_TAG_PRESETS_POPOVER,
} from "@/lib/constants/personalTaskTags";

export interface PersonalTaskTagControlsProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  customTag: string;
  onCustomTagChange: (value: string) => void;
  onAddCustomTag: () => void;
  tagsOpen: boolean;
  onTagsOpenChange: (open: boolean) => void;
  /** When false, Ad-hoc is only available inside the Tags popover presets. */
  showAdHocQuickButton?: boolean;
}

export function PersonalTaskTagControls({
  selectedTags,
  onToggleTag,
  customTag,
  onCustomTagChange,
  onAddCustomTag,
  tagsOpen,
  onTagsOpenChange,
  showAdHocQuickButton = true,
}: PersonalTaskTagControlsProps) {
  const adHocOn = selectedTags.includes(AD_HOC_QUICK_TAG);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showAdHocQuickButton && (
        <button
          type="button"
          onClick={() => onToggleTag(AD_HOC_QUICK_TAG)}
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            adHocOn
              ? "border-[#D4AF37] bg-[#FBF6E8] text-[#1A1A1A]"
              : "border-[#E0DBCF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D4AF37]/50 hover:text-[#1A1A1A]",
          )}
        >
          Ad-hoc
        </button>
      )}

      <Popover open={tagsOpen} onOpenChange={onTagsOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              selectedTags.length
                ? "border-[#D4AF37]/50 bg-[#FDF9EE] text-[#1A1A1A]"
                : "border-[#E0DBCF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D4AF37]/50",
            )}
          >
            <Hash className="h-3 w-3 shrink-0 text-[#A88B25]" aria-hidden />
            Tags{selectedTags.length ? ` (${selectedTags.length})` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B6B6B]">
            Quick tags
          </p>
          <div className="mb-2 flex flex-wrap gap-1">
            {!showAdHocQuickButton && (
              <button
                type="button"
                onClick={() => onToggleTag(AD_HOC_QUICK_TAG)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  selectedTags.includes(AD_HOC_QUICK_TAG)
                    ? "border-[#D4AF37] bg-[#FBF6E8] text-[#1A1A1A]"
                    : "border-[#E5E4DF] bg-white text-[#1A1A1A] hover:border-[#D4AF37]/50",
                )}
              >
                {AD_HOC_QUICK_TAG}
              </button>
            )}
            {PERSONAL_TASK_TAG_PRESETS_POPOVER.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  selectedTags.includes(tag)
                    ? "border-[#D4AF37] bg-[#FBF6E8] text-[#1A1A1A]"
                    : "border-[#E5E4DF] bg-white text-[#1A1A1A] hover:border-[#D4AF37]/50",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={customTag}
              onChange={(e) => onCustomTagChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddCustomTag();
                }
              }}
              placeholder="Custom tag…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#E5E4DF] bg-white px-2 text-[12px] text-[#1A1A1A] placeholder:text-[#8A8A6E] outline-none focus:border-[#D4AF37]"
            />
            <button
              type="button"
              onClick={onAddCustomTag}
              className="shrink-0 rounded-lg border border-[#E5E4DF] bg-white px-2 text-[11px] font-medium text-[#1A1A1A] hover:bg-[#F9F9F6]"
            >
              Add
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
