"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Loader2, Check } from "lucide-react";
import { reassignLead } from "@/lib/actions/leads";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Agent {
  id:        string;
  full_name: string;
}

interface InlineAgentSelectProps {
  leadId:            string;
  currentAgentId:    string | null;
  currentAgentName:  string;
  agents:            Agent[];
}

export function InlineAgentSelect({
  leadId,
  currentAgentId,
  currentAgentName,
  agents,
}: InlineAgentSelectProps) {
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [savedId, setSavedId]     = useState(currentAgentId);
  const [savedName, setSavedName] = useState(currentAgentName);
  const selectRef                 = useRef<HTMLSelectElement>(null);
  const router                    = useRouter();

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  async function handleChange(newId: string) {
    if (newId === savedId) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await reassignLead(leadId, newId);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to reassign lead.");
      setEditing(false);
      return;
    }

    const agent = agents.find((a) => a.id === newId);
    setSavedId(newId);
    setSavedName(agent?.full_name ?? "Unknown Agent");
    toast.success("Lead reassigned successfully.");
    setEditing(false);
    router.refresh();
  }

  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-[#9E9E9E]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Reassigning…
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <select
          ref={selectRef}
          defaultValue={savedId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          className={cn(
            "text-sm font-medium text-[#1A1A1A] bg-[#FAFAF8]",
            "border border-[#D4AF37]/50 rounded-lg px-2 py-1",
            "focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40",
            "cursor-pointer"
          )}
        >
          <option value="" disabled>Select agent…</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditing(false)}
          className="p-1 rounded text-[#9E9E9E] hover:text-[#1A1A1A] transition-colors"
          title="Cancel"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left"
      title="Double-click or click to reassign"
    >
      <span className="text-sm text-[#1A1A1A] font-medium">
        {savedName}
      </span>
      <Pencil
        className="w-3 h-3 text-[#B5A99A] opacity-0 group-hover:opacity-100
                   transition-opacity duration-150 shrink-0"
      />
    </button>
  );
}
