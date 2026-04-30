/**
 * Task UI constants — re-exported from canonical definitions in `lib/types/database.ts`.
 */

import type { AtlasTaskStatus } from "@/lib/types/database";

export {
  TASK_PRIORITY_CONFIG,
  ATLAS_TASK_STATUS_COLORS,
  ATLAS_TASK_STATUS_LABELS,
} from "@/lib/types/database";

/** Stacked bar segment order in Portfolio completion (left → right) */
export const ATLAS_STATUS_PORTFOLIO_BAR_ORDER: AtlasTaskStatus[] = [
  "done",
  "in_progress",
  "todo",
  "error",
  "cancelled",
];

/** Master workspace subtask list: section order (workflow-first) */
export const ATLAS_STATUS_WORKSPACE_SECTION_ORDER: AtlasTaskStatus[] = [
  "todo",
  "in_progress",
  "error",
  "done",
  "cancelled",
];

/** Bar segment / section accent (same colors as portfolio strip) */
export const ATLAS_STATUS_SEGMENT_BG: Record<AtlasTaskStatus, string> = {
  done:        "bg-emerald-500",
  in_progress: "bg-[#C9A227]",
  todo:        "bg-[#D4D0C8]",
  error:       "bg-red-500",
  cancelled:   "bg-[#B5B0A8]",
};
