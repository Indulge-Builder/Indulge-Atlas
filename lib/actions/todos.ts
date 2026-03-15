"use server";

import { createClient } from "@/lib/supabase/server";

export interface PersonalTodo {
  id: string;
  user_id: string;
  content: string;
  is_completed: boolean;
  created_at: string;
}

export async function getTodos(): Promise<PersonalTodo[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  const { data } = await supabase
    .from("personal_todos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data ?? []) as PersonalTodo[];
}

export async function addTodo(
  content: string
): Promise<{ data: PersonalTodo | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: "Not authenticated" };
  }
  if (!content.trim()) {
    return { data: null, error: "Content is required" };
  }

  const { data, error } = await supabase
    .from("personal_todos")
    .insert({ user_id: user.id, content: content.trim() })
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message ?? "Failed to save",
    };
  }
  return { data: data as PersonalTodo, error: null };
}

export async function toggleTodo(
  id: string,
  is_completed: boolean
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { error } = await supabase
    .from("personal_todos")
    .update({ is_completed })
    .eq("id", id)
    .eq("user_id", user.id);

  return !error;
}

export async function deleteTodo(id: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { error } = await supabase
    .from("personal_todos")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  return !error;
}
