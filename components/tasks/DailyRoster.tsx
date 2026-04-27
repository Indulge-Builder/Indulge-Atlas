"use client";

import { useState } from "react";
import Link from "next/link";
import { formatIST } from "@/lib/utils/time";
import { toast } from "sonner";
import { completeTask, type AgentDailyRoster, type DailyRosterTask } from "@/lib/actions/tasks";
import { dispatchTaskAlertRefresh } from "@/lib/task-alert-refresh";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function domainLabel(domain: string | undefined) {
  if (!domain) return "—";
  return DOMAIN_DISPLAY_CONFIG[domain]?.shortLabel ?? domain.replace(/^indulge_/, "");
}

function RosterCard({ task, accent }: { task: DailyRosterTask; accent: "rose" | "neutral" | "muted" }) {
  const [hidden, setHidden] = useState(false);

  const lead = task.lead;
  const name = lead
    ? `${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""}`.trim()
    : "No lead";

  async function onComplete() {
    setHidden(true);
    const result = await completeTask(task.id);
    if (!result.success) {
      setHidden(false);
      toast.error(result.error ?? "Could not complete task");
    } else {
      dispatchTaskAlertRefresh(
        accent === "rose" ? { action: "decrement" } : { action: "fetch" },
      );
    }
  }

  if (hidden) return null;

  const dueTime = task.due_date
    ? formatIST(task.due_date, "h:mm a")
    : "—";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5 transition-colors",
        accent === "rose" && "border-rose-200/80 bg-rose-50/40",
        accent === "neutral" && "border-stone-200/90 bg-[#FBFBF9]",
        accent === "muted" && "border-stone-200/60 bg-stone-50/50",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          {lead ? (
            <Link
              href={`/leads/${lead.id}`}
              className="block font-medium text-stone-900 hover:text-stone-700"
            >
              {name}
              <span className="ml-2 text-xs font-normal text-stone-500">
                · {domainLabel(lead.domain)}
              </span>
            </Link>
          ) : (
            <p className="font-medium text-stone-900">{name}</p>
          )}
          <p className="text-sm text-stone-600">{task.title}</p>
          <p className="text-xs text-stone-500">{dueTime}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-stone-300/80 text-stone-700 hover:bg-stone-100"
          onClick={() => void onComplete()}
        >
          Mark complete
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("font-serif text-base font-medium tracking-tight text-stone-900", className)}>
      {children}
    </h3>
  );
}

interface DailyRosterProps {
  roster: AgentDailyRoster;
}

export function DailyRoster({ roster }: DailyRosterProps) {
  const { overdue, today, upcoming } = roster;

  return (
    <section id="daily-roster" className="scroll-mt-6 space-y-8">
      <div>
        <h2 className="font-serif text-xl font-medium tracking-tight text-stone-900">
          Daily roster
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Follow-ups in India Standard Time, grouped by urgency.
        </p>
      </div>

      {overdue.length > 0 && (
        <div className="space-y-3">
          <SectionTitle className="text-rose-900/90">Overdue</SectionTitle>
          <div className="space-y-2.5">
            {overdue.map((t) => (
              <RosterCard key={t.id} task={t} accent="rose" />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle>Today&apos;s priorities</SectionTitle>
        {today.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200/80 bg-stone-50/30 px-4 py-8 text-center text-sm text-stone-500">
            Nothing else due today. You&apos;re clear.
          </p>
        ) : (
          <div className="space-y-2.5">
            {today.map((t) => (
              <RosterCard key={t.id} task={t} accent="neutral" />
            ))}
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <Accordion type="single" collapsible className="rounded-xl border border-stone-200/70 bg-white/40 px-4">
          <AccordionItem value="upcoming" className="border-0">
            <AccordionTrigger className="text-stone-500 hover:text-stone-700">
              Upcoming ({upcoming.length})
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2.5 pt-1">
                {upcoming.map((t) => (
                  <RosterCard key={t.id} task={t} accent="muted" />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
}
