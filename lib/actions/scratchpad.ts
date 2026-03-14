"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export interface ScratchpadNote {
  id: string;
  body: string;
  created_at: string;
}

const saveScratchpadSchema = z.object({
  body: z.string().min(1, "Note is empty.").max(10_000, "Note must be under 10,000 characters."),
});

export async function saveScratchpadNote(
  body: unknown
): Promise<{ success: boolean; error?: string }> {
  const parsed = saveScratchpadSchema.safeParse(typeof body === "string" ? { body } : { body: "" });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const trimmed = parsed.data.body.trim();

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
