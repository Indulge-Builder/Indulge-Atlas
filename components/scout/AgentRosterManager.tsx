"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import { toggleAgentLeaveStatus } from "@/lib/actions/roster";

type AgentRosterRow = {
  id: string;
  full_name: string;
  email: string;
  is_on_leave: boolean;
};

interface AgentRosterManagerProps {
  agents: AgentRosterRow[];
}

export function AgentRosterManager({ agents }: AgentRosterManagerProps) {
  const [rows, setRows] = useState(agents);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onToggle(agent: AgentRosterRow) {
    if (pendingId) return;
    const next = !agent.is_on_leave;

    setPendingId(agent.id);
    setRows((prev) =>
      prev.map((row) => (row.id === agent.id ? { ...row, is_on_leave: next } : row)),
    );

    startTransition(() => {
      void toggleAgentLeaveStatus(agent.id, next).then((result) => {
        setPendingId(null);
        if (result.success) {
          toast.success("Agent roster status updated");
          return;
        }

        setRows((prev) =>
          prev.map((row) => (row.id === agent.id ? { ...row, is_on_leave: agent.is_on_leave } : row)),
        );
        toast.error(result.error ?? "Failed to update roster status");
      });
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/80 shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <ul className="divide-y divide-stone-200/70">
        {rows.map((agent) => {
          const isPending = pendingId === agent.id;
          return (
            <li
              key={agent.id}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-stone-50/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 border border-stone-200/80">
                  <AvatarFallback className="bg-stone-100 text-xs font-medium text-stone-700">
                    {getInitials(agent.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{agent.full_name}</p>
                  <p className="truncate text-xs text-stone-500">{agent.email}</p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => onToggle(agent)}
                className={cn(
                  "min-w-[120px] border-stone-300/80 bg-white",
                  agent.is_on_leave
                    ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    : "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800",
                )}
              >
                {isPending ? "Updating..." : agent.is_on_leave ? "On Holiday" : "Active"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
