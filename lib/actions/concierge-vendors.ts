"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { sanitizeText } from "@/lib/utils/sanitize";
import { normalizeToE164 } from "@/lib/utils/phone";
import { isPrivilegedRole } from "@/lib/types/database";
import type {
  Vendor,
  VendorFeedback,
  VendorPromptness,
  VendorCostBand,
  VendorDelivery,
  VendorProfile,
  VendorScorecardSummary,
  VendorOrderInvoice,
} from "@/lib/types/database";
import { vendorInputSchema, vendorFeedbackSchema } from "@/lib/schemas/concierge";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

function canTouchVendors(role: string, department: string | null): boolean {
  return isPrivilegedRole(role) || department === "concierge" || department === "finance";
}

// ── findOrCreateVendor (dedupe on lower(name)+phone) ──────────────────────────

export async function findOrCreateVendor(
  input: unknown,
): Promise<ActionResult<{ vendorId: string; deduped: boolean }>> {
  const parsed = vendorInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  try {
    const { supabase, user, role, department } = await getAuthUser();
    if (!canTouchVendors(role, department)) {
      return { success: false, error: "You don't have permission to manage vendors." };
    }

    const name = sanitizeText(v.name);
    const phone = v.phone ? normalizeToE164(sanitizeText(v.phone)) || null : null;

    // Dedupe: exact (lower(name), phone) — mirrors the unique index.
    const { data: existing } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", name)
      .eq("phone", phone ?? "")
      .maybeSingle();
    if (existing) return { success: true, data: { vendorId: existing.id as string, deduped: true } };

    const email = v.email && v.email !== "" ? sanitizeText(v.email) : null;
    const { data: created, error } = await supabase
      .from("vendors")
      .insert({
        name,
        company: v.company ? sanitizeText(v.company) : null,
        phone,
        email,
        poc: v.poc ? sanitizeText(v.poc) : null,
        location: v.location ? sanitizeText(v.location) : null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      // Unique-violation race → fetch the existing row.
      const { data: race } = await supabase.from("vendors").select("id").ilike("name", name).eq("phone", phone ?? "").maybeSingle();
      if (race) return { success: true, data: { vendorId: race.id as string, deduped: true } };
      console.error("[findOrCreateVendor]", error);
      return { success: false, error: "Could not save the vendor." };
    }
    return { success: true, data: { vendorId: created!.id as string, deduped: false } };
  } catch (err) {
    console.error("[findOrCreateVendor]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function getVendors(search?: string): Promise<Vendor[]> {
  try {
    const { supabase } = await getAuthUser();
    let q = supabase.from("vendors").select("*").order("name", { ascending: true }).limit(50);
    if (search && search.trim()) q = q.ilike("name", `%${search.trim()}%`);
    const { data } = await q;
    return (data as Vendor[]) ?? [];
  } catch (err) {
    console.error("[getVendors]", err);
    return [];
  }
}

/**
 * Full vendor profile for the directory: the vendor row, an aggregated scorecard
 * (Speed / Quality / Cost derived from vendor_feedback), and order history (count +
 * last 10 invoices from ticket_invoices). RLS scopes what invoices/feedback a given
 * user can read; admins/finance see everything. Vendors themselves are shared across
 * all Queendoms (migration 107).
 */
export async function getVendorProfile(vendorId: string): Promise<VendorProfile | null> {
  try {
    const { supabase } = await getAuthUser();

    const { data: vendor } = await supabase.from("vendors").select("*").eq("id", vendorId).maybeSingle();
    if (!vendor) return null;

    const { data: fb } = await supabase
      .from("vendor_feedback")
      .select("quality, promptness, cost, delivery")
      .eq("vendor_id", vendorId);
    const rows =
      (fb as Pick<VendorFeedback, "quality" | "promptness" | "cost" | "delivery">[] | null) ?? [];
    const feedbackCount = rows.length;

    let avgQuality: number | null = null;
    let speedGood: boolean | null = null;
    let costDown: boolean | null = null;
    if (feedbackCount > 0) {
      avgQuality = Math.round((rows.reduce((a, r) => a + r.quality, 0) / feedbackCount) * 10) / 10;
      // Majority "good" promptness (anything faster than 2–3 days).
      const speedy = rows.filter((r) => r.promptness !== "2_3_days").length;
      speedGood = speedy * 2 >= feedbackCount;
      // Majority favourable cost (anything below high/premium) → downward/good trend.
      const favourable = rows.filter((r) => r.cost !== "high_premium").length;
      costDown = favourable * 2 >= feedbackCount;
    }
    const scorecard: VendorScorecardSummary = {
      feedbackCount,
      avgQuality,
      speedGood,
      qualityGood: avgQuality != null ? avgQuality >= 3.5 : null,
      costDown,
    };

    const { data: invs, count } = await supabase
      .from("ticket_invoices")
      .select(
        "id, ticket_id, client_name, description, selling_price, created_at, ticket:concierge_tickets!ticket_id(ref_number)",
        { count: "exact" },
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(10);

    const invoices: VendorOrderInvoice[] = ((invs as any[]) ?? []).map((r) => ({
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      ref_number: (r.ticket?.ref_number as number | null) ?? null,
      client_name: r.client_name as string,
      description: r.description as string,
      selling_price: r.selling_price as number,
      created_at: r.created_at as string,
    }));

    return { vendor: vendor as Vendor, scorecard, orderCount: count ?? invoices.length, invoices };
  } catch (err) {
    console.error("[getVendorProfile]", err);
    return null;
  }
}

export async function setPrimaryVendor(ticketId: string, vendorId: string | null): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase.from("concierge_tickets").update({ primary_vendor_id: vendorId }).eq("id", ticketId);
    if (error) return { success: false, error: "You don't have permission to update this ticket." };
    revalidatePath(`/concierge/tickets/${ticketId}`);
    return { success: true };
  } catch (err) {
    console.error("[setPrimaryVendor]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Vendor feedback + trust recompute ─────────────────────────────────────────

const PROMPTNESS_SCORE: Record<VendorPromptness, number> = { within_1h: 1, within_24h: 0.6, "2_3_days": 0.3 };
const COST_SCORE: Record<VendorCostBand, number> = { lowest: 1, moderate: 0.6, high_premium: 0.3 };
const DELIVERY_SCORE: Record<VendorDelivery, number> = { on_time: 1, delay: 0.5, poor_communication: 0.2 };

export async function submitVendorFeedback(input: unknown): Promise<ActionResult<{ trustScore: number }>> {
  const parsed = vendorFeedbackSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const fb = parsed.data;

  try {
    const { supabase, user } = await getAuthUser();

    const { error: insErr } = await supabase.from("vendor_feedback").insert({
      vendor_id: fb.vendorId,
      ticket_id: fb.ticketId,
      quality: fb.quality,
      promptness: fb.promptness,
      cost: fb.cost,
      delivery: fb.delivery,
      created_by: user.id,
    });
    if (insErr) return { success: false, error: "You don't have permission to submit feedback for this ticket." };

    // Recompute trust from all feedback for the vendor.
    const { data: all } = await supabase
      .from("vendor_feedback")
      .select("quality, promptness, cost, delivery")
      .eq("vendor_id", fb.vendorId);
    const rows = all ?? [];
    let trust = 0;
    if (rows.length > 0) {
      const sum = rows.reduce((acc, r) => {
        const q = (r.quality as number) / 5;
        const p = PROMPTNESS_SCORE[r.promptness as VendorPromptness] ?? 0;
        const c = COST_SCORE[r.cost as VendorCostBand] ?? 0;
        const d = DELIVERY_SCORE[r.delivery as VendorDelivery] ?? 0;
        return acc + (q + p + c + d) / 4;
      }, 0);
      trust = Math.round((sum / rows.length) * 1000) / 10; // 0..100, 1 decimal
    }
    await supabase.from("vendors").update({ trust_score: trust }).eq("id", fb.vendorId);

    revalidatePath(`/concierge/tickets/${fb.ticketId}`);
    return { success: true, data: { trustScore: trust } };
  } catch (err) {
    console.error("[submitVendorFeedback]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
