import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityTimeline } from "@/components/leads/ActivityTimeline";
import { LeadJourneyBar } from "@/components/leads/LeadJourneyBar";
import { LeadTaskWidget } from "@/components/tasks/LeadTaskWidget";
import { LeadContextChat } from "@/components/chat/LeadContextChat";
import { WhatsAppChatModule } from "@/components/leads/dossier/WhatsAppChatModule";
import { getWhatsAppMessagesForLead } from "@/lib/actions/whatsapp";
import {
  getLeadActivitiesForDossier,
  getLeadTasksForDossier,
  getOrCreateLeadConversationForDossier,
} from "@/lib/leads/leadDetailRequestCache";
import type { LeadJourneyActivity } from "@/lib/leads/leadJourneyStages";
import type { LeadStatus, UserRole } from "@/lib/types/database";

export function LeadJourneySkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-28 animate-pulse rounded-md bg-stone-100/90" />
      <div className="h-11 w-full animate-pulse rounded-xl bg-stone-100/80" />
    </div>
  );
}

export function LeadTasksWidgetSkeleton() {
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      <div className="mb-4 h-3 w-36 animate-pulse rounded-md bg-stone-100/90" />
      <div className="space-y-3">
        <div className="h-14 animate-pulse rounded-lg bg-stone-100/70" />
        <div className="h-14 animate-pulse rounded-lg bg-stone-100/60" />
      </div>
    </div>
  );
}

export function LeadActivityTimelineSkeleton() {
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      <div className="mb-5 h-3 w-40 animate-pulse rounded-md bg-stone-100/90" />
      <div className="space-y-4 pl-2">
        <div className="h-12 animate-pulse rounded-lg bg-stone-100/70" />
        <div className="h-12 animate-pulse rounded-lg bg-stone-100/60" />
        <div className="h-12 animate-pulse rounded-lg bg-stone-100/50" />
      </div>
    </div>
  );
}

export function LeadContextChatSkeleton() {
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      <div className="mb-4 h-3 w-32 animate-pulse rounded-md bg-stone-100/90" />
      <div className="h-48 animate-pulse rounded-lg bg-stone-100/70" />
    </div>
  );
}

export function LeadWhatsAppSkeleton() {
  return (
    <div className="flex h-[500px] flex-col overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]">
      <div className="border-b border-stone-100 px-4 py-3">
        <div className="mb-1 h-3 w-24 animate-pulse rounded-md bg-stone-100/90" />
        <div className="h-2.5 w-40 animate-pulse rounded-md bg-stone-100/70" />
      </div>
      <div className="min-h-0 flex-1 p-4">
        <div className="h-full animate-pulse rounded-lg bg-stone-100/60" />
      </div>
      <div className="border-t border-stone-100 p-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-stone-100/70" />
      </div>
    </div>
  );
}

export async function LeadDossierWhatsAppAsync({ leadId }: { leadId: string }) {
  const messages = await getWhatsAppMessagesForLead(leadId);
  return (
    <WhatsAppChatModule leadId={leadId} initialMessages={messages} />
  );
}

export async function LeadDossierJourneyAsync({
  leadId,
  currentStatus,
  leadCreatedAt,
  asOf,
}: {
  leadId: string;
  currentStatus: LeadStatus;
  leadCreatedAt: string;
  asOf: string;
}) {
  const activities = await getLeadActivitiesForDossier(leadId);
  return (
    <LeadJourneyBar
      currentStatus={currentStatus}
      activities={activities as LeadJourneyActivity[]}
      leadCreatedAt={leadCreatedAt}
      asOf={asOf}
    />
  );
}

export async function LeadDossierTasksAsync({
  leadId,
  role,
}: {
  leadId: string;
  role: UserRole;
}) {
  const leadTasks = await getLeadTasksForDossier(leadId);
  return (
    <LeadTaskWidget leadId={leadId} role={role} initialTasks={leadTasks} />
  );
}

export async function LeadDossierTimelineAsync({
  leadId,
}: {
  leadId: string;
}) {
  const activities = await getLeadActivitiesForDossier(leadId);
  return (
    <div className="rounded-xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]">
        Activity Timeline
      </p>
      <ScrollArea className="max-h-[500px] pr-3">
        <ActivityTimeline activities={activities} />
      </ScrollArea>
    </div>
  );
}

export async function LeadDossierContextChatAsync({
  leadId,
  currentUserId,
}: {
  leadId: string;
  currentUserId: string;
}) {
  const { conversationId } =
    await getOrCreateLeadConversationForDossier(leadId);
  if (!conversationId) return null;
  return (
    <LeadContextChat
      conversationId={conversationId}
      currentUserId={currentUserId}
    />
  );
}
