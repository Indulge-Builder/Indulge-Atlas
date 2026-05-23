import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { timingSafeEqual } from "crypto";
import { checkWebhookRateLimit } from "@/lib/utils/rateLimit";
import { sanitizeText } from "@/lib/utils/sanitize";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { processBotTurn } from "@/lib/services/gupshupChatbot";

/**
 * GET  — Gupshup endpoint verification (returns 200 OK).
 * POST — Gupshup inbound message webhook.
 *
 * Env:
 * - GUPSHUP_WEBHOOK_SECRET — compared timing-safely against the x-gupshup-secret header value
 */

function verifyGupshupSecret(
  headerValue: string | null,
  secret: string,
): boolean {
  if (!headerValue) return false;
  try {
    const a = Buffer.from(headerValue);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Meta v3 (Cloud API) inbound shape
type MetaV3Entry = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            type?: string;
            list_reply?: { id?: string; title?: string; description?: string };
            button_reply?: { id?: string; title?: string };
          };
        }>;
        statuses?: Array<unknown>;
      };
      field?: string;
    }>;
  }>;
};

// Gupshup v2 inbound shape (still used for status/event webhooks)
type GupshupV2Payload = {
  app?: string;
  timestamp?: number;
  version?: number;
  type?: string;
  payload?: {
    id?: string;
    source?: string;
    type?: string;
    payload?: { text?: string };
    sender?: { phone?: string; name?: string };
  };
};

function extractMessageFields(body: unknown): {
  messageId: string;
  phone: string;
  text: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as MetaV3Entry & GupshupV2Payload;

  // ── Silently ignore status/event webhooks ──────────────────────────────
  if (raw.type === "message-event" || raw.type === "billing-event") return null;
  const metaValue = raw.entry?.[0]?.changes?.[0]?.value;
  if (metaValue?.statuses) return null; // delivery receipts

  // ── Meta v3 format ─────────────────────────────────────────────────────
  if (raw.object === "whatsapp_business_account" && metaValue) {
    const message = metaValue.messages?.[0];
    if (!message) return null;

    const messageId = message.id?.trim();
    const rawPhone = message.from?.trim();
    if (!messageId || !rawPhone) return null;
    const phone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

    const msgType = message.type;
    let text: string | undefined;

    if (msgType === "text") {
      text = message.text?.body?.trim();
    } else if (msgType === "interactive") {
      const iType = message.interactive?.type;
      if (iType === "list_reply") {
        text = message.interactive?.list_reply?.title?.trim();
      } else if (iType === "button_reply") {
        text = message.interactive?.button_reply?.title?.trim();
      }
    } else {
      // Unsupported media types — log and skip
      console.log(`[webhook] skipping unsupported message type: ${msgType}, phone suffix: ${rawPhone.slice(-4)}`);
      return null;
    }

    if (!text) return null;

    console.log("[webhook] parsed message, format: meta_v3, type:", msgType, "phone suffix:", rawPhone.slice(-4));
    return { messageId, phone, text };
  }

  // ── Gupshup v2 fallback (status events + legacy format) ───────────────
  if (raw.type !== "message") return null;
  const outer = raw.payload;
  if (!outer || outer.type !== "text") return null;

  const messageId = outer.id?.trim();
  const rawPhone = outer.source?.trim();
  const text = outer.payload?.text?.trim();
  if (!messageId || !rawPhone || !text) return null;

  console.log("[webhook] parsed message, format: gupshup_v2, type: text, phone suffix:", rawPhone.slice(-4));
  return { messageId, phone: `+${rawPhone}`, text };
}

async function isDuplicate(messageId: string): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const { data } = await supabase
    .from("webhook_logs")
    .select("id")
    .eq("source", "gupshup")
    .contains("raw_payload", { messageId })
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function logAndProcess(rawBody: string): Promise<void> {
  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.warn("[webhooks/gupshup] Unparseable body; skipping");
    return;
  }

  const fields = extractMessageFields(payload);
  if (!fields) return; // not a text message event; silently ignore

  // Deduplication — check if this messageId was already processed
  const dup = await isDuplicate(fields.messageId);
  if (dup) return;

  // Log raw payload (fire-and-forget; include messageId at top level for dedup query)
  const supabase = getServiceSupabaseClient();
  void supabase
    .from("webhook_logs")
    .insert({
      source: "gupshup",
      raw_payload: {
        messageId: fields.messageId,
        ...(typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>)
          : {}),
      },
    } as never)
    .then(({ error }) => {
      if (error) console.error("[webhooks/gupshup] webhook_logs insert failed:", error.message);
    });

  const safeText = sanitizeText(fields.text);
  if (!safeText.trim()) return;

  try {
    await processBotTurn(fields.phone, safeText);
  } catch (err) {
    console.error("[webhooks/gupshup] processBotTurn error:", err);
  }
}

export async function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const rl = await checkWebhookRateLimit(request);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const webhookSecret = process.env.GUPSHUP_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[webhooks/gupshup] GUPSHUP_WEBHOOK_SECRET is not configured; refusing POST");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const rawBody = await request.text();

  const incomingSecret = request.headers.get("x-gupshup-secret");
  if (!incomingSecret) {
    console.warn("[webhooks/gupshup] Missing x-gupshup-secret header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!verifyGupshupSecret(incomingSecret, webhookSecret)) {
    console.warn("[webhooks/gupshup] Invalid x-gupshup-secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return 200 immediately — Gupshup requires < 5s response
  after(async () => {
    try {
      await logAndProcess(rawBody);
    } catch (err) {
      console.error("[webhooks/gupshup] Unhandled after() error:", err);
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
