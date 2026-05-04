"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { WhatsAppMessage } from "@/lib/types/database";

const sendSchema = z.object({
  leadId: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

export type SendWhatsAppMessageResult =
  | { success: true; message: WhatsAppMessage }
  | { success: false; error: string };

function normalizeWhatsAppTo(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits;
}

function metaErrorMessage(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof (body.error as { message?: unknown }).message === "string"
  ) {
    return (body.error as { message: string }).message;
  }
  return "WhatsApp could not send this message.";
}

async function getAuthSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return { supabase, user };
}

export async function getWhatsAppMessagesForLead(
  leadId: string,
): Promise<WhatsAppMessage[]> {
  const { supabase } = await getAuthSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as WhatsAppMessage[];
}

export async function sendWhatsAppMessage(
  leadId: string,
  text: string,
): Promise<SendWhatsAppMessageResult> {
  const parsed = sendSchema.safeParse({ leadId, text: text.trim() });
  if (!parsed.success) {
    return { success: false, error: "Enter a valid message." };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!phoneNumberId || !token) {
    return {
      success: false,
      error: "WhatsApp Cloud API is not configured (missing env).",
    };
  }

  const { supabase } = await getAuthSupabase();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, phone_number")
    .eq("id", parsed.data.leadId)
    .single();

  if (leadError || !lead?.phone_number) {
    return {
      success: false,
      error: "Lead not found or phone number is missing.",
    };
  }

  const to = normalizeWhatsAppTo(lead.phone_number);
  if (to.length < 8) {
    return { success: false, error: "Phone number is invalid for WhatsApp." };
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: parsed.data.text },
      }),
    });
  } catch {
    return {
      success: false,
      error: "Network error contacting WhatsApp. Try again.",
    };
  }

  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const hint = metaErrorMessage(json);
    const lower = hint.toLowerCase();
    if (
      lower.includes("24 hour") ||
      lower.includes("24-hour") ||
      lower.includes("outside the allowed window")
    ) {
      return {
        success: false,
        error:
          "Meta rejected this message — the 24-hour customer care window may have expired. Use an approved template or wait for the lead to message you again.",
      };
    }
    return {
      success: false,
      error: hint || `WhatsApp API error (${res.status}).`,
    };
  }

  let waMessageId: string | null = null;
  if (
    json &&
    typeof json === "object" &&
    "messages" in json &&
    Array.isArray((json as { messages?: unknown }).messages) &&
    (json as { messages: Array<{ id?: string }> }).messages[0]?.id
  ) {
    waMessageId =
      (json as { messages: Array<{ id: string }> }).messages[0].id ?? null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      lead_id: parsed.data.leadId,
      direction: "outbound",
      message_type: "text",
      content: parsed.data.text,
      status: "sent",
      wa_message_id: waMessageId,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    return {
      success: false,
      error:
        "Message may have reached WhatsApp but could not be saved. Contact support if this persists.",
    };
  }

  revalidatePath(`/leads/${parsed.data.leadId}`);

  return { success: true, message: inserted as WhatsAppMessage };
}

export type RecentWhatsAppConversation = {
  lead: {
    id: string;
    first_name: string;
    last_name: string | null;
    phone_number: string;
    status: string;
    assigned_to: string | null;
  };
  latestMessage: {
    content: string;
    created_at: string;
  };
};

/**
 * Global Hub: latest WhatsApp thread per lead, ordered by recency.
 * Uses vw_latest_whatsapp_threads (DISTINCT ON in Postgres) — no in-memory dedupe.
 */
export async function getRecentWhatsAppConversations(): Promise<
  RecentWhatsAppConversation[]
> {
  const { supabase } = await getAuthSupabase();

  const { data, error } = await supabase
    .from("vw_latest_whatsapp_threads")
    .select(
      "lead_id, content, created_at, lead:leads(id, first_name, last_name, phone_number, status, assigned_to)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  type Row = {
    lead_id: string;
    content: string | null;
    created_at: string;
    lead:
      | {
          id: string;
          first_name: string;
          last_name: string | null;
          phone_number: string;
          status: string;
          assigned_to: string | null;
        }
      | null;
  };

  const out: RecentWhatsAppConversation[] = [];
  for (const row of data as unknown as Row[]) {
    if (!row.lead?.id) continue;
    out.push({
      lead: {
        id: row.lead.id,
        first_name: row.lead.first_name,
        last_name: row.lead.last_name,
        phone_number: row.lead.phone_number,
        status: row.lead.status,
        assigned_to: row.lead.assigned_to,
      },
      latestMessage: {
        content: row.content ?? "",
        created_at: row.created_at,
      },
    });
  }

  return out;
}

export async function getWhatsAppLeadHeader(leadId: string): Promise<{
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  status: string;
} | null> {
  const { supabase } = await getAuthSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, phone_number, status")
    .eq("id", leadId)
    .single();

  if (error || !data) return null;
  return data as {
    id: string;
    first_name: string;
    last_name: string | null;
    phone_number: string;
    status: string;
  };
}
