import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProject, getProjectTasks } from "@/lib/actions/projects";
import { ProjectBoard } from "@/components/projects/ProjectBoard";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;

  // Validate UUID format early
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) notFound();

  // Round trip 1: current user (for comment ownership)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Round trips 2 & 3 in parallel: project + task groups (via getProject) AND tasks
  const [projectResult, tasksResult] = await Promise.all([
    getProject(id),
    getProjectTasks(id),
  ]);

  if (!projectResult.success || !projectResult.data) notFound();

  const project = projectResult.data;
  const tasks = tasksResult.data ?? [];
  const taskGroups = project.task_groups ?? [];

  return (
    <ProjectBoard
      project={project}
      taskGroups={taskGroups}
      tasks={tasks}
      currentUserId={user.id}
    />
  );
}
