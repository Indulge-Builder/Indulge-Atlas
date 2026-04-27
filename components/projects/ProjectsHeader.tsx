"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

export function ProjectsHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-[#E5E4DF]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
          <FolderKanban className="w-5 h-5 text-[#D4AF37]" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold text-[#1A1A1A] leading-tight">
            Projects
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Collaborative workspaces for your team
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#0A0A0A] text-sm font-semibold hover:bg-[#C9A530] transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Project
      </button>

      <CreateProjectModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
