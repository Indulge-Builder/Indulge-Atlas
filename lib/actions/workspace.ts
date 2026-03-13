"use server";

import { createClient } from "@/lib/supabase/server";
import type { TaskWithLead } from "@/lib/types/database";

export async function getTodaysTasks(): Promise<TaskWithLead[]> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return [];

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0
  ).toISOString();

  const startOfTomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  ).toISOString();

  const { data } = await supabase
    .from("tasks")
    .select(
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status)"
    )
    .eq("assigned_to", user.id)
    .gte("due_date", startOfToday)
    .lt("due_date", startOfTomorrow)
    .order("due_date", { ascending: true });

  return (data ?? []) as TaskWithLead[];
}
