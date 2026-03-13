"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Conversation, Message, MessageLeadPreview, LeadStatus, Profile } from "@/lib/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

type SenderInfo = Pick<Profile, "id" | "full_name" | "role">;

// ── Zod validation ────────────────────────────────────────────────────────────

const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(4000, "Message too long"),
  leadId: z.string().uuid().nullish(),
});

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return { supabase, user };
}

// ── Messaging directory ───────────────────────────────────────────────────────
// Internal helper: builds a userId → SenderInfo map via the SECURITY DEFINER
// RPC functions. This works for ALL roles including agents who cannot read
// other profiles directly due to the profiles_select RLS policy.

async function buildSenderMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Record<string, SenderInfo>> {
  const [{ data: directory }, { data: own }] = await Promise.all([
    supabase.rpc("get_messaging_directory"),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single(),
  ]);

  const map: Record<string, SenderInfo> = {};
  (directory ?? []).forEach((p: SenderInfo) => { map[p.id] = p; });
  if (own) map[own.id] = own as SenderInfo;
  return map;
}

// ── sendMessage ───────────────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  content: string,
  leadId?: string | null
): Promise<{ success: boolean; error?: string; message?: Message }> {
  const parsed = SendMessageSchema.safeParse({ conversationId, content, leadId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }

  const { supabase, user } = await getAuthUser();

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id:       user.id,
      content:         parsed.data.content.trim(),
      ...(parsed.data.leadId ? { lead_id: parsed.data.leadId } : {}),
    })
    .select("id, conversation_id, sender_id, content, lead_id, created_at")
    .single();

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Bump the sender's last_read_at
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);

  return { success: true, message: message as Message };
}

// ── searchLeadsForAttachment ───────────────────────────────────────────────────
// Returns minimal lead data for the attachment picker inside chat threads.

export async function searchLeadsForAttachment(
  query: string
): Promise<MessageLeadPreview[]> {
  const { supabase } = await getAuthUser();

  const q = query.trim();
  let request = supabase
    .from("leads")
    .select("id, first_name, last_name, status, city")
    .not("status", "in", '("trash")')
    .order("updated_at", { ascending: false })
    .limit(20);

  if (q) {
    request = request.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }

  const { data } = await request;

  return (data ?? []).map((l) => ({
    id:        l.id,
    full_name: [l.first_name, l.last_name].filter(Boolean).join(" "),
    status:    l.status as LeadStatus,
    city:      l.city,
  }));
}

// ── getOrCreateDirectConversation ─────────────────────────────────────────────
// Uses SECURITY DEFINER RPCs (migration 021) to find or create a DM without
// hitting the cp_select RLS policy, which was causing infinite recursion.

export async function getOrCreateDirectConversation(
  otherUserId: string
): Promise<{ conversationId: string | null; error?: string }> {
  const { supabase } = await getAuthUser();

  // Step 1: look for an existing 1-on-1 conversation
  const { data: existing, error: findErr } = await supabase.rpc(
    "find_direct_conversation",
    { other_user_id: otherUserId }
  );

  if (findErr) {
    return { conversationId: null, error: findErr.message };
  }

  if (existing) {
    return { conversationId: existing as string };
  }

  // Step 2: create a new conversation (idempotent — guards race conditions)
  const { data: newConvId, error: createErr } = await supabase.rpc(
    "create_direct_conversation",
    { other_user_id: otherUserId }
  );

  if (createErr || !newConvId) {
    return {
      conversationId: null,
      error: createErr?.message ?? "Failed to create conversation",
    };
  }

  return { conversationId: newConvId as string };
}

// ── getOrCreateLeadConversation ───────────────────────────────────────────────

export async function getOrCreateLeadConversation(
  leadId: string
): Promise<{ conversationId: string | null; error?: string }> {
  const { supabase, user } = await getAuthUser();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "lead_context")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("conversation_participants")
      .upsert(
        { conversation_id: existing.id, user_id: user.id },
        { onConflict: "conversation_id,user_id" }
      );
    return { conversationId: existing.id };
  }

  const { data: newConv, error: convErr } = await supabase
    .from("conversations")
    .insert({ type: "lead_context", lead_id: leadId })
    .select("id")
    .single();

  if (convErr || !newConv) {
    return {
      conversationId: null,
      error: convErr?.message ?? "Failed to create conversation",
    };
  }

  await supabase
    .from("conversation_participants")
    .insert({ conversation_id: newConv.id, user_id: user.id });

  return { conversationId: newConv.id };
}

// ── getMyDirectConversations ──────────────────────────────────────────────────
// Single RPC call via the get_my_direct_conversations() SECURITY DEFINER
// function (migration 021). Replaces the previous 5-step client pipeline and
// avoids all cp_select RLS issues.

export interface DirectConversationRow {
  conversationId: string;
  otherUser:      SenderInfo;
  lastMessage:    string | null;
  lastMessageAt:  string | null;
  unreadCount:    number;
}

export async function getMyDirectConversations(): Promise<DirectConversationRow[]> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase.rpc("get_my_direct_conversations");

  if (error || !data) return [];

  return (data as {
    conversation_id: string;
    peer_id:         string;
    peer_name:       string;
    peer_role:       string;
    last_message:    string | null;
    last_message_at: string | null;
    unread_count:    number;
  }[]).map((row) => ({
    conversationId: row.conversation_id,
    otherUser: {
      id:        row.peer_id,
      full_name: row.peer_name,
      role:      row.peer_role as SenderInfo["role"],
    },
    lastMessage:   row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount:   Number(row.unread_count),
  }));
}

// ── getTeamMembers ────────────────────────────────────────────────────────────
// Primary path: SECURITY DEFINER RPC (works for ALL roles incl. agents).
// Fallback: direct profiles query (works for scout/admin/manager whose RLS
// policy allows reading other profiles). This ensures the member picker is
// never empty, even before migration 020 has been applied.

export async function getTeamMembers(): Promise<SenderInfo[]> {
  const { supabase, user } = await getAuthUser();

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_messaging_directory"
  );

  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData as SenderInfo[];
  }

  // RPC unavailable (migration not yet applied) or returned empty — fall back
  // to a direct profiles query. Agents will get an empty array here until the
  // SECURITY DEFINER function is deployed; all other roles will see teammates.
  const { data: directData } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("is_active", true)
    .neq("id", user.id)
    .order("full_name", { ascending: true });

  return (directData ?? []) as SenderInfo[];
}

// ── markConversationRead ──────────────────────────────────────────────────────

export async function markConversationRead(conversationId: string): Promise<void> {
  const { supabase, user } = await getAuthUser();
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
}

// ── getTotalUnreadCount ───────────────────────────────────────────────────────

export async function getTotalUnreadCount(): Promise<number> {
  const { supabase, user } = await getAuthUser();

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id);

  if (!participants?.length) return 0;

  const convIds = participants.map((p) => p.conversation_id);

  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, created_at")
    .in("conversation_id", convIds)
    .neq("sender_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!msgs?.length) return 0;

  const lastReadMap = Object.fromEntries(
    participants.map((p) => [p.conversation_id, p.last_read_at])
  );

  return msgs.filter((m) => {
    const lr = lastReadMap[m.conversation_id];
    return !lr || new Date(m.created_at) > new Date(lr);
  }).length;
}
