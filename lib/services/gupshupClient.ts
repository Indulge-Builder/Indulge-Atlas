/**
 * Gupshup outbound message client.
 * Server-only — never import from client components.
 *
 * Env: GUPSHUP_API_KEY, GUPSHUP_APP_NAME
 */

const GUPSHUP_API_URL = "https://api.gupshup.io/sm/api/v1/msg";

export type GupshupTextPayload = {
  type: "text";
  text: string;
};

export type GupshupImagePayload = {
  type: "image";
  imageUrl: string;
  caption: string;
};

export type GupshupListPayload = {
  type: "list";
  title: string;
  items: Array<{ title: string; description: string }>;
};

export type GupshupOutboundPayload =
  | GupshupTextPayload
  | GupshupImagePayload
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

  // list
  return JSON.stringify({
    type: "list",
    title: payload.title,
    body: payload.title,
    msgid: `list_${Date.now()}`,
    globalButtons: [{ type: "text", title: "View options" }],
    items: [
      {
        title: payload.title,
        subtitle: payload.title,
        options: payload.items.map((item) => ({
          type: "text",
          title: item.title,
          description: item.description,
          postbackText: item.title,
        })),
      },
    ],
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
    source: partnerNumber,
    destination: phone.replace(/^\+/, ""),
    message: buildMessageBody(payload),
    "src.name": appName,
  });

  try {
    console.log("[gupshupClient:debug] apiKey prefix:", apiKey.slice(0, 8));
    console.log("[gupshupClient:debug] appName:", appName);
    console.log("[gupshupClient:debug] partnerNumber:", partnerNumber);
    console.log("[gupshupClient:debug] url:", GUPSHUP_API_URL);
    console.log("[gupshupClient:debug] body:", formBody.toString());

    const res = await fetch(GUPSHUP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
      body: formBody.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable body)");
      console.error(`[gupshupClient] Send failed (${res.status}): ${text}`);
    }
  } catch (err) {
    console.error("[gupshupClient] Network error sending message:", err);
  }
}
