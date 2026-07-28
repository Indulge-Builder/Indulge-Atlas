"use client";

/**
 * ScenarioPicker — the intern's "choose a drill" surface.
 *
 * Renders the safe scenario cards (no seed secrets ever reach the client),
 * grouped by Indulge vertical. Clicking a card opens a fresh training session
 * via `startAcademySession` and routes straight into the chat.
 *
 * Design: Atlas tokens only — no hardcoded hex, no WhatsApp brand language.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Shuffle,
} from "lucide-react";
import { startAcademySession } from "@/lib/actions/academy";
import { ACADEMY_VERTICALS } from "@/lib/types/database";
import type {
  AcademyDifficulty,
  AcademyScenarioCard,
  AcademyVertical,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";

const DIFFICULTY_PILL: Record<AcademyDifficulty, string> = {
  easy: "bg-success-light text-success",
  medium: "bg-warning-light text-warning",
  hard: "bg-danger-light text-danger",
};

const DIFFICULTY_LABEL: Record<AcademyDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

interface VerticalGroup {
  vertical: string;
  items: AcademyScenarioCard[];
}

/** Group in the canonical vertical order; anything unknown falls to the end. */
function groupByVertical(scenarios: AcademyScenarioCard[]): VerticalGroup[] {
  const known = new Set<string>(ACADEMY_VERTICALS as string[]);

  const groups: VerticalGroup[] = (ACADEMY_VERTICALS as AcademyVertical[])
    .map((vertical) => ({
      vertical: vertical as string,
      items: scenarios.filter((s) => s.vertical === vertical),
    }))
    .filter((g) => g.items.length > 0);

  const orphans = scenarios.filter((s) => !known.has(s.vertical as string));
  if (orphans.length > 0) {
    groups.push({ vertical: "Other", items: orphans });
  }

  return groups;
}

/** Fisher-Yates on a copy — never mutates the caller's array. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function ScenarioPicker({
  scenarios,
}: {
  scenarios: AcademyScenarioCard[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * Bumping this reshuffles. Starts at 0 so the first server-rendered paint
   * matches the client's — reshuffling during hydration would be a mismatch.
   */
  const [shuffleKey, setShuffleKey] = useState(0);

  const ordered = useMemo(
    () => (shuffleKey === 0 ? scenarios : shuffled(scenarios)),
    // Re-run on every bump; `shuffled` is intentionally impure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarios, shuffleKey],
  );

  const groups = useMemo(() => groupByVertical(ordered), [ordered]);

  /** Drop the intern straight into a random drill — no browsing, no bias. */
  function handleSurprise() {
    if (isPending || scenarios.length === 0) return;
    const pick = scenarios[Math.floor(Math.random() * scenarios.length)];
    handleStart(pick.id);
  }

  function handleStart(seedId: string) {
    if (isPending) return;
    setPendingId(seedId);

    startTransition(async () => {
      const res = await startAcademySession(seedId);
      if (!res.success || !res.data) {
        toast.error(
          res.success ? "Could not start session" : res.error,
        );
        setPendingId(null);
        return;
      }
      router.push(`/academy/session/${res.data.sessionId}`);
    });
  }

  if (scenarios.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-8 text-center">
        <MessageSquareText
          className="mx-auto h-5 w-5 text-black/25"
          aria-hidden
        />
        <p className="mt-3 font-serif text-[15px] text-black/70">
          No scenarios are live yet
        </p>
        <p className="mt-1 text-[13px] text-black/45">
          A trainer needs to publish at least one active scenario before
          sessions can begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Shuffle controls — variety is the point of a drill library. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSurprise}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-3.5 py-2 text-[13px] font-medium text-surface transition-colors hover:bg-brand-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Shuffle className="h-3.5 w-3.5" aria-hidden />
          Surprise me
        </button>
        <button
          type="button"
          onClick={() => setShuffleKey((k) => k + 1)}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3.5 py-2 text-[13px] font-medium text-black/65 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Shuffle order
        </button>
        <span className="text-[12px] text-black/40">
          {scenarios.length} scenarios available
        </span>
      </div>

      {groups.map((group) => (
        <section key={group.vertical}>
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              {group.vertical}
            </h3>
            <div className="h-px flex-1 bg-surface-border" />
            <span className="text-[11px] tabular-nums text-black/30">
              {group.items.length}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {group.items.map((scenario) => {
              const thisPending = pendingId === scenario.id && isPending;
              const otherPending = isPending && !thisPending;

              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleStart(scenario.id)}
                  disabled={isPending}
                  aria-busy={thisPending}
                  className={cn(
                    "group flex w-full flex-col items-start gap-2.5 rounded-xl border bg-white p-4 text-left",
                    "transition-[border-color,box-shadow,transform] duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2",
                    thisPending
                      ? "border-brand-gold/60 shadow-card"
                      : "border-surface-border hover:-translate-y-px hover:border-brand-gold/40 hover:shadow-card",
                    otherPending && "cursor-not-allowed opacity-50",
                    isPending && "cursor-wait",
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <span className="font-serif text-[15px] leading-snug text-black/85">
                      {scenario.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                        DIFFICULTY_PILL[scenario.difficulty] ??
                          "bg-surface-subtle text-black/50",
                      )}
                    >
                      {DIFFICULTY_LABEL[scenario.difficulty] ??
                        scenario.difficulty}
                    </span>
                  </div>

                  <p className="text-[13px] leading-relaxed text-black/50">
                    {scenario.archetype}
                  </p>

                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium",
                      thisPending
                        ? "text-brand-gold"
                        : "text-black/35 group-hover:text-brand-gold",
                    )}
                  >
                    {thisPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        Opening session…
                      </>
                    ) : (
                      <>
                        Begin session
                        <ArrowRight
                          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
