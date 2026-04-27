"use server";

// @deprecated — use lib/actions/tasks.ts.
// Re-exports kept for backward compatibility with existing imports.
// New code should import directly from lib/actions/tasks.ts.
export {
  createMasterTask as createProject,
  updateMasterTask as updateProject,
  archiveMasterTask as archiveProject,
  deleteMasterTask as deleteProject,
  getMasterTasks as getUserProjects,
  getMasterTaskDetail as getProject,
  addMasterTaskMember as addProjectMember,
  removeMasterTaskMember as removeProjectMember,
  createTaskGroupForMaster as createTaskGroup,
  reorderTaskGroupsForMaster as reorderTaskGroups,
  deleteTaskGroupForMaster as deleteTaskGroup,
  createSubTask as createGroupTask,
  deleteSubTask as deleteGroupTask,
  updateSubTask as updateGroupTask,
  assignSubTask as assignTask,
  reorderSubTasks as reorderTasks,
  getMasterTaskMembers,
  searchProfilesForTasks as searchProfilesForProject,
  updateSubTaskProgress as updateTaskProgress,
} from "@/lib/actions/tasks";
