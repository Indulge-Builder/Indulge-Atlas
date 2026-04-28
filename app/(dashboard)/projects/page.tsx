import { Suspense } from "react";
import { getUserProjects } from "@/lib/actions/projects";

/** Uses Supabase/cookies via getUserProjects → must not be statically prerendered. */
export const dynamic = "force-dynamic";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectsHeader } from "@/components/projects/ProjectsHeader";
import { FolderKanban } from "lucide-react";
import type { MasterTask, Project, ProjectStatus } from "@/lib/types/database";

/** API row shape for master tasks list (select uses `notes`). */
type MasterTaskListRow = MasterTask & {
  subtask_count?: number;
  completed_subtask_count?: number;
  notes?: string | null;
};

function projectStatusFromMasterTask(t: MasterTaskListRow): ProjectStatus {
  if (t.archived_at) return "archived";
  if (t.atlas_status === "done") return "completed";
  if (t.atlas_status === "blocked" || t.atlas_status === "cancelled")
    return "on_hold";
  return "active";
}

function masterTaskRowToProject(t: MasterTaskListRow): Project {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? t.notes ?? null,
    status: projectStatusFromMasterTask(t),
    owner_id: t.created_by ?? "",
    department: t.department,
    domain: t.domain,
    color: t.cover_color,
    icon: t.icon_key,
    due_date: t.due_date,
    created_at: t.created_at,
    updated_at: t.updated_at,
    owner: t.owner,
    members: t.members as Project["members"],
    task_groups: t.task_groups,
    task_count: t.subtask_count ?? 0,
    completed_task_count: t.completed_subtask_count ?? 0,
  };
}

// ── Loading skeleton ─────────────────────────────────────────────────────

function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[#E5E4DF] bg-white overflow-hidden animate-pulse">
      <div className="h-1.5 bg-zinc-100" />
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-zinc-100 rounded w-2/3" />
            <div className="h-2.5 bg-zinc-50 rounded w-1/2" />
          </div>
        </div>
        <div className="h-2 bg-zinc-50 rounded w-full" />
        <div className="h-2 bg-zinc-50 rounded w-3/4" />
        <div className="flex items-center justify-between mt-4">
          <div className="h-6 w-16 bg-zinc-50 rounded-full" />
          <div className="h-4 w-12 bg-zinc-50 rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Projects grid ────────────────────────────────────────────────────────

async function ProjectsGrid() {
  const result = await getUserProjects();
  const projects = (result.data ?? []).map((row) =>
    masterTaskRowToProject(row as MasterTaskListRow),
  );

  const active = projects.filter((p) => p.status !== "archived");
  const recent = [...active].slice(0, 3);

  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-4">
          <FolderKanban className="w-7 h-7 text-[#D4AF37]/70" />
        </div>
        <h3 className="text-[15px] font-semibold text-zinc-700 mb-2">
          No projects yet
        </h3>
        <p className="text-sm text-zinc-400 max-w-xs">
          Create your first project to start organizing work into groups, tasks,
          and milestones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Pinned / Recent */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4 px-1">
            Recent
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      {/* All my projects */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4 px-1">
          All Projects ({active.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page header — client component that owns the modal state */}
      <ProjectsHeader />

      {/* Content */}
      <div className="flex-1 px-8 py-8">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <ProjectsGrid />
        </Suspense>
      </div>
    </div>
  );
}
