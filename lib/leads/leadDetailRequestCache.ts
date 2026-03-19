import { cache } from "react";
import { getLeadActivities } from "@/lib/actions/leads";
import { getLeadTasks } from "@/lib/actions/tasks";
import { getOrCreateLeadConversation } from "@/lib/actions/messages";

/** Dedupes identical data reads within one RSC pass (e.g. journey bar + timeline). */
export const getLeadActivitiesForDossier = cache(async (leadId: string) => {
  return getLeadActivities(leadId);
});

export const getLeadTasksForDossier = cache(async (leadId: string) => {
  return getLeadTasks(leadId);
});

export const getOrCreateLeadConversationForDossier = cache(
  async (leadId: string) => {
    return getOrCreateLeadConversation(leadId);
  },
);
