"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { updateLeadEmail } from "@/lib/actions/leads";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface InlineEmailEditProps {
  leadId:       string;
  currentEmail: string | null;
}

export function InlineEmailEdit({ leadId, currentEmail }: InlineEmailEditProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(currentEmail ?? "");
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  const router                = useRouter();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleCancel() {
    setValue(currentEmail ?? "");
    setEditing(false);
  }

  async function handleSave() {
    const trimmed = value.trim();

    if (trimmed === (currentEmail ?? "")) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await updateLeadEmail(leadId, trimmed);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to update email.");
      return;
    }

    toast.success("Email updated.");
    setEditing(false);
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-0.5">
        <input
          ref={inputRef}
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter email address"
          disabled={saving}
          className={cn(
            "text-sm font-medium text-[#1A1A1A] bg-[#FAFAF8]",
            "border border-[#D4AF37]/50 rounded-lg px-2 py-0.5",
            "focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40",
            "w-[200px] min-w-0"
          )}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-1 rounded text-[#4A7C59] hover:bg-[#EBF4EF] transition-colors"
          title="Save"
        >
          {saving
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Check className="w-3 h-3" />
          }
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="p-1 rounded text-[#9E9E9E] hover:bg-[#F4F4F0] transition-colors"
          title="Cancel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 mt-0.5"
      title="Click to edit email"
    >
      <span
        className={cn(
          "text-sm font-medium",
          currentEmail ? "text-[#1A1A1A]" : "text-[#B5A99A] italic"
        )}
      >
        {currentEmail || "Add email address"}
      </span>
      <Pencil
        className="w-3 h-3 text-[#B5A99A] opacity-0 group-hover:opacity-100
                   transition-opacity duration-150 shrink-0"
      />
    </button>
  );
}
