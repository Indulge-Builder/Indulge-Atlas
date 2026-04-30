"use client";

import { useRouter } from "next/navigation";
import { useMyLeadCollaborationGrantsRealtime } from "@/lib/hooks/useLeadCollaboratorsRealtime";

/** Refreshes the app shell when this user is added as a lead collaborator (new shared dossiers). */
export function LeadCollaborationGrantListener({ userId }: { userId: string }) {
  const router = useRouter();
  useMyLeadCollaborationGrantsRealtime(userId, () => router.refresh());
  return null;
}
