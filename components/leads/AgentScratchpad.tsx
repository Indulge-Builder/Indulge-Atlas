"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { saveAgentScratchpad } from "@/lib/actions/leads";

interface AgentScratchpadProps {
  leadId: string;
  initialValue: string | null;
}

const DEBOUNCE_MS = 1500;
const SUCCESS_VISIBLE_MS = 3000;

type SyncStatus = "idle" | "typing" | "saving" | "success";

function toPersisted(text: string): string {
  return text.trim() || "";
}

export function AgentScratchpad({
  leadId,
  initialValue,
}: AgentScratchpadProps) {
  const initial = initialValue ?? "";
  const [value, setValue] = useState(initial);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const valueRef = useRef(initial);
  const lastSyncedRef = useRef(toPersisted(initial));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const mountedRef = useRef(true);
  const leadIdRef = useRef(leadId);

  useEffect(() => {
    leadIdRef.current = leadId;
  }, [leadId]);

  // Reset when opening a different lead or server-provided note changes
  useEffect(() => {
    const next = initialValue ?? "";
    setValue(next);
    valueRef.current = next;
    lastSyncedRef.current = toPersisted(next);
    clearTimeout(debounceRef.current);
    clearTimeout(successTimerRef.current);
    debounceRef.current = undefined;
    successTimerRef.current = undefined;
    setSyncStatus("idle");
  }, [leadId, initialValue]);

  const clearDebounce = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, []);

  const scheduleSuccessToIdle = useCallback(() => {
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSyncStatus("idle");
    }, SUCCESS_VISIBLE_MS);
  }, []);

  const flushSaveRef = useRef<
    ((opts: { silent?: boolean }) => Promise<void>) | null
  >(null);

  const flushSave = useCallback(
    async (opts: { silent?: boolean }) => {
      clearDebounce();
      const id = leadIdRef.current;
      const text = valueRef.current;
      if (toPersisted(text) === lastSyncedRef.current) {
        if (!opts.silent && mountedRef.current) setSyncStatus("idle");
        return;
      }

      if (!opts.silent && mountedRef.current) setSyncStatus("saving");

      let result: Awaited<ReturnType<typeof saveAgentScratchpad>>;
      try {
        result = await saveAgentScratchpad(id, text);
      } catch {
        if (opts.silent) return;
        if (mountedRef.current) {
          toast.error(
            "Could not sync scratchpad (network or server). Your text is still here — try again.",
          );
          setSyncStatus("typing");
        }
        return;
      }

      if (opts.silent) {
        if (result.success) lastSyncedRef.current = toPersisted(text);
        return;
      }

      if (!mountedRef.current) return;

      if (result.success) {
        lastSyncedRef.current = toPersisted(text);
        if (toPersisted(valueRef.current) !== lastSyncedRef.current) {
          setSyncStatus("typing");
          debounceRef.current = setTimeout(() => {
            void flushSaveRef.current?.({});
          }, DEBOUNCE_MS);
        } else {
          setSyncStatus("success");
          scheduleSuccessToIdle();
        }
      } else {
        toast.error(result.error ?? "Couldn't save scratchpad");
        setSyncStatus("typing");
      }
    },
    [clearDebounce, scheduleSuccessToIdle],
  );

  flushSaveRef.current = flushSave;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearDebounce();
      clearTimeout(successTimerRef.current);
      void flushSaveRef.current?.({ silent: true });
    };
  }, [clearDebounce]);

  function handleChange(text: string) {
    setValue(text);
    valueRef.current = text;
    clearDebounce();
    clearTimeout(successTimerRef.current);

    if (toPersisted(text) === lastSyncedRef.current) {
      setSyncStatus("idle");
      return;
    }

    setSyncStatus("typing");
    debounceRef.current = setTimeout(() => {
      void flushSaveRef.current?.({});
    }, DEBOUNCE_MS);
  }

  function handleBlur() {
    void flushSaveRef.current?.({});
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
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.4) 40%, rgba(212,175,55,0.4) 60%, transparent 100%)",
        }}
      />

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-white/4 flex items-center justify-center">
            <Lock className="w-3 h-3 text-[#7A6A55]" />
          </div>
          <span className="text-[10px] font-semibold text-[#7A6A55] uppercase tracking-widest">
            Private Scratchpad
          </span>
        </div>

        <div className="rounded-lg shadow-inner overflow-hidden relative">
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Your private notes — objections, conversation details."
            rows={1}
            className="w-full max-h-64 min-h-[9rem] resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-[#1A1A1A] [field-sizing:content] focus:outline-none placeholder:text-[#3A3228] selection:bg-[#D4AF37]/20"
            style={{
              fontFamily:
                "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
              background: "#F2F2EE",
            }}
          />
          {syncStatus !== "idle" && (
            <div
              className="flex justify-end px-3 pb-2 pt-0"
              aria-live="polite"
            >
              {syncStatus === "typing" && (
                <span className="text-stone-400 text-xs italic">
                  Unsaved changes...
                </span>
              )}
              {syncStatus === "saving" && (
                <span className="text-stone-500 text-xs animate-pulse">
                  Saving...
                </span>
              )}
              {syncStatus === "success" && (
                <span className="text-stone-400 text-xs animate-in fade-in duration-300">
                  Saved just now
                </span>
              )}
            </div>
          )}
        </div>

        <p className="text-[9px] text-[#3A3228] mt-2 uppercase tracking-widest">
          Visible only to you · syncs when you pause
        </p>
      </div>
    </div>
  );
}
