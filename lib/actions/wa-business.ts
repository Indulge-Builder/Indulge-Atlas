"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { sendGupshupMessage } from "@/lib/services/gupshupClient";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { BotMessage, BotSession } from "@/lib/types/database";

const ALLOWED_ROLES = ["admin", "founder", "manager", "agent"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

function isAllowedRole(role: string): role is AllowedRole {
  return ALLOWED_ROLES.includes(role as AllowedRole);
}

export async function getWaSessions(): Promise<BotSession[]> {
  await getAuthUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[wa-business] getWaSessions error:", error.message);
    return [];
  }

  return (data ?? []) as BotSession[];
}

export async function getWaMessages(sessionId: string): Promise<BotMessage[]> {
  await getAuthUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bot_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[wa-business] getWaMessages error:", error.message);
    return [];
  }

  return (data ?? []) as BotMessage[];
}

export async function sendAgentMessage(
  sessionId: string,
  phone: string,
  text: string,
): Promise<void> {
  const { role } = await getAuthUser();

  if (!isAllowedRole(role)) {
    throw new Error("Unauthorized");
  }

  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message cannot be empty");
  if (trimmed.length > 1000) throw new Error("Message must be under 1000 characters");

  const sanitized = sanitizeText(trimmed);

  try {
    await sendGupshupMessage(phone, { type: "text", text: sanitized });

    const svc = getServiceSupabaseClient();

    const { error: insertError } = await svc.from("bot_messages").insert({
      session_id: sessionId,
      phone,
      role: "agent",
      content: sanitized,
    });
    if (insertError) throw new Error(insertError.message);

    const { error: updateError } = await svc
      .from("bot_sessions")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (updateError) throw new Error(updateError.message);

    console.log(`[wa-business] Agent message sent, session: ${sessionId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send message";
    console.error("[wa-business] sendAgentMessage error:", msg);
    throw new Error(msg);
  }
}

export async function takeOverSession(sessionId: string): Promise<void> {
  const { role } = await getAuthUser();

  if (!isAllowedRole(role)) {
    throw new Error("Unauthorized");
  }

  try {
    const svc = getServiceSupabaseClient();

    const { data: session, error: fetchError } = await svc
      .from("bot_sessions")
      .select("id, phone, state")
      .eq("id", sessionId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error: updateError } = await svc
      .from("bot_sessions")
      .update({ state: "handed_off" })
      .eq("id", sessionId);
    if (updateError) throw new Error(updateError.message);

    if (session.state !== "handed_off") {
      const { error: msgError } = await svc.from("bot_messages").insert({
        session_id: sessionId,
        phone: session.phone,
        role: "assistant",
        content: "🤝 Agent has taken over this conversation.",
      });
      if (msgError) throw new Error(msgError.message);
    }

    console.log(`[wa-business] Session taken over: ${sessionId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to take over session";
    console.error("[wa-business] takeOverSession error:", msg);
    throw new Error(msg);
  }
}
