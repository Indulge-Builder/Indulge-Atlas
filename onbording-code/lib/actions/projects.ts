// Re-exports for backward compatibility with @/lib/actions/projects imports.
// Server actions are defined in lib/actions/tasks.ts ("use server" must live on the
// file that contains the async implementations — not on a re-export-only barrel).

export {
  createMasterTask as createProject,
  updateMasterTask as updateProject,
  archiveMasterTask as archiveProject,
  deleteMasterTask as deleteProject,
  getMasterTasks as getUserProjects,
  getProject,
  getProjectTasks,
  getTaskDetail,
  addComment,
  editComment,
  deleteComment,
  addMasterTaskMember as addProjectMember,
  removeMasterTaskMember as removeProjectMember,
  createTaskGroupForMaster as createTaskGroup,
  createSubtaskInBoardGroup as createGroupTask,
  reorderTaskGroupsForMaster as reorderTaskGroups,
  deleteTaskGroupForMaster as deleteTaskGroup,
  createProjectNestedSubTask as createSubTask,
  deleteSubTask as deleteGroupTask,
  updateSubTask as updateGroupTask,
  assignSubTask as assignTask,
  reorderSubTasks as reorderTasks,
  getMasterTaskMembers,
  searchProfilesForTasks as searchProfilesForProject,
  updateTaskProgress,
} from "@/lib/actions/tasks";
