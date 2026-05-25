/**
 * Gupshup outbound message client.
 * Server-only — never import from client components.
 *
 * Env: GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_PARTNER_NUMBER
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";

const GUPSHUP_API_URL = "https://api.gupshup.io/wa/api/v1/msg";

export type GupshupTextPayload = {
  type: "text";
  text: string;
};

export type GupshupImagePayload = {
  type: "image";
  imageUrl: string;
  caption: string;
};

export type GupshupButtonsPayload = {
  type: "buttons";
  body: string;
  buttons: Array<{ id: string; title: string }>;
};

export type GupshupListPayload = {
  type: "list";
  body: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
};

export type GupshupOutboundPayload =
  | GupshupTextPayload
  | GupshupImagePayload
  | GupshupButtonsPayload
  | GupshupListPayload;

function buildMessageBody(payload: GupshupOutboundPayload): string {
  if (payload.type === "text") {
    return JSON.stringify({ type: "text", text: payload.text });
  }

  if (payload.type === "image") {
    return JSON.stringify({
      type: "image",
      originalUrl: payload.imageUrl,
      caption: payload.caption,
      previewUrl: payload.imageUrl,
    });
  }

  if (payload.type === "buttons") {
    return JSON.stringify({
      type: "button",
      text: { body: payload.body },
      action: {
        buttons: payload.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    });
  }

  // list
  return JSON.stringify({
    type: "list",
    body: { text: payload.body },
    action: {
      button: payload.buttonText.slice(0, 20),
      sections: payload.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({
          id: r.id,
          title: r.title.slice(0, 24),
          description: r.description?.slice(0, 72) ?? "",
        })),
      })),
    },
  });
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const apiKey = process.env.GUPSHUP_API_KEY?.trim();
  const partnerNumber = process.env.GUPSHUP_PARTNER_NUMBER?.trim();
  if (!apiKey || !partnerNumber) return;

  try {
    const params = new URLSearchParams({
      channel: "whatsapp",
      source: partnerNumber.replace(/^\+/, ""),
      messageId,
    });
    await fetch("https://api.gupshup.io/wa/api/v1/msg/read", {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    console.error("[gupshupClient] markAsRead failed:", err);
  }
}

export async function sendTypingIndicator(phone: string): Promise<void> {
  const apiKey = process.env.GUPSHUP_API_KEY?.trim();
  const appName = process.env.GUPSHUP_APP_NAME?.trim();
  const partnerNumber = process.env.GUPSHUP_PARTNER_NUMBER?.trim();
  if (!apiKey || !appName || !partnerNumber) return;

  try {
    const params = new URLSearchParams({
      channel: "whatsapp",
      source: partnerNumber.replace(/^\+/, ""),
      destination: phone.replace(/^\+/, ""),
      "src.name": appName,
      message: JSON.stringify({ type: "action", action: "typing" }),
    });
    await fetch(GUPSHUP_API_URL, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    console.error("[gupshupClient] typing indicator failed:", err);
  }
}

export async function sendGupshupMessage(
  phone: string,
  payload: GupshupOutboundPayload,
): Promise<void> {
  const apiKey = process.env.GUPSHUP_API_KEY?.trim();
  const appName = process.env.GUPSHUP_APP_NAME?.trim();
  const partnerNumber = process.env.GUPSHUP_PARTNER_NUMBER?.trim();

  if (!apiKey || !appName || !partnerNumber) {
    console.error("[gupshupClient] GUPSHUP_API_KEY, GUPSHUP_APP_NAME, or GUPSHUP_PARTNER_NUMBER is not configured; cannot send message");
    return;
  }

  const formBody = new URLSearchParams({
    channel: "whatsapp",
    source: partnerNumber.replace(/^\+/, ""),
    destination: phone.replace(/^\+/, ""),
    message: buildMessageBody(payload),
    "src.name": appName,
  });

  if (payload.type === "buttons" || payload.type === "list") {
    formBody.set("encode", "true");
  }

  try {
    const res = await fetch(GUPSHUP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
      body: formBody,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable body)");
      console.error(`[gupshupClient] Send failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.error("[gupshupClient] Network error sending message:", err);
  }
}

/**
 * Sends a lead assignment notification to the assigned agent via WhatsApp.
 * Looks up the agent's phone from profiles. Fire-and-forget safe — never throws.
 */
export async function sendLeadAssignmentNotification(
  agentId: string,
  leadName: string,
  leadPhone: string,
): Promise<void> {
  try {
    const supabase = getServiceSupabaseClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("id", agentId)
      .single();

    if (error || !profile) {
      console.warn("[gupshupClient] sendLeadAssignmentNotification: could not fetch agent profile for", agentId);
      return;
    }

    const agentPhone = profile.phone as string | null;
    if (!agentPhone) {
      console.warn("[gupshupClient] sendLeadAssignmentNotification: agent has no phone number, skipping. agent:", agentId);
      return;
    }

    const apiKey = process.env.GUPSHUP_API_KEY?.trim();
    const appName = process.env.GUPSHUP_APP_NAME?.trim();
    const partnerNumber = process.env.GUPSHUP_PARTNER_NUMBER?.trim();
    if (!apiKey || !appName || !partnerNumber) {
      console.error("[gupshupClient] sendLeadAssignmentNotification: missing Gupshup env vars");
      return;
    }

    const templatePayload = {
      id: "5df612fe-faf2-4038-9da6-276da0350523",
      params: [
        leadName,
        leadPhone || "not provided",
      ],
    };

    const formBody = new URLSearchParams({
      channel: "whatsapp",
      source: partnerNumber.replace(/^\+/, ""),
      destination: agentPhone.replace(/^\+/, ""),
      "src.name": appName,
      template: JSON.stringify(templatePayload),
    });

    const res = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable body)");
      console.error(`[gupshupClient] Template send failed (${res.status}): ${text}`);
    }

    console.log("[gupshupClient] Lead assignment notification sent, agent:", agentId, "phone suffix:", agentPhone.slice(-4));
  } catch (err) {
    console.error("[gupshupClient] sendLeadAssignmentNotification failed (non-fatal):", err);
  }
}
