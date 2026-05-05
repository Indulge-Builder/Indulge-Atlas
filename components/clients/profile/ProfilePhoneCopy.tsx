"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatPhoneForDisplay } from "@/lib/utils/format-phone-display";
import { cn } from "@/lib/utils";

export function ProfilePhoneCopy({ rawPhone }: { rawPhone: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const trimmed = rawPhone?.trim() ?? "";
  if (!trimmed) {
    return (
      <span className="text-[12px] font-normal italic text-[#C4BEB8]">Not provided</span>
    );
  }

  const display = formatPhoneForDisplay(trimmed);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <span className="flex items-start justify-between gap-3">
      <span className="text-[13px] font-normal leading-[1.5] text-[#1C1917]">{display}</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          "mt-0.5 shrink-0 cursor-pointer rounded p-0.5 transition-colors",
          copied ? "text-[#D4AF37]" : "text-[#D4AF3760] hover:text-[#D4AF37]",
        )}
        aria-label={copied ? "Copied" : "Copy phone number"}
      >
        {copied ? (
          <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
        )}
      </button>
    </span>
  );
}
