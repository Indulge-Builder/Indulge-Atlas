"use server";

/**
 * Admin-configurable ticket settings (build spec §2 "Admin Configurable Ticket
 * Settings"). CRUD for the reference tables that ship seeded but were previously
 * only editable via SQL: categories/subcategories, checklist templates, and canned
 * responses. SLA policies have their own module (concierge-sla-policies.ts).
 *
 * All writes are admin/founder/super_admin only (mirrors the config-table RLS in
 * migration 107). Statuses remain a fixed code state machine and are intentionally
 * NOT editable here.
 */
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { sanitizeText } from "@/lib/utils/sanitize";
import { isPrivilegedRole } from "@/lib/types/database";
import type {
  TicketCategory,
  TicketChecklistTemplate,
  CannedResponse,
} from "@/lib/types/database";
import {
  ticketCategorySchema,
  checklistTemplateSchema,
  cannedResponseSchema,
} from "@/lib/schemas/concierge";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

const REVALIDATE = "/admin/concierge-settings";

/** Resolve the caller and enforce admin. Returns null when not privileged. */
async function requireAdmin() {
  const ctx = await getAuthUser();
  if (!isPrivilegedRole(ctx.role)) return null;
  return ctx;
}

/** Map DB errors to friendly copy for the config CRUD surfaces. */
function writeError(error: { code?: string; message?: string } | null, verb: string): string {
  if (error && (error.code === "23503" || /foreign key|violates/i.test(error.message ?? ""))) {
    return "This item is in use by existing tickets — deactivate it instead of deleting.";
  }
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message ?? ""))) {
    return "An item with that name already exists.";
  }
  if (error && /row-level security|permission|denied/i.test(error.message ?? "")) {
    return "You don't have permission to change ticket settings.";
  }
  return `Could not ${verb}.`;
}

// ── Categories / subcategories ──────────────────────────────────────────────────

/** Every category (incl. inactive), for the admin taxonomy editor. */
export async function listAllTicketCategories(): Promise<TicketCategory[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("ticket_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    return (data as TicketCategory[]) ?? [];
  } catch (err) {
    console.error("[listAllTicketCategories]", err);
    return [];
  }
}

export async function createTicketCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ticketCategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage ticket categories." };
    const { data, error } = await ctx.supabase
      .from("ticket_categories")
      .insert({
        name: sanitizeText(d.name),
        parent_id: d.parentId ?? null,
        sort_order: d.sortOrder ?? 0,
        is_active: d.isActive ?? true,
        is_retail: d.isRetail ?? false,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[createTicketCategory]", error);
      return { success: false, error: writeError(error, "create the category") };
    }
    revalidatePath(REVALIDATE);
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createTicketCategory]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateTicketCategory(id: string, input: unknown): Promise<ActionResult> {
  const parsed = ticketCategorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage ticket categories." };
    // parent_id is intentionally not re-parented here — moving a category between
    // levels would strand its subcategories/tickets. Delete + recreate to move.
    const patch: Record<string, unknown> = { name: sanitizeText(d.name) };
    if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
    if (d.isActive !== undefined) patch.is_active = d.isActive;
    if (d.isRetail !== undefined) patch.is_retail = d.isRetail;
    const { error } = await ctx.supabase.from("ticket_categories").update(patch).eq("id", id);
    if (error) {
      console.error("[updateTicketCategory]", error);
      return { success: false, error: writeError(error, "update the category") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[updateTicketCategory]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function toggleTicketCategoryActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage ticket categories." };
    const { error } = await ctx.supabase.from("ticket_categories").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: writeError(error, "update the category") };
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[toggleTicketCategoryActive]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteTicketCategory(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage ticket categories." };
    const { error } = await ctx.supabase.from("ticket_categories").delete().eq("id", id);
    if (error) {
      console.error("[deleteTicketCategory]", error);
      return { success: false, error: writeError(error, "delete the category") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[deleteTicketCategory]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Checklist templates ─────────────────────────────────────────────────────────

/** Every checklist template (incl. inactive). The client groups these by category. */
export async function listAllChecklistTemplates(): Promise<TicketChecklistTemplate[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("ticket_checklist_templates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    return (data as TicketChecklistTemplate[]) ?? [];
  } catch (err) {
    console.error("[listAllChecklistTemplates]", err);
    return [];
  }
}

export async function createChecklistTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage checklists." };
    const { data, error } = await ctx.supabase
      .from("ticket_checklist_templates")
      .insert({
        category_id: d.categoryId,
        label: sanitizeText(d.label),
        sort_order: d.sortOrder ?? 0,
        is_active: d.isActive ?? true,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[createChecklistTemplate]", error);
      return { success: false, error: writeError(error, "add the checklist item") };
    }
    revalidatePath(REVALIDATE);
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createChecklistTemplate]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateChecklistTemplate(id: string, input: unknown): Promise<ActionResult> {
  const parsed = checklistTemplateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage checklists." };
    const patch: Record<string, unknown> = { label: sanitizeText(d.label), category_id: d.categoryId };
    if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
    if (d.isActive !== undefined) patch.is_active = d.isActive;
    const { error } = await ctx.supabase.from("ticket_checklist_templates").update(patch).eq("id", id);
    if (error) {
      console.error("[updateChecklistTemplate]", error);
      return { success: false, error: writeError(error, "update the checklist item") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[updateChecklistTemplate]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function toggleChecklistTemplateActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage checklists." };
    const { error } = await ctx.supabase.from("ticket_checklist_templates").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: writeError(error, "update the checklist item") };
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[toggleChecklistTemplateActive]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteChecklistTemplate(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage checklists." };
    // Safe: existing tickets keep their snapshotted checklist items independently.
    const { error } = await ctx.supabase.from("ticket_checklist_templates").delete().eq("id", id);
    if (error) {
      console.error("[deleteChecklistTemplate]", error);
      return { success: false, error: writeError(error, "delete the checklist item") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[deleteChecklistTemplate]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Canned responses ────────────────────────────────────────────────────────────

/** Every canned response (incl. inactive), for the admin editor. */
export async function listAllCannedResponses(): Promise<CannedResponse[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("canned_responses")
      .select("*")
      .order("name", { ascending: true });
    return (data as CannedResponse[]) ?? [];
  } catch (err) {
    console.error("[listAllCannedResponses]", err);
    return [];
  }
}

export async function createCannedResponse(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = cannedResponseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage canned responses." };
    const { data, error } = await ctx.supabase
      .from("canned_responses")
      .insert({
        name: sanitizeText(d.name),
        shortcut: d.shortcut ? sanitizeText(d.shortcut) : null,
        body_template: sanitizeText(d.bodyTemplate),
        category_id: d.categoryId ?? null,
        is_active: d.isActive ?? true,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[createCannedResponse]", error);
      return { success: false, error: writeError(error, "create the canned response") };
    }
    revalidatePath(REVALIDATE);
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createCannedResponse]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateCannedResponse(id: string, input: unknown): Promise<ActionResult> {
  const parsed = cannedResponseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage canned responses." };
    const { error } = await ctx.supabase
      .from("canned_responses")
      .update({
        name: sanitizeText(d.name),
        shortcut: d.shortcut ? sanitizeText(d.shortcut) : null,
        body_template: sanitizeText(d.bodyTemplate),
        category_id: d.categoryId ?? null,
        ...(d.isActive !== undefined ? { is_active: d.isActive } : {}),
      })
      .eq("id", id);
    if (error) {
      console.error("[updateCannedResponse]", error);
      return { success: false, error: writeError(error, "update the canned response") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[updateCannedResponse]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function toggleCannedResponseActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage canned responses." };
    const { error } = await ctx.supabase.from("canned_responses").update({ is_active: isActive }).eq("id", id);
    if (error) return { success: false, error: writeError(error, "update the canned response") };
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[toggleCannedResponseActive]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteCannedResponse(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!ctx) return { success: false, error: "Only admins can manage canned responses." };
    const { error } = await ctx.supabase.from("canned_responses").delete().eq("id", id);
    if (error) {
      console.error("[deleteCannedResponse]", error);
      return { success: false, error: writeError(error, "delete the canned response") };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[deleteCannedResponse]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
