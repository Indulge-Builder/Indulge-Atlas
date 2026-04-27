"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportWizard } from "./ImportWizard";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";

interface ImportWizardShellProps {
  masterTasks:         Array<{ id: string; title: string }>;
  defaultMasterTaskId?: string;
}

export function ImportWizardShell({
  masterTasks,
  defaultMasterTaskId,
}: ImportWizardShellProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(
    defaultMasterTaskId ?? masterTasks[0]?.id ?? "",
  );

  const selectedTask = masterTasks.find((t) => t.id === selectedId);

  if (masterTasks.length === 0) {
    return (
      <div className={cn(surfaceCardVariants({ tone: "subtle", elevation: "sm" }), "p-8 text-center")}>
        <p className="font-serif text-lg font-semibold text-zinc-700 mb-2">
          No master tasks available
        </p>
        <p className="text-sm text-zinc-500 mb-4">
          You need to create a master task before importing sub-tasks.
        </p>
        <IndulgeButton variant="gold" size="sm" onClick={() => router.push("/tasks")}>
          Go to Atlas Tasks
        </IndulgeButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master task selector */}
      <div className={cn(surfaceCardVariants({ tone: "subtle", elevation: "sm" }), "p-4 space-y-2")}>
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Import into Master Task
        </label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select a master task…" />
          </SelectTrigger>
          <SelectContent>
            {masterTasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Wizard */}
      {selectedId && selectedTask && (
        <ImportWizard
          masterTaskId={selectedId}
          masterTaskTitle={selectedTask.title}
        />
      )}
    </div>
  );
}
