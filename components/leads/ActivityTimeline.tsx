import { format } from "date-fns";

type TimelineActor = {
  id: string;
  full_name: string;
} | null;

/** Supabase FK embed sometimes returns a single object or a one-element array */
type TimelineActivity = {
  id: string;
  action_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor?: TimelineActor | Array<{ id: string; full_name: string }>;
};

function resolveActor(
  actor: TimelineActivity["actor"],
): { full_name: string } | null {
  if (!actor) return null;
  if (Array.isArray(actor)) return actor[0] ?? null;
  return actor;
}

const DOT_STYLES: Record<string, string> = {
  lead_created: "bg-emerald-200",
  status_changed: "bg-indigo-200",
  note_added: "bg-stone-300",
  agent_assigned: "bg-amber-200",
  task_created: "bg-sky-200",
};

function renderActivityText(activity: TimelineActivity) {
  const details = activity.details ?? {};
  const actorName = resolveActor(activity.actor)?.full_name ?? "System";

  if (activity.action_type === "lead_created") {
    const source = (details.source as string | undefined) ?? "unknown source";
    return <p className="text-sm text-stone-800">Lead ingested from {source}</p>;
  }

  if (activity.action_type === "status_changed") {
    const oldStatus = (details.old_status as string | undefined) ?? "unknown";
    const newStatus = (details.new_status as string | undefined) ?? "unknown";
    return (
      <p className="text-sm text-stone-800">
        {actorName} changed status from {oldStatus} to {newStatus}
      </p>
    );
  }

  if (activity.action_type === "note_added") {
    const note = (details.note as string | undefined) ?? "No note content";
    return (
      <div className="space-y-2">
        <p className="text-sm text-stone-800">{actorName} left a note</p>
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <p className="text-sm text-stone-600 italic">"{note}"</p>
        </div>
      </div>
    );
  }

  if (activity.action_type === "agent_assigned") {
    const assignedTo = (details.assigned_to_name as string | undefined)
      ?? (details.assigned_to as string | undefined)
      ?? "Unknown agent";
    return (
      <p className="text-sm text-stone-800">
        {actorName} assigned this lead to {assignedTo}
      </p>
    );
  }

  if (activity.action_type === "task_created") {
    const title = (details.title as string | undefined) ?? "Task";
    const due = (details.due_date as string | undefined) ?? null;
    const noteBody = (details.notes as string | undefined)?.trim();
    return (
      <div className="space-y-2">
        <p className="text-sm text-stone-800">
          {actorName} scheduled <span className="font-medium">{title}</span>
          {due ? (
            <span className="text-stone-600">
              {" "}
              · due {format(new Date(due), "MMM d, yyyy h:mm a")}
            </span>
          ) : null}
        </p>
        {noteBody ? (
          <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
            <p className="text-sm text-stone-600 italic">&ldquo;{noteBody}&rdquo;</p>
          </div>
        ) : null}
      </div>
    );
  }

  return <p className="text-sm text-stone-800">Activity recorded</p>;
}

interface ActivityTimelineProps {
  activities: TimelineActivity[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-stone-500">No activity recorded yet.</p>;
  }

  return (
    <div className="border-l border-stone-200 pl-4 space-y-5">
      {activities.map((activity) => (
        <div key={activity.id} className="relative">
          <span
            className={`absolute -left-4.5 top-1 h-2.5 w-2.5 rounded-full ${DOT_STYLES[activity.action_type] ?? "bg-stone-300"}`}
          />
          <div className="space-y-1">
            {renderActivityText(activity)}
            <p className="text-xs text-stone-500">
              {format(new Date(activity.created_at), "MMM d 'at' h:mm a")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
