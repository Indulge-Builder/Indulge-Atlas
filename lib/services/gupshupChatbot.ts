/**
 * Gupshup WhatsApp bot core logic.
 * Server-only — never import from client components.
 *
 * Env: ANTHROPIC_API_KEY, GUPSHUP_API_KEY, GUPSHUP_APP_NAME
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeToE164, e164LookupVariants } from "@/lib/utils/phone";
import { sanitizeText } from "@/lib/utils/sanitize";
import { sendGupshupMessage, sendTypingIndicator } from "@/lib/services/gupshupClient";
import { processAndInsertLead } from "@/lib/services/leadIngestion";
import type { BotCatalogItem, BotClaudeResponse, BotSession } from "@/lib/types/database";

const MODEL = "claude-haiku-4-5-20251001";
const BOT_TURN_LIMIT = 7;

const FALLBACK_REPLY = "Our team will be in touch shortly. 🙏";
const HANDOFF_REPLY =
  "Our concierge team has been notified and will reach out to you shortly. Thank you for your interest! 🌟";

function buildSystemPrompt(catalogItems: BotCatalogItem[]): string {
  const catalogText = catalogItems
    .map(
      (item) =>
        `- ID: ${item.id}\n  Category: ${item.category}\n  Name: ${item.name}\n  Tags: ${item.tags?.length ? item.tags.join(", ") : "none"}\n  Description: ${item.description}\n  Price range: ${item.price_range ?? "upon request"}\n  Image: ${item.image_url ?? "none"}`,
    )
    .join("\n\n");

  return `You are Elia, a warm and knowledgeable luxury concierge for Indulge — a premium lifestyle brand. You assist clients via WhatsApp with genuine enthusiasm and deep product knowledge. You are never pushy; you offer curated recommendations and let the client lead. Use a refined, helpful tone.

CATALOG (active items only):
${catalogText || "No items currently available."}

RESPONSE FORMAT:
You MUST respond with valid JSON only. No prose, no markdown, no explanation — only the JSON object below.

{
  "intent": "<greeting|browsing|product_inquiry|interested|out_of_scope|handoff_request>",
  "category": "<watches|travel|events|sports|art|fashion|null>",
  "reply_type": "<text|image|list|buttons>",
  "text_reply": "<your reply as a string — ALWAYS populate this even when reply_type is image, list, or buttons, as a fallback>",
  "image_reply": { "product_id": "<uuid from catalog>", "caption": "<caption>" } or null,
  "list_reply": {
    "body": "<text above the list>",
    "button_text": "View Options",
    "sections": [{ "title": "<section title>", "rows": [{ "id": "<product id from catalog>", "title": "<product name max 24 chars>", "description": "<price range max 72 chars>" }] }]
  } or null,
  "buttons_reply": {
    "body": "<the question or statement>",
    "buttons": [{ "id": "<unique id>", "title": "<label max 20 chars>" }]
  } or null,
  "should_handoff": false,
  "handoff_reason": null
}

RULES:
- Set should_handoff: true when intent is "interested" or "handoff_request", or when the client explicitly asks to speak to a human.
- Use reply_type "list" when presenting 2–8 products in a category. Group all rows into one section with the category as the section title. Row id = product id from catalog. Row title = product name truncated to 24 chars. Row description = price range truncated to 72 chars. button_text = "View Options". Max 8 rows.
- Use reply_type "buttons" for yes/no questions or when offering 2–3 distinct next actions. Example after showing a product: [{ "id": "interested", "title": "I'm Interested 🙌" }, { "id": "more_options", "title": "Show More" }, { "id": "other_category", "title": "Other Categories" }]. Max 3 buttons.
- Use reply_type "image" only when showing a single specific product that has an image_url in the catalog.
- Use reply_type "text" for greetings, clarifying questions, out-of-scope messages, and handoff notices.
- Keep text_reply under 300 characters for WhatsApp readability.
- Button titles must be max 20 chars. List row titles must be max 24 chars. List row descriptions must be max 72 chars.
- Do not invent products not in the catalog.
- Match client interests using Tags (brands, locations, experience types) before recommending.
- For out-of-scope queries, politely redirect to one of the six luxury categories: watches, travel, events, sports, art, fashion.
- When reply_type is image, always populate image_reply with the product_id and a caption that includes the product name, one compelling sentence about it, and the price range. Format: "[Name] — [one sentence]. [Price range]"`;
}

async function logBotMessage(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  sessionId: string,
  phone: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  try {
    await supabase
      .from("bot_messages")
      .insert({ session_id: sessionId, phone, role, content } as never);
  } catch (err) {
    console.error("[gupshupChatbot] Failed to log bot message:", err);
  }
}

async function fetchActiveCatalog(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
): Promise<BotCatalogItem[]> {
  const { data, error } = await supabase
    .from("bot_catalog_items")
    .select("id, category, name, description, image_url, price_range, tags")
    .eq("is_active", true);

  if (error) {
    console.error("[gupshupChatbot] Failed to fetch catalog:", error.message);
    return [];
  }

  return (data ?? []) as BotCatalogItem[];
}

async function loadOrCreateSession(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  phone: string,
): Promise<BotSession> {
  const { data: existing } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) return existing as BotSession;

  const { data: created, error } = await supabase
    .from("bot_sessions")
    .insert({ phone, state: "greeting", bot_turn_count: 0 } as never)
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`[gupshupChatbot] Failed to create session for ${phone}: ${error?.message}`);
  }

  return created as BotSession;
}

type ConversationTurn = { in: string; out: string };

function buildConversationMessages(
  lastTurns: ConversationTurn[],
  currentMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of lastTurns) {
    messages.push({ role: "user", content: turn.in });
    messages.push({ role: "assistant", content: turn.out });
  }
  messages.push({ role: "user", content: currentMessage });
  return messages;
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  lastTurns: ConversationTurn[],
): Promise<BotClaudeResponse | null> {
  const apiKey = process.env.GUPSHUP_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[gupshupChatbot] GUPSHUP_ANTHROPIC_API_KEY is not configured");
    return null;
  }

  const messages = buildConversationMessages(lastTurns, userMessage);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        stream: false,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[gupshupChatbot] Anthropic API error ${res.status}: ${errText}`);
      return null;
    }

    const result = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = result.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!raw) return null;

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned) as BotClaudeResponse;
  } catch (err) {
    console.error("[gupshupChatbot] Claude call or JSON parse failed:", err);
    return null;
  }
}

async function triggerHandoff(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  phone: string,
  session: BotSession,
): Promise<void> {
  await sendGupshupMessage(phone, { type: "text", text: HANDOFF_REPLY });
  await logBotMessage(supabase, session.id, phone, "assistant", HANDOFF_REPLY);

  await supabase
    .from("bot_sessions")
    .update({
      state: "handed_off",
      last_message_at: new Date().toISOString(),
    } as never)
    .eq("id", session.id);

  console.log("[gupshupChatbot] Conversation handed off, phone:", phone);
}

async function maybeCreateLeadFromWhatsApp(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  normalizedPhone: string,
  incomingText: string,
): Promise<void> {
  try {
    // Check if a lead already exists for this number — use all variants to handle storage format differences
    const variants = e164LookupVariants(normalizedPhone);
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .in("phone_number", variants)
      .maybeSingle();

    if (existing) return;

    const result = await processAndInsertLead(
      {
        phone_number: normalizedPhone,
        utm_source: "whatsapp",
        utm_medium: "whatsapp_gupshup",
        message: sanitizeText(incomingText),
        form_data: { whatsapp_wa_id: normalizedPhone },
      },
      "website",
    );

    if (result.success) {
      console.log("[gupshupChatbot] New lead created from WhatsApp, phone suffix:", normalizedPhone.slice(-4));
    } else {
      console.error("[gupshupChatbot] Lead creation failed:", result.error);
    }
  } catch (err) {
    console.error("[gupshupChatbot] maybeCreateLeadFromWhatsApp error (non-fatal):", err);
  }
}

export async function processBotTurn(
  phone: string,
  incomingText: string,
): Promise<void> {
  if (!process.env.GUPSHUP_ANTHROPIC_API_KEY?.trim()) {
    console.error("[gupshupChatbot] GUPSHUP_ANTHROPIC_API_KEY is not configured");
    return;
  }

  const normalizedPhone = normalizeToE164(phone, "IN");
  if (!normalizedPhone) {
    console.warn("[gupshupChatbot] Could not normalize phone:", phone);
    return;
  }

  console.log(
    "[gupshupChatbot] processBotTurn started, phone suffix:",
    normalizedPhone.slice(-4),
    "text preview:",
    incomingText.slice(0, 20),
  );

  const supabase = getServiceSupabaseClient();

  // Staff guard — silently ignore messages from internal agents/staff
  try {
    const { data: staffRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (staffRow) {
      console.log("[gupshupChatbot] Inbound from staff number — skipping bot, phone suffix:", normalizedPhone.slice(-4));
      return;
    }
  } catch (err) {
    console.error("[gupshupChatbot] Staff guard check failed (proceeding):", err);
  }

  // Create a lead if this is a new number — fire-and-forget, never blocks bot
  await maybeCreateLeadFromWhatsApp(supabase, normalizedPhone, incomingText);

  let session: BotSession;
  try {
    session = await loadOrCreateSession(supabase, normalizedPhone);
  } catch (err) {
    console.error("[gupshupChatbot] Session load/create error:", err);
    return;
  }

  // Auto-reset stale sessions after 24h inactivity
  const hoursSinceLastMessage = session.last_message_at
    ? (Date.now() - new Date(session.last_message_at).getTime()) / (1000 * 60 * 60)
    : 0;

  if (hoursSinceLastMessage > 24) {
    if (session.state === "handed_off") {
      await supabase
        .from("bot_sessions")
        .update({
          state: "greeting",
          bot_turn_count: 0,
          context_jsonb: {},
          last_message_at: new Date().toISOString(),
        } as never)
        .eq("id", session.id);
      session = { ...session, state: "greeting", bot_turn_count: 0, context_jsonb: {} };
      console.log("[gupshupChatbot] Session auto-reset after 24h inactivity, phone suffix:", normalizedPhone.slice(-4));
    } else {
      await supabase
        .from("bot_sessions")
        .update({ bot_turn_count: 0, context_jsonb: {} } as never)
        .eq("id", session.id);
      session = { ...session, bot_turn_count: 0, context_jsonb: {} };
      console.log("[gupshupChatbot] Context cleared after 24h inactivity, phone suffix:", normalizedPhone.slice(-4));
    }
  }

  // Agent has taken over — stay silent
  if (session.state === "handed_off") return;

  // Log inbound message
  await logBotMessage(supabase, session.id, normalizedPhone, "user", incomingText);

  // Hard turn limit
  if (session.bot_turn_count >= BOT_TURN_LIMIT) {
    await triggerHandoff(supabase, normalizedPhone, session);
    return;
  }

  try {
    await sendTypingIndicator(normalizedPhone);
  } catch (err) {
    console.error("[gupshupChatbot] Typing indicator error:", err);
  }

  const catalog = await fetchActiveCatalog(supabase);
  const systemPrompt = buildSystemPrompt(catalog);

  // Pass conversation history so Claude has context from prior turns
  const lastTurns = (
    (session.context_jsonb?.last_turns as ConversationTurn[] | undefined) ?? []
  ).slice(-4);

  const parsed = await callClaude(systemPrompt, incomingText, lastTurns);

  // On Claude failure, send fallback text and increment turn count — do NOT hand off immediately
  if (!parsed) {
    await sendGupshupMessage(normalizedPhone, { type: "text", text: FALLBACK_REPLY });
    await logBotMessage(supabase, session.id, normalizedPhone, "assistant", FALLBACK_REPLY);
    await supabase
      .from("bot_sessions")
      .update({
        bot_turn_count: session.bot_turn_count + 1,
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", session.id);
    return;
  }

  // Send reply based on reply_type
  let sentText = parsed.text_reply;
  let replyType = parsed.reply_type;
  try {
    if (parsed.reply_type === "image" && parsed.image_reply) {
      const product = catalog.find((c) => c.id === parsed.image_reply!.product_id);
      if (product?.image_url) {
        await sendGupshupMessage(normalizedPhone, {
          type: "image",
          imageUrl: product.image_url,
          caption: parsed.image_reply.caption,
        });
        sentText = parsed.image_reply.caption;
        const followUpText =
          "Would you like to know more or speak with our concierge team?\n\n1. Tell me more\n2. I'm interested\n3. Show other watches";
        await sendGupshupMessage(normalizedPhone, { type: "text", text: followUpText });
      } else {
        // Fall back to text if product not found or has no image
        await sendGupshupMessage(normalizedPhone, { type: "text", text: parsed.text_reply });
        replyType = "text";
      }
    } else if (parsed.reply_type === "list" && parsed.list_reply) {
      // Interactive list disabled — re-enable when plan supports it:
      // await sendGupshupMessage(normalizedPhone, {
      //   type: "list",
      //   body: parsed.list_reply.body,
      //   buttonText: parsed.list_reply.button_text ?? "View Options",
      //   sections: parsed.list_reply.sections,
      // });
      const rows = parsed.list_reply.sections.flatMap((s) => s.rows);
      const listText =
        parsed.list_reply.body +
        "\n\n" +
        rows.map((r, i) => `*${i + 1}. ${r.title}*\n${r.description ?? ""}`).join("\n\n") +
        "\n\n_Reply with a number or name to learn more_";
      await sendGupshupMessage(normalizedPhone, { type: "text", text: listText });
      sentText = listText;
      replyType = "text";
    } else if (parsed.reply_type === "buttons" && parsed.buttons_reply) {
      // Interactive buttons disabled — re-enable when plan supports it:
      // await sendGupshupMessage(normalizedPhone, {
      //   type: "buttons",
      //   body: parsed.buttons_reply.body,
      //   buttons: parsed.buttons_reply.buttons,
      // });
      const btnText =
        parsed.buttons_reply.body +
        "\n\n" +
        parsed.buttons_reply.buttons.map((b, i) => `${i + 1}. ${b.title}`).join("\n");
      await sendGupshupMessage(normalizedPhone, { type: "text", text: btnText });
      sentText = btnText;
      replyType = "text";
    } else {
      // text fallback — also catches list/buttons when their payload is null
      await sendGupshupMessage(normalizedPhone, { type: "text", text: parsed.text_reply });
      replyType = "text";
    }
  } catch (err) {
    console.error("[gupshupChatbot] Message send error:", err);
  }

  console.log(
    "[gupshupChatbot] reply sent successfully, type:",
    replyType,
    "turn:",
    session.bot_turn_count + 1,
  );

  await logBotMessage(supabase, session.id, normalizedPhone, "assistant", sentText);

  // Build updated context — track last shown product ids and conversation history
  const shownProductIds: string[] = [];
  if (parsed.image_reply?.product_id) shownProductIds.push(parsed.image_reply.product_id);

  const prevContext = session.context_jsonb ?? {};
  const updatedContext: Record<string, unknown> = {
    ...prevContext,
    last_shown_products: shownProductIds,
    last_intent: parsed.intent,
    last_turns: [
      ...lastTurns,
      { in: incomingText.slice(0, 200), out: parsed.text_reply.slice(0, 200) },
    ],
  };

  // State transitions:
  // greeting → browsing (first substantive message, no category yet)
  // greeting/browsing → viewing_products (when Claude identifies a category)
  // any → handoff_pending (when Claude signals handoff)
  // handed_off is terminal and handled above
  const newState =
    parsed.should_handoff
      ? "handoff_pending"
      : parsed.category
        ? "viewing_products"
        : session.state === "greeting"
          ? "browsing"
          : session.state;

  await supabase
    .from("bot_sessions")
    .update({
      bot_turn_count: session.bot_turn_count + 1,
      last_message_at: new Date().toISOString(),
      state: newState,
      last_category: parsed.category ?? session.last_category,
      context_jsonb: updatedContext,
    } as never)
    .eq("id", session.id);

  if (parsed.should_handoff) {
    await triggerHandoff(supabase, normalizedPhone, {
      ...session,
      bot_turn_count: session.bot_turn_count + 1,
      state: "handoff_pending",
      context_jsonb: updatedContext,
    });
  }
}
