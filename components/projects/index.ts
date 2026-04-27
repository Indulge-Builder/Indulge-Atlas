/**
 * @deprecated — components/projects/ is superseded by components/tasks/.
 * Re-exports kept for backward compatibility while migration is in progress.
 * Migrate all imports to components/tasks/ directly.
 */

export { MasterTasksIndex as ProjectsHeader } from "@/components/tasks/MasterTasksIndex";
export { MasterTaskCard as ProjectCard } from "@/components/tasks/MasterTaskCard";
export { CreateMasterTaskModal as CreateProjectModal } from "@/components/tasks/CreateMasterTaskModal";
export { TaskBoard as ProjectBoard } from "@/components/tasks/TaskBoard";
export { TaskBoard as BoardView } from "@/components/tasks/TaskBoard";
export { TaskListView as ListView } from "@/components/tasks/TaskListView";
export { SubTaskCard as TaskCard } from "@/components/tasks/SubTaskCard";
export { SubTaskDetailSheet as TaskDetailSheet } from "@/components/tasks/SubTaskDetailSheet";
