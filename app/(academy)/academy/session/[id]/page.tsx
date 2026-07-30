import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { getAcademySessionDetail } from "@/lib/actions/academy";
import { ACADEMY_TURN_CAP } from "@/lib/academy/models";
import { AcademyChat } from "@/components/academy/AcademyChat";
import { AcademyReport } from "@/components/academy/AcademyReport";
import { AcademyProgressHeader } from "@/components/academy/AcademyProgressHeader";
import { RetryReview } from "./RetryReview";
import { ReviewToggle } from "./ReviewToggle";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function BackLink() {
  return (
    <Link
      href="/academy"
      className="inline-flex items-center gap-2 text-[13px] font-medium text-black/45 transition-colors duration-150 hover:text-brand-gold"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Academy
    </Link>
  );
}

export default async function AcademySessionPage({ params }: PageProps) {
  const { id } = await params;

  const res = await getAcademySessionDetail(id);
  if (!res.success || !res.data) notFound();

  const { session, display, turns, review, readOnly, internName, progress } = res.data;

  // ── Live drill ──────────────────────────────────────────────────────────────
  if (session.status === "open") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface-border px-4 py-3 md:px-6">
          <BackLink />
          {readOnly && (
            <span className="rounded-md bg-info-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info">
              Observing {internName}
            </span>
          )}
        </div>

        <AcademyProgressHeader progress={progress} />

        <div className="flex min-h-0 flex-1 flex-col">
          <AcademyChat
            sessionId={session.id}
            display={display}
            initialTurns={turns}
            turnCap={ACADEMY_TURN_CAP}
            readOnly={readOnly}
          />
        </div>
      </div>
    );
  }

  // ── Closed + scored ─────────────────────────────────────────────────────────
  // The conversation stays on screen — it is what the intern came back to read.
  // The report folds in beneath it rather than replacing it.
  if (review) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface-border px-4 py-3 md:px-6">
          <BackLink />
          {readOnly && (
            <span className="rounded-md bg-info-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info">
              Observing {internName}
            </span>
          )}
        </div>

        <AcademyProgressHeader progress={progress} score={review.overall} />

        <div className="flex min-h-0 flex-1 flex-col">
          <AcademyChat
            sessionId={session.id}
            display={display}
            initialTurns={turns}
            turnCap={ACADEMY_TURN_CAP}
            readOnly
          />
        </div>

        <ReviewToggle overall={review.overall}>
          <AcademyReport
            review={review}
            display={display}
            transcript={turns}
            internName={internName}
          />
        </ReviewToggle>
      </div>
    );
  }

  // ── Closed but the evaluator never returned ─────────────────────────────────
  return (
    <div className="min-h-full">
      <div className="border-b border-surface-border px-4 py-3 md:px-6 lg:px-8">
        <BackLink />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="rounded-xl border border-warning/25 bg-warning-light px-5 py-6">
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-xl leading-tight text-black/85">
                Scoring didn&apos;t complete
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-black/60">
                &ldquo;{display.title}&rdquo; closed with {turns.length}{" "}
                {turns.length === 1 ? "message" : "messages"}, but the evaluator
                never returned a review. The transcript is safe — nothing was
                lost. Re-running scoring uses the same transcript and rubric.
              </p>

              <div className="mt-4">
                <RetryReview sessionId={session.id} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
            Transcript
          </h2>

          {turns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-8 text-center text-[13px] text-black/45">
              This session has no messages.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-white">
              {turns.map((turn) => (
                <li key={turn.id} className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/35">
                    {turn.role === "client" ? "Member" : internName}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-black/75">
                    {turn.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
