/**
 * Gupshup outbound message client.
 * Server-only — never import from client components.
 *
 * Env: GUPSHUP_API_KEY, GUPSHUP_APP_NAME
 */

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
    console.log('[gupshupClient:debug] sending type:', payload.type)
    console.log('[gupshupClient:debug] params keys:',
      Array.from(formBody.keys()).join(', '))
    console.log('[gupshupClient:debug] message field:',
      formBody.get('message')?.slice(0, 200))
    console.log('[gupshupClient:debug] encode field:',
      formBody.get('encode'))
    console.log('[gupshupClient:debug] form body string:',
      formBody.toString().slice(0, 500))
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
