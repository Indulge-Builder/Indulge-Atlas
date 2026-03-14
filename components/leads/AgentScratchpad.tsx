"use client";

import { useState, useRef, useEffect } from "react";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { saveAgentScratchpad } from "@/lib/actions/leads";

interface AgentScratchpadProps {
  leadId: string;
  initialValue: string | null;
}

type SaveState = "idle" | "saving" | "saved";

export function AgentScratchpad({
  leadId,
  initialValue,
}: AgentScratchpadProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(savedTimerRef.current);
    };
  }, []);

  function handleChange(text: string) {
    setValue(text);
    clearTimeout(timerRef.current);
    clearTimeout(savedTimerRef.current);

    setSaveState("idle");

    timerRef.current = setTimeout(async () => {
      setSaveState("saving");
      await saveAgentScratchpad(leadId, text);
      setSaveState("saved");

      savedTimerRef.current = setTimeout(() => {
        setSaveState("idle");
      }, 2500);
    }, 700);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "white",
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255,255,255,0.012) 2px,
            rgba(255,255,255,0.012) 4px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 3px,
            rgba(255,255,255,0.008) 3px,
            rgba(255,255,255,0.008) 6px
          )
        `,
      }}
    >
      {/* Delicate gold accent hairline */}
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.4) 40%, rgba(212,175,55,0.4) 60%, transparent 100%)",
        }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center">
              <Lock className="w-3 h-3 text-[#7A6A55]" />
            </div>
            <span className="text-[10px] font-semibold text-[#7A6A55] uppercase tracking-widest">
              Private Scratchpad
            </span>
          </div>

          {/* Save indicator */}
          <div className="flex items-center gap-1.5 min-w-[60px] justify-end">
            {saveState === "saving" && (
              <span className="flex items-center gap-1 text-[10px] text-[#5A4E44]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving
              </span>
            )}
            {saveState === "saved" && (
              <span className="flex items-center gap-1 text-[10px] text-[#4A7A50]">
                <CheckCircle2 className="w-3 h-3" />
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Textarea — inset shadow gives depth of an ink-pressed page */}
        <div
          className="rounded-lg shadow-inner overflow-hidden"
          style={{ background: "#F2F2EE" }}
        >
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Your private notes — objections, conversation details."
            rows={6}
            className="w-full bg-transparent text-[#1A1A1A] text-[13px] leading-relaxed
                       resize-none focus:outline-none px-3 py-2.5
                       placeholder:text-[#3A3228]
                       selection:bg-[#D4AF37]/20"
            style={{
              fontFamily:
                "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
            }}
          />
        </div>

        {/* Footer note */}
        <p className="text-[9px] text-[#3A3228] mt-2 uppercase tracking-widest">
          Visible only to you · auto-saves
        </p>
      </div>
    </div>
  );
}
