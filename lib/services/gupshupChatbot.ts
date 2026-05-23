/**
 * Gupshup WhatsApp bot core logic.
 * Server-only — never import from client components.
 *
 * Env: ANTHROPIC_API_KEY, GUPSHUP_API_KEY, GUPSHUP_APP_NAME
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeToE164 } from "@/lib/utils/phone";
import { sendGupshupMessage } from "@/lib/services/gupshupClient";
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
        `- ID: ${item.id}\n  Category: ${item.category}\n  Name: ${item.name}\n  Description: ${item.description}\n  Price range: ${item.price_range ?? "upon request"}\n  Image: ${item.image_url ?? "none"}`,
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
  "reply_type": "<text|image|list>",
  "text_reply": "<your reply as a string — always populate this even when reply_type is image or list, as a fallback>",
  "image_reply": { "product_id": "<uuid from catalog>", "caption": "<caption>" } or null,
  "list_reply": { "title": "<list title>", "items": [{ "title": "<item title>", "description": "<item description>" }] } or null,
  "should_handoff": false,
  "handoff_reason": null
}

RULES:
- Set should_handoff: true when intent is "interested" or "handoff_request", or when the client explicitly asks to speak to a human.
- Use reply_type "list" when presenting 2–5 products in a category.
- Use reply_type "image" only when showing a single specific product that has an image_url in the catalog.
- Use reply_type "text" for greetings, clarifying questions, out-of-scope messages, and handoff notices.
- Keep text_reply under 300 characters for WhatsApp readability.
- list_reply.items must have 2–5 entries.
- Do not invent products not in the catalog.
- For out-of-scope queries, politely redirect to one of the six luxury categories.`;
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

async function callClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<BotClaudeResponse | null> {
  const apiKey = process.env.GUPSHUP_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[gupshupChatbot] GUPSHUP_ANTHROPIC_API_KEY is not configured");
    return null;
  }

  console.log('[chatbot:debug] step6.5 calling claude, api key prefix:', process.env.GUPSHUP_ANTHROPIC_API_KEY?.slice(0, 8) ?? 'MISSING')
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
        max_tokens: 1024,
        stream: false,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[gupshupChatbot] Anthropic API error ${res.status}: ${errText}`);
      return null;
    }

    const result = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    console.log('[chatbot:debug] step7.5 claude raw response received, content blocks:', result?.content?.length ?? 'null')
    const raw = result.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!raw) return null;

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned) as BotClaudeResponse;
  } catch (err) {
    console.error("[gupshupChatbot] Claude call or JSON parse failed:", err);
    console.error('[chatbot:debug] claude call failed:', err)
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
  console.log('[chatbot:debug] step1 normalized phone:', normalizedPhone)

  const supabase = getServiceSupabaseClient();

  let session: BotSession;
  try {
    session = await loadOrCreateSession(supabase, normalizedPhone);
  } catch (err) {
    console.error("[gupshupChatbot] Session load/create error:", err);
    return;
  }
  console.log('[chatbot:debug] step3 session state:', session.state, 'turns:', session.bot_turn_count)

  // Agent has taken over — stay silent
  if (session.state === "handed_off") return;

  // Log inbound message
  await logBotMessage(supabase, session.id, normalizedPhone, "user", incomingText);

  // Hard turn limit
  if (session.bot_turn_count >= BOT_TURN_LIMIT) {
    await triggerHandoff(supabase, normalizedPhone, session);
    return;
  }

  const catalog = await fetchActiveCatalog(supabase);
  console.log('[chatbot:debug] step6 catalog items:', catalog.length)
  const systemPrompt = buildSystemPrompt(catalog);

  const parsed = await callClaude(systemPrompt, incomingText);
  console.log('[chatbot:debug] step7 claude response received')

  // Fallback on parse/call failure
  if (!parsed) {
    await sendGupshupMessage(normalizedPhone, { type: "text", text: FALLBACK_REPLY });
    await logBotMessage(supabase, session.id, normalizedPhone, "assistant", FALLBACK_REPLY);
    await supabase
      .from("bot_sessions")
      .update({
        bot_turn_count: session.bot_turn_count + 1,
        last_message_at: new Date().toISOString(),
        state: "handoff_pending",
      } as never)
      .eq("id", session.id);
    await triggerHandoff(supabase, normalizedPhone, {
      ...session,
      bot_turn_count: session.bot_turn_count + 1,
      state: "handoff_pending",
    });
    return;
  }

  // Send reply based on reply_type
  let sentText = parsed.text_reply;
  console.log('[chatbot:debug] step8 sending reply type:', parsed.reply_type)
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
      } else {
        // Fall back to text if product not found or has no image
        await sendGupshupMessage(normalizedPhone, { type: "text", text: parsed.text_reply });
      }
    } else if (parsed.reply_type === "list" && parsed.list_reply) {
      await sendGupshupMessage(normalizedPhone, {
        type: "list",
        title: parsed.list_reply.title,
        items: parsed.list_reply.items,
      });
      sentText = `[List] ${parsed.list_reply.title}: ${parsed.list_reply.items.map((i) => i.title).join(", ")}`;
    } else {
      await sendGupshupMessage(normalizedPhone, { type: "text", text: parsed.text_reply });
    }
  } catch (err) {
    console.error("[gupshupChatbot] Message send error:", err);
  }
  console.log('[chatbot:debug] step9 reply sent')
  await logBotMessage(supabase, session.id, normalizedPhone, "assistant", sentText);

  // Build updated context — track last shown product ids
  const shownProductIds: string[] = [];
  if (parsed.image_reply?.product_id) shownProductIds.push(parsed.image_reply.product_id);
  if (parsed.list_reply) {
    // Items don't carry ids but we store what was shown for the transcript
  }
  const prevContext = session.context_jsonb ?? {};
  const updatedContext: Record<string, unknown> = {
    ...prevContext,
    last_shown_products: shownProductIds,
    last_intent: parsed.intent,
    last_turns: [
      ...((prevContext.last_turns as Array<{ in: string; out: string }> | undefined) ?? []).slice(-4),
      { in: incomingText.slice(0, 200), out: parsed.text_reply.slice(0, 200) },
    ],
  };

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
