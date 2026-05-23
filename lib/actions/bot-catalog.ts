"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import type { BotCatalogItem } from "@/lib/types/database";

const BOT_CATALOG_ADMIN_ROLES = ["admin", "founder", "super_admin", "manager"] as const;

function assertBotCatalogAdmin(role: string): void {
  if (!BOT_CATALOG_ADMIN_ROLES.includes(role as (typeof BOT_CATALOG_ADMIN_ROLES)[number])) {
    throw new Error("Forbidden");
  }
}

export async function getBotCatalogItems(): Promise<BotCatalogItem[]> {
  const { supabase, role } = await getAuthUser();
  assertBotCatalogAdmin(role);

  const { data, error } = await supabase
    .from("bot_catalog_items")
    .select(
      "id, category, name, description, image_url, price_range, tags, is_active, created_at, updated_at",
    )
    .order("category")
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as BotCatalogItem[];
}

export async function setBotCatalogItemActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, role } = await getAuthUser();
    assertBotCatalogAdmin(role);

    const { error } = await supabase
      .from("bot_catalog_items")
      .update({ is_active: isActive } as never)
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/bot-catalog");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}
