import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { checkWebhookRateLimit } from "@/lib/utils/rateLimit";
import { e164LookupVariants, normalizeToE164 } from "@/lib/utils/phone";
import { sanitizeText } from "@/lib/utils/sanitize";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { processAndInsertLead } from "@/lib/services/leadIngestion";

/**
 * GET — Meta webhook verification (hub.challenge).
 * POST — WhatsApp Cloud API `messages` notifications (two-way sync).
 *
 * Env:
 * - WHATSAPP_VERIFY_TOKEN — must match Meta dashboard “Verify token”
 * - WHATSAPP_APP_SECRET — required for POST; body must match X-Hub-Signature-256 (HMAC-SHA256)
 */

function normalizeWaIdToDigits(waId: string): string {
  return waId.replace(/\D/g, "");
}

function splitDisplayName(fullName: string): {
  first_name: string;
  last_name: string | null;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { first_name: "WhatsApp Lead", last_name: null };
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { first_name: trimmed, last_name: null };
  return {
    first_name: trimmed.slice(0, spaceIdx),
    last_name: trimmed.slice(spaceIdx + 1).trim() || null,
  };
}

function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const receivedHex = signatureHeader.slice(7);
  try {
    const a = Buffer.from(receivedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function resolveProfileName(
  contacts: unknown[],
  fromRaw: string,
): string | null {
  const target = normalizeWaIdToDigits(fromRaw);
  for (const c of contacts) {
    if (!c || typeof c !== "object") continue;
    const waId = (c as { wa_id?: unknown }).wa_id;
    if (normalizeWaIdToDigits(String(waId ?? "")) !== target) continue;
    const profile = (c as { profile?: { name?: unknown } }).profile;
    const name = profile?.name;
    if (name == null) return null;
    const s = String(name).trim();
    return s || null;
  }
  return null;
}

function extractMessageBody(m: Record<string, unknown>): string | null {
  const type = m.type != null ? String(m.type) : "";

  if (type === "text" && m.text && typeof m.text === "object") {
    const body = (m.text as { body?: unknown }).body;
    if (body == null) return "";
    return String(body);
  }

  if (type === "button" && m.button && typeof m.button === "object") {
    const text = (m.button as { text?: unknown }).text;
    if (text != null) return String(text);
    const payload = (m.button as { payload?: unknown }).payload;
    if (payload != null) return String(payload);
    return null;
  }

  if (type === "interactive" && m.interactive && typeof m.interactive === "object") {
    const ir = m.interactive as Record<string, unknown>;
    if (ir.type === "button_reply" && ir.button_reply && typeof ir.button_reply === "object") {
      const title = (ir.button_reply as { title?: unknown }).title;
      if (title != null) return String(title);
    }
    if (ir.type === "list_reply" && ir.list_reply && typeof ir.list_reply === "object") {
      const title = (ir.list_reply as { title?: unknown }).title;
      if (title != null) return String(title);
    }
    return null;
  }

  if (type === "image" && m.image && typeof m.image === "object") {
    const cap = (m.image as { caption?: unknown }).caption;
    if (cap != null && String(cap).trim()) return String(cap);
    return null;
  }

  if (type === "video" && m.video && typeof m.video === "object") {
    const cap = (m.video as { caption?: unknown }).caption;
    if (cap != null && String(cap).trim()) return String(cap);
    return null;
  }

  if (type === "document" && m.document && typeof m.document === "object") {
    const cap = (m.document as { caption?: unknown }).caption;
    if (cap != null && String(cap).trim()) return String(cap);
    return null;
  }

  return null;
}

type IncomingChat = {
  waDigits: string;
  waIdRaw: string;
  messageId: string;
  bodyText: string;
  profileName: string | null;
};

function extractIncomingChats(payload: unknown): IncomingChat[] {
  const out: IncomingChat[] = [];
  if (!payload || typeof payload !== "object") return out;
  const obj = payload as Record<string, unknown>;
  if (obj.object !== "whatsapp_business_account") return out;

  const entries = obj.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const ch = change as { field?: string; value?: unknown };
      if (ch.field !== "messages") continue;

      const value = ch.value;
      if (!value || typeof value !== "object") continue;
      const v = value as {
        contacts?: unknown[];
        messages?: unknown[];
      };

      const contacts = Array.isArray(v.contacts) ? v.contacts : [];
      const messages = Array.isArray(v.messages) ? v.messages : [];

      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const m = msg as Record<string, unknown>;
        const from = m.from != null ? String(m.from) : "";
        const id = m.id != null ? String(m.id) : "";
        if (!from || !id) continue;

        const waDigits = normalizeWaIdToDigits(from);
        if (!waDigits) continue;

        const bodyText = extractMessageBody(m);
        if (bodyText === null) continue;
        if (String(bodyText).trim() === "") continue;

        const profileName = resolveProfileName(contacts, from);

        out.push({
          waDigits,
          waIdRaw: from,
          messageId: id,
          bodyText,
          profileName,
        });
      }
    }
  }
  return out;
}

async function findLeadIdByWhatsAppFrom(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  waFrom: string,
): Promise<string | null> {
  const e164 = normalizeToE164(waFrom, "IN");
  const variants = e164LookupVariants(e164);
  if (variants.length === 0) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .in("phone_number", variants)
    .limit(2);

  if (error || !data?.length) return null;
  return (data[0] as { id: string }).id;
}

async function processIncomingChatItem(item: IncomingChat): Promise<void> {
  const supabase = getServiceSupabaseClient();

  const { data: dup } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("wa_message_id", item.messageId)
    .maybeSingle();

  if (dup) return;

  const leadId = await findLeadIdByWhatsAppFrom(supabase, item.waIdRaw);

  const safeContent = sanitizeText(item.bodyText);

  if (leadId) {
    const { error } = await supabase.from("whatsapp_messages").insert({
      lead_id: leadId,
      direction: "inbound",
      message_type: "text",
      content: safeContent,
      status: "delivered",
      wa_message_id: item.messageId,
    } as never);
    if (error) {
      console.error(
        "[webhooks/whatsapp] Inbound insert failed:",
        error.message,
      );
    }
    return;
  }

  const names = item.profileName
    ? splitDisplayName(sanitizeText(item.profileName))
    : { first_name: "WhatsApp Lead", last_name: null };

  const result = await processAndInsertLead(
    {
      first_name: names.first_name,
      last_name: names.last_name,
      phone_number: normalizeToE164(item.waIdRaw, "IN"),
      utm_source: "whatsapp",
      utm_medium: "whatsapp_cloud",
      message: safeContent,
      form_data: {
        whatsapp_wa_id: item.waIdRaw,
        whatsapp_message_id: item.messageId,
      },
    },
    "meta",
  );

  if (!result.success) {
    console.error("[webhooks/whatsapp] New lead failed:", result.error);
    return;
  }

  const { error: msgErr } = await supabase.from("whatsapp_messages").insert({
    lead_id: result.lead_id,
    direction: "inbound",
    message_type: "text",
    content: safeContent,
    status: "delivered",
    wa_message_id: item.messageId,
  } as never);

  if (msgErr) {
    console.error(
      "[webhooks/whatsapp] Inbound log after lead create failed:",
      msgErr.message,
    );
  }
}

async function handleWhatsAppWebhookPayload(payload: unknown): Promise<void> {
  const items = extractIncomingChats(payload);
  for (const item of items) {
    try {
      await processIncomingChatItem(item);
    } catch (e) {
      console.error("[webhooks/whatsapp] Item processing error:", e);
    }
  }
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    challenge &&
    expected &&
    token === expected
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rl = await checkWebhookRateLimit(request);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret?.trim()) {
    console.error(
      "[webhooks/whatsapp] WHATSAPP_APP_SECRET is not configured; refusing POST",
    );
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  const sig = request.headers.get("x-hub-signature-256");
  if (!sig) {
    console.warn("[webhooks/whatsapp] Missing X-Hub-Signature-256");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!verifyMetaSignature(rawBody, sig, appSecret)) {
    console.warn("[webhooks/whatsapp] Invalid X-Hub-Signature-256");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  after(async () => {
    await handleWhatsAppWebhookPayload(payload);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
