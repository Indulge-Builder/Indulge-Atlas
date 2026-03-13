"use server";

import { createClient } from "@/lib/supabase/server";

export interface ScratchpadNote {
  id: string;
  body: string;
  created_at: string;
}

const MAX_SCRATCHPAD_LENGTH = 10_000;

export async function saveScratchpadNote(
  body: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { success: false, error: "Note is empty." };
  if (trimmed.length > MAX_SCRATCHPAD_LENGTH) {
    return { success: false, error: `Note must be under ${MAX_SCRATCHPAD_LENGTH.toLocaleString()} characters.` };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("user_scratchpad_notes")
    .insert({ user_id: user.id, body: trimmed });

  if (error) return { success: false, error: error.message };

  return { success: true };
}

export async function getScratchpadNotes(): Promise<ScratchpadNote[]> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  const { data } = await supabase
    .from("user_scratchpad_notes")
    .select("id, body, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []) as ScratchpadNote[];
}
