import { type JSX } from "react";
import { getAcademyClients } from "@/lib/actions/academy";
import { buildTrainingDays } from "@/lib/academy/trainingDays";
import { TrainingDays } from "@/components/academy/TrainingDays";

/**
 * /academy/tasks — the four-day training programme.
 *
 * Reads the same rows the client list reads and derives the days from them, so
 * this page cannot report a different number of completed requests than the
 * Clients tab. There is no separate query and no second definition of "done".
 *
 * force-dynamic because progress is per-trainee and changes the moment a ticket
 * is accepted — a cached curriculum would show a stale lock.
 */
export const dynamic = "force-dynamic";

export default async function AcademyTasksPage(): Promise<JSX.Element> {
  const res = await getAcademyClients();

  if (!res.success || !res.data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
        <p className="font-serif text-[15px] text-chat-ink">
          Could not load your training programme
        </p>
        <p className="mt-1 text-[12.5px] text-chat-ink-muted">
          {res.success ? "No data returned." : res.error}
        </p>
      </div>
    );
  }

  const view = buildTrainingDays(
    res.data.clients.map((c) => ({
      seedId: c.seedId,
      taskNumber: c.taskNumber,
      name: c.name,
      requestTitle: c.requestTitle,
      status: c.status,
      sessionId: c.sessionId,
    })),
  );

  return <TrainingDays view={view} />;
}
