import Link from "next/link";
import { GraduationCap, PenSquare, TriangleAlert, Users } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isAcademyTrainer } from "@/lib/types/database";
import {
  getAcademyCohort,
  getAcademyClients,
  getMyAcademySessions,
  listAcademyScenarios,
} from "@/lib/actions/academy";
import { AcademyClientShell } from "@/components/academy/AcademyClientShell";
import { CohortTable } from "@/components/academy/CohortTable";
import { ScenarioPicker } from "@/components/academy/ScenarioPicker";
import { formatAtlasDateTime } from "@/lib/utils/date-format";
import { cn } from "@/lib/utils";
import type { CohortInternRow, InternSessionRow } from "@/lib/academy/types";
import type { AcademyScenarioCard } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const scoreFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type View = "ladder" | "practice" | "cohort";

// ── Small local presentation helpers ─────────────────────────────────────────

function LoadError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div>
        <p className="text-[13px] font-medium text-danger">
          Could not load this section
        </p>
        <p className="mt-0.5 text-[12px] text-danger/80">{message}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "open" | "closed" }) {
  return (
    <span
      className={
        status === "open"
          ? "rounded-md bg-info-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info"
          : "rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45"
      }
    >
      {status === "open" ? "In progress" : "Closed"}
    </span>
  );
}

function SessionsList({ rows }: { rows: InternSessionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-8 text-center">
        <p className="font-serif text-[15px] text-black/70">No sessions yet</p>
        <p className="mt-1 text-[13px] text-black/45">
          Start a scenario and it will appear here with its score.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-white">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/academy/session/${row.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-black/80">
                {row.title}
              </p>
              <p className="mt-0.5 text-[12px] text-black/45">
                {row.vertical} · {row.difficulty} ·{" "}
                {formatAtlasDateTime(row.startedAt)}
              </p>
            </div>
            <StatusPill status={row.status} />
            {row.overall !== null ? (
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-black/70">
                {scoreFormatter.format(row.overall)}
                <span className="text-[11px] font-normal text-black/40"> / 5</span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ViewTab({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-brand-gold text-surface"
          : "border border-surface-border bg-white text-black/60 hover:border-brand-gold/40 hover:text-brand-gold",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ role, department }, params] = await Promise.all([
    getAuthUser(),
    searchParams,
  ]);
  const trainer = isAcademyTrainer(role, department);

  const requested = (params.view ?? "ladder") as View;
  // Non-trainers can never land on the cohort view, even by URL.
  const view: View =
    requested === "cohort" && !trainer ? "ladder" : requested;

  const [ladderRes, cohortRes, scenariosRes, sessionsRes] = await Promise.all([
    view === "ladder" ? getAcademyClients() : Promise.resolve(null),
    view === "cohort" && trainer ? getAcademyCohort() : Promise.resolve(null),
    view === "practice" ? listAcademyScenarios() : Promise.resolve(null),
    view === "practice" ? getMyAcademySessions() : Promise.resolve(null),
  ]);

  const tabs = (
    <div className="flex flex-wrap items-center gap-2">
      <ViewTab href="/academy" active={view === "ladder"} icon={GraduationCap}>
        Clients
      </ViewTab>
      <ViewTab
        href="/academy?view=practice"
        active={view === "practice"}
        icon={PenSquare}
      >
        Free practice
      </ViewTab>
      {trainer ? (
        <ViewTab
          href="/academy?view=cohort"
          active={view === "cohort"}
          icon={Users}
        >
          Cohort
        </ViewTab>
      ) : null}
      {trainer ? (
        <Link
          href="/admin/academy-seeds"
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-black/60 transition-colors hover:border-brand-gold/40 hover:text-brand-gold"
        >
          <PenSquare className="h-3.5 w-3.5" />
          Scenario library
        </Link>
      ) : null}
    </div>
  );

  // ── Ladder: full-height two-panel surface ──────────────────────────────────
  if (view === "ladder") {
    const clientList = ladderRes && ladderRes.success ? ladderRes.data : null;
    const ladderError = ladderRes && !ladderRes.success ? ladderRes.error : null;

    return (
      // The dashboard shell is `min-h-screen`, so it grows with content and
      // `h-full` here would resolve to content height — which is what left the
      // chat stretched with dead space. Pin this view to the viewport instead
      // (minus the shell's p-3 gutter) so the panel becomes a real app frame:
      // nothing on the page scrolls, only the message list inside it does.
      <div className="flex h-[calc(100dvh-1.5rem)] min-h-0 flex-col overflow-hidden">
        <TopBar
          title="Academy"
          subtitle="One client, one request — reply as their concierge"
          hideDomainSwitcher
        />

        <div className="shrink-0 px-4 pt-4 md:px-6 lg:px-8">{tabs}</div>

        <div className="min-h-0 flex-1 px-4 py-4 md:px-6 lg:px-8">
          {ladderError ? (
            <LoadError message={ladderError} />
          ) : !clientList || clientList.clients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-10 text-center">
              <p className="font-serif text-[15px] text-black/70">
                The curriculum has not been loaded yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-black/45">
                Apply migrations 129 and 130 to load the 176-task training
                register. Until then, use Free practice.
              </p>
            </div>
          ) : (
            <AcademyClientShell initial={clientList} />
          )}
        </div>
      </div>
    );
  }

  // ── Practice + cohort: standard scrolling page ─────────────────────────────
  const cohortRows: CohortInternRow[] =
    cohortRes && cohortRes.success ? (cohortRes.data ?? []) : [];
  const cohortError = cohortRes && !cohortRes.success ? cohortRes.error : null;

  const scenarios: AcademyScenarioCard[] =
    scenariosRes && scenariosRes.success ? (scenariosRes.data ?? []) : [];
  const scenariosError =
    scenariosRes && !scenariosRes.success ? scenariosRes.error : null;

  const sessions: InternSessionRow[] =
    sessionsRes && sessionsRes.success ? (sessionsRes.data ?? []) : [];
  const sessionsError =
    sessionsRes && !sessionsRes.success ? sessionsRes.error : null;

  return (
    <div className="min-h-full">
      <TopBar
        title="Academy"
        subtitle={
          view === "cohort"
            ? "Cohort performance across every scored session"
            : "Standalone scenarios, outside the training ladder"
        }
        hideDomainSwitcher
      />

      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {tabs}

        {view === "cohort" ? (
          cohortError ? (
            <LoadError message={cohortError} />
          ) : cohortRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-5 py-8 text-center">
              <p className="font-serif text-[15px] text-black/70">
                No scored sessions yet
              </p>
              <p className="mt-1 text-[13px] text-black/45">
                Cohort averages appear once interns close their first sessions.
              </p>
            </div>
          ) : (
            <CohortTable rows={cohortRows} />
          )
        ) : (
          <>
            <section>
              <h2 className="mb-1 font-serif text-xl leading-tight text-black/85">
                Free practice
              </h2>
              <p className="mb-4 text-[13px] text-black/45">
                Scenarios outside the 50-group ladder. Useful for drilling a
                specific situation on demand.
              </p>
              {scenariosError ? (
                <LoadError message={scenariosError} />
              ) : (
                <ScenarioPicker scenarios={scenarios} />
              )}
            </section>

            <section>
              <h2 className="mb-1 font-serif text-xl leading-tight text-black/85">
                Your sessions
              </h2>
              <p className="mb-4 text-[13px] text-black/45">
                Every drill you have started, newest first.
              </p>
              {sessionsError ? (
                <LoadError message={sessionsError} />
              ) : (
                <SessionsList rows={sessions} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
