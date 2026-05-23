"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import type { BotMessage, BotSession } from "@/lib/types/database";

export async function getWaSessions(): Promise<BotSession[]> {
  await getAuthUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(50);

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
