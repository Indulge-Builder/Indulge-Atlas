"use server";

import { getAuthUser } from "@/lib/auth/getAuthUser";
import { verifyProofAttachment, type ProofAdvisory } from "@/lib/services/ticketProofVerifier";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Advisory-only proof check for the latest proof attachment on a ticket.
 * Returns null data when there's nothing to verify or the model is unavailable.
 * Purely informational — the deterministic gate in changeTicketStatus still rules.
 */
export async function getProofAdvisory(ticketId: string): Promise<ActionResult<ProofAdvisory | null>> {
  try {
    const { supabase } = await getAuthUser();
    const { data: att } = await supabase
      .from("concierge_ticket_attachments")
      .select("storage_path, mime_type")
      .eq("ticket_id", ticketId)
      .eq("is_proof", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!att) return { success: true, data: null };

    const advisory = await verifyProofAttachment(att.storage_path as string, att.mime_type as string);
    return { success: true, data: advisory };
  } catch (err) {
    console.error("[getProofAdvisory]", err);
    return { success: false, error: "Could not verify the proof attachment." };
  }
}
