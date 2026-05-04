"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { updateLeadDemographics } from "@/lib/actions/leads";

interface InlinePersonaEditProps {
  leadId:       string;
  initialValue: string | null;
}

type SaveState = "idle" | "saving" | "saved";

export function InlinePersonaEdit({ leadId, initialValue }: InlinePersonaEditProps) {
  const [value,     setValue]     = useState(initialValue ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedRef     = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(savedRef.current);
    };
  }, []);

  // Auto-expand height to fit content
  const fitHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Run on mount so initial content is fully visible
  useEffect(() => { fitHeight(); }, [fitHeight]);

  function handleChange(text: string) {
    setValue(text);
    fitHeight();

    clearTimeout(timerRef.current);
    clearTimeout(savedRef.current);
    setSaveState("idle");

    timerRef.current = setTimeout(async () => {
      setSaveState("saving");
      await updateLeadDemographics(leadId, {
        personal_details: text.trim() || null,
      });
      setSaveState("saved");
      savedRef.current = setTimeout(() => setSaveState("idle"), 2500);
    }, 700);
  }

  return (
    <div className="mt-4">
      {/* Label row + live save indicator */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#8A8A6E]" />
          <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">
            Client Persona &amp; Interests
          </p>
        </div>

        <div className="flex items-center gap-1 min-w-[52px] justify-end h-4">
          {saveState === "saving" && (
            <span className="flex items-center gap-1 text-[10px] text-[#9E9E9E] animate-fade-in">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Saving
            </span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-[10px] text-[#4A7C59] animate-fade-in">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Always-active auto-expanding textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="e.g. Collector of vintage watches, interested in superyacht charters, prefers bespoke concierge services…"
        rows={3}
        className="w-full text-sm text-[#1A1A1A] bg-[#F9F9F6] rounded-lg p-3
                   border border-[#E5E4DF] leading-relaxed resize-none overflow-hidden
                   focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40
                   focus:border-[#D4AF37]/40 transition-colors
                   placeholder:text-[#C8C0B8] placeholder:italic
                   min-h-[80px]"
      />
    </div>
  );
}
