/**
 * AcademyReport — the end-of-session review surface.
 *
 * Server-safe by design: everything here renders without JS. The transcript
 * collapses via a native `<details>` element rather than client state, so this
 * component can be streamed straight from an RSC with no hydration cost.
 *
 * Visual language is built entirely from Atlas `@theme inline` tokens
 * (brand-gold / surface / taupe / success / warning / danger). No hex literals,
 * no WhatsApp brand assets — the chat *layout* is borrowed, the palette is not.
 */

import type { JSX, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareQuote,
  MessagesSquare,
  Sparkles,
} from "lucide-react";

import { ACADEMY_DIMENSIONS, clampScore, computeOverall } from "@/lib/academy/rubric";
import type {
  AcademyDimensionScore,
  AcademyScenarioCard,
  TrainingReview,
  TrainingTurn,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/utils/time";

import { AcademyBubble } from "./AcademyBubble";

// ── Formatters ────────────────────────────────────────────────────────────────

/** Overall is a 1-decimal mean; dimensions are whole 1–5 integers. */
const overallFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const MAX_SCORE = 5;

/** `formatIST` throws on malformed timestamps — never let that break the report. */
function safeIST(value: string | null | undefined, pattern: string): string | null {
  if (!value || !value.trim()) return null;
  try {
    return formatIST(value, pattern);
  } catch {
    return null;
  }
}

function cleanList(items: string[] | null | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

// ── Qualitative band ──────────────────────────────────────────────────────────

interface ScoreBand {
  label: string;
  /** Pill treatment. */
  pill: string;
  /** Thin accent rule under the numeric score. */
  rule: string;
}

function bandFor(overall: number): ScoreBand {
  if (overall <= 2) {
    return {
      label: "Needs work",
      pill: "bg-danger-light text-danger ring-1 ring-danger/20",
      rule: "bg-danger",
    };
  }
  if (overall <= 3) {
    return {
      label: "Developing",
      pill: "bg-warning-light text-warning ring-1 ring-warning/25",
      rule: "bg-warning",
    };
  }
  if (overall <= 4) {
    return {
      label: "Strong",
      pill: "bg-success-light text-success ring-1 ring-success/25",
      rule: "bg-success",
    };
  }
  return {
    label: "Exceptional",
    pill: "bg-success text-surface ring-1 ring-success/40",
    rule: "bg-success",
  };
}

// ── Small primitives ──────────────────────────────────────────────────────────

function MetaChip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-black/55 ring-1 ring-surface-border">
      {children}
    </span>
  );
}

/**
 * Five discrete segments rather than a continuous bar — the rubric is ordinal,
 * and segments make "3 of 5" legible at a glance without reading the number.
 */
function ScoreMeter({ score }: { score: number | null }): JSX.Element {
  const filled = score === null ? 0 : clampScore(score);
  return (
    <div
      className="flex w-full max-w-36 items-center gap-1"
      role="img"
      aria-label={
        score === null
          ? "Not scored"
          : `${integerFormatter.format(filled)} out of ${integerFormatter.format(MAX_SCORE)}`
      }
    >
      {Array.from({ length: MAX_SCORE }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-sm",
            index < filled ? "bg-brand-gold" : "bg-surface-border",
          )}
        />
      ))}
    </div>
  );
}

function ListPanel({
  tone,
  title,
  icon,
  items,
  emptyLabel,
}: {
  tone: "success" | "warning";
  title: string;
  icon: JSX.Element;
  items: string[];
  emptyLabel: string;
}): JSX.Element {
  const toneClasses =
    tone === "success"
      ? {
          shell: "border-success/20 bg-success-light",
          heading: "text-success",
          marker: "bg-success/15 text-success",
        }
      : {
          shell: "border-warning/25 bg-warning-light",
          heading: "text-warning",
          marker: "bg-warning/15 text-warning",
        };

  return (
    <section className={cn("rounded-lg border p-4 sm:p-5", toneClasses.shell)}>
      <h3
        className={cn(
          "flex items-center gap-2 font-serif text-sm font-semibold tracking-tight",
          toneClasses.heading,
        )}
      >
        {icon}
        {title}
      </h3>

      {items.length === 0 ? (
        <p className="mt-3 text-[13px] italic text-black/45">{emptyLabel}</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums",
                  toneClasses.marker,
                )}
                aria-hidden="true"
              >
                {integerFormatter.format(index + 1)}
              </span>
              <span className="text-[13px] leading-relaxed text-black/75">
                {item}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Report ────────────────────────────────────────────────────────────────────

export function AcademyReport({
  review,
  display,
  transcript,
  internName,
}: {
  review: TrainingReview;
  display: AcademyScenarioCard;
  transcript: TrainingTurn[];
  internName?: string;
}): JSX.Element {
  // `overall` is computed server-side, but a malformed row must not render "NaN / 5".
  const overall = Number.isFinite(review.overall)
    ? Math.min(MAX_SCORE, Math.max(0, review.overall))
    : computeOverall(review.scores);
  const band = bandFor(overall);

  const strengths = cleanList(review.strengths);
  const misses = cleanList(review.misses);

  const rewritten = review.rewritten_reply?.trim() ?? "";

  const orderedTurns = [...(transcript ?? [])].sort((a, b) => a.seq - b.seq);
  const internTurnCount = orderedTurns.filter((t) => t.role === "intern").length;

  const scoredOn = safeIST(review.created_at, "d MMM yyyy, h:mm a");
  const modelVersion = review.model_version?.trim() || "unknown evaluator";

  return (
    <article className="space-y-4 sm:space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-card">
        <div className="flex flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-start md:justify-between md:gap-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold">
              Indulge Training review
            </p>

            <h2 className="mt-2 font-serif text-xl leading-snug tracking-tight text-brand-black sm:text-2xl">
              {display.title}
            </h2>

            {internName ? (
              <p className="mt-1.5 text-[13px] text-black/60">
                Session by{" "}
                <span className="font-medium text-black/80">{internName}</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <MetaChip>{display.vertical}</MetaChip>
              <MetaChip>{display.difficulty}</MetaChip>
              <MetaChip>{display.archetype}</MetaChip>
            </div>
          </div>

          <div className="shrink-0 md:text-right">
            <div className="flex items-baseline gap-1.5 md:justify-end">
              <span className="font-serif text-5xl leading-none tracking-tight tabular-nums text-brand-black sm:text-6xl">
                {overallFormatter.format(overall)}
              </span>
              <span className="font-serif text-xl leading-none text-black/35">
                / {integerFormatter.format(MAX_SCORE)}
              </span>
            </div>

            <div
              className={cn("mt-3 h-0.5 w-full rounded-sm md:ml-auto", band.rule)}
              aria-hidden="true"
            />

            <span
              className={cn(
                "mt-3 inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
                band.pill,
              )}
            >
              {band.label}
            </span>
          </div>
        </div>
      </header>

      {/* ── Per-dimension breakdown ──────────────────────────────────────── */}
      <section className="rounded-xl border border-surface-border bg-surface p-5 shadow-card sm:p-6">
        <h3 className="font-serif text-base tracking-tight text-brand-black">
          Rubric breakdown
        </h3>
        <p className="mt-1 text-[13px] text-black/55">
          Each dimension is scored 1–5. Factual accuracy carries the heaviest
          weight in the overall.
        </p>

        <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          {ACADEMY_DIMENSIONS.map((dimension) => {
            // Row may predate a rubric change, or the evaluator may have skipped it.
            const entry: AcademyDimensionScore | undefined =
              review.scores?.[dimension.key];
            const rawScore = entry?.score;
            const score =
              typeof rawScore === "number" && Number.isFinite(rawScore)
                ? clampScore(rawScore)
                : null;
            const justification = entry?.justification?.trim() ?? "";

            return (
              <div
                key={dimension.key}
                className="border-b border-surface-border pb-5 last:border-b-0 last:pb-0 md:[&:nth-last-child(-n+2)]:border-b-0 md:[&:nth-last-child(-n+2)]:pb-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-[13px] font-semibold tracking-tight text-brand-black">
                    {dimension.label}
                  </h4>
                  <span
                    className={cn(
                      "shrink-0 font-serif text-lg leading-none tabular-nums",
                      score === null ? "text-black/25" : "text-brand-gold",
                    )}
                  >
                    {score === null ? "—" : integerFormatter.format(score)}
                    <span className="text-[11px] text-black/30">
                      /{integerFormatter.format(MAX_SCORE)}
                    </span>
                  </span>
                </div>

                <div className="mt-2">
                  <ScoreMeter score={score} />
                </div>

                <p
                  className={cn(
                    "mt-2.5 text-[13px] leading-relaxed",
                    justification ? "text-black/65" : "italic text-black/40",
                  )}
                >
                  {justification ||
                    (score === null
                      ? "Not scored in this review."
                      : "No justification recorded.")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Strengths / misses ───────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <ListPanel
          tone="success"
          title="What worked"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          items={strengths}
          emptyLabel="No strengths were recorded for this session."
        />
        <ListPanel
          tone="warning"
          title="What to fix"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
          items={misses}
          emptyLabel="No misses were recorded for this session."
        />
      </div>

      {/* ── Model answer ─────────────────────────────────────────────────── */}
      {rewritten ? (
        <section className="rounded-xl border border-brand-gold/25 bg-surface p-5 shadow-card sm:p-6">
          <h3 className="flex items-center gap-2 font-serif text-base tracking-tight text-brand-black">
            <MessageSquareQuote
              className="size-4 text-brand-gold"
              aria-hidden="true"
            />
            The model answer
          </h3>
          <p className="mt-1 text-[13px] text-black/55">
            How a senior concierge would have written your weakest message.
          </p>

          <blockquote className="mt-4 rounded-lg border-l-2 border-brand-gold bg-surface-subtle px-4 py-3.5 sm:px-5 sm:py-4">
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-black/80">
              {rewritten}
            </p>
          </blockquote>
        </section>
      ) : null}

      {/* ── Transcript ───────────────────────────────────────────────────── */}
      <details className="group overflow-hidden rounded-xl border border-surface-border bg-surface shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-subtle sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <MessagesSquare
              className="size-4 text-brand-gold"
              aria-hidden="true"
            />
            <span className="font-serif text-base tracking-tight text-brand-black">
              Full transcript
            </span>
            <span className="text-[12px] text-black/45">
              {integerFormatter.format(orderedTurns.length)} messages ·{" "}
              {integerFormatter.format(internTurnCount)} from you
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-gold">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>

        {/* `chat-canvas` is the same paper the live thread sits on, so the
            replayed transcript reads identically to the session itself. */}
        <div className="border-t border-surface-border bg-chat-canvas px-4 py-5 sm:px-6 sm:py-6">
          {orderedTurns.length === 0 ? (
            <p className="text-center text-[13px] italic text-black/45">
              No messages were exchanged in this session.
            </p>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              {orderedTurns.map((turn) => (
                <AcademyBubble
                  key={turn.id}
                  side={turn.role === "client" ? "client" : "intern"}
                  body={turn.body}
                  timestamp={turn.created_at}
                />
              ))}
            </div>
          )}
        </div>
      </details>

      {/* ── Provenance ───────────────────────────────────────────────────── */}
      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-black/40">
        <Sparkles className="size-3 text-taupe" aria-hidden="true" />
        <span>
          Scored by <span className="font-mono text-black/55">{modelVersion}</span>
        </span>
        {scoredOn ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{scoredOn} IST</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span className="italic">
          Scores are only comparable across sessions graded by the same evaluator
          version.
        </span>
      </footer>
    </article>
  );
}
