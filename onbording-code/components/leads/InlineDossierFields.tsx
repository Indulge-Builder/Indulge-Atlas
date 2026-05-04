"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Loader2 } from "lucide-react";
import { updateLeadDemographics } from "@/lib/actions/leads";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ── InlineCompanyEdit ─────────────────────────────────────────────────────────
// Double-click-to-edit pattern, mirrors InlineCityEdit.

interface InlineCompanyEditProps {
  leadId:         string;
  currentCompany: string | null;
}

export function InlineCompanyEdit({ leadId, currentCompany }: InlineCompanyEditProps) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(currentCompany ?? "");
  const [saving,  setSaving]  = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  const router                = useRouter();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function handleSave() {
    const trimmed = value.trim();
    if (trimmed === (currentCompany ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateLeadDemographics(leadId, { company: trimmed || null });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to update company.");
      setValue(currentCompany ?? "");
      setEditing(false);
      return;
    }
    toast.success("Company updated.");
    setEditing(false);
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  handleSave();
    if (e.key === "Escape") { setValue(currentCompany ?? ""); setEditing(false); }
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[#F2F2EE] flex items-center justify-center shrink-0 mt-0.5">
        <Building2 className="w-3.5 h-3.5 text-[#8A8A6E]" />
      </div>
      <div>
        <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">Company</p>

        {editing ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              placeholder="e.g. Apex Holdings"
              disabled={saving}
              className={cn(
                "text-sm font-medium text-[#1A1A1A] bg-[#FAFAF8]",
                "border border-[#D4AF37]/50 rounded-lg px-2 py-0.5",
                "focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40",
                "w-[180px] min-w-0"
              )}
            />
            {saving && <Loader2 className="w-3 h-3 text-[#B5A99A] animate-spin shrink-0" />}
          </div>
        ) : (
          <p
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
            className="text-sm font-medium mt-0.5 cursor-text select-none"
          >
            {currentCompany
              ? <span className="text-[#1A1A1A]">{currentCompany}</span>
              : <span className="text-[#C8C0B8] italic text-xs">Double-click to add company</span>
            }
          </p>
        )}
      </div>
    </div>
  );
}

