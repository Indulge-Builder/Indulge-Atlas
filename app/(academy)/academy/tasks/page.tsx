import { type JSX } from "react";
import { getAcademyClients } from "@/lib/actions/academy";
import { AcademyClientShell } from "@/components/academy/AcademyClientShell";

/**
 * /academy/tasks — the four-day training programme.
 *
 * Renders the SAME shell as /academy, in training mode: identical two-panel
 * frame, identical sidebar, identical conversation panel and Freshdesk flow.
 * The only differences are that the roster is narrowed to the 40 taught tasks,
 * the sidebar groups them by day, and locked days are not selectable.
 *
 * Reusing the shell rather than rebuilding it is the point — a second copy of
 * this UI would drift from the Clients page the first time either changed.
 *
 * force-dynamic because progress is per-trainee and moves the moment a ticket
 * is accepted; a cached page would show a stale lock.
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

  return (
    /*
     * Identical height wrapper to /academy. The Academy layout is `h-screen`
     * with a bounded <main>, so the shell takes `h-full` and scrolls its two
     * panels internally rather than growing the page.
     */
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 px-4 py-4 md:px-6 lg:px-8">
        <AcademyClientShell initial={res.data} training />
      </div>
    </div>
  );
}
