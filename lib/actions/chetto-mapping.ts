"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { updateClientChettoGroupId } from "@/lib/actions/clients";
import { resolveClientChettoTier2 } from "@/lib/services/chettoResolve";
import {
  canManageAnyClient,
  type ChettoSuggestionMethod,
  type ClientChettoSuggestion,
} from "@/lib/types/database";

export type ChettoMappingSuggestion = Pick<
  ClientChettoSuggestion,
  "id" | "client_id" | "chetto_group_id" | "confidence" | "method" | "evidence"
>;

async function assertChettoMappingAccess(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"]; userId: string }
  | { ok: false; error: string }
> {
  const { supabase, user, role } = await getAuthUser();
  if (!canManageAnyClient(role)) {
    return { ok: false, error: "Unauthorised" };
  }
  return { ok: true, supabase, userId: user.id };
}

export async function getPendingChettoSuggestionsForClients(
  clientIds: string[],
): Promise<{ success: boolean; suggestions: ChettoMappingSuggestion[]; error?: string }> {
  try {
    const gate = await assertChettoMappingAccess();
    if (!gate.ok) return { success: false, suggestions: [], error: gate.error };

    const ids = [...new Set(clientIds.filter((id) => z.string().uuid().safeParse(id).success))];
    if (ids.length === 0) return { success: true, suggestions: [] };

    const { data, error } = await gate.supabase
      .from("client_chetto_suggestions")
      .select("id, client_id, chetto_group_id, confidence, method, evidence")
      .in("client_id", ids)
      .eq("status", "pending")
      .order("confidence", { ascending: false });

    if (error) {
      console.error("getPendingChettoSuggestionsForClients", error);
      return { success: false, suggestions: [], error: "Failed to load suggestions" };
    }

    return {
      success: true,
      suggestions: (data ?? []) as ChettoMappingSuggestion[],
    };
  } catch (e) {
    console.error(e);
    return { success: false, suggestions: [], error: "Unexpected error" };
  }
}

async function upsertPendingSuggestion(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  clientId: string,
  groupId: string,
  confidence: number,
  method: ChettoSuggestionMethod,
  evidence: string,
): Promise<{ success: boolean; suggestion?: ChettoMappingSuggestion; error?: string }> {
  const { data: existingPending } = await supabase
    .from("client_chetto_suggestions")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "pending");

  if (existingPending?.length) {
    const otherIds = existingPending
      .map((r) => r.id as string)
      .filter(Boolean);
    if (otherIds.length > 0) {
      await supabase
        .from("client_chetto_suggestions")
        .update({ status: "rejected" })
        .in("id", otherIds);
    }
  }

  const { data, error } = await supabase
    .from("client_chetto_suggestions")
    .upsert(
      {
        client_id: clientId,
        chetto_group_id: groupId,
        confidence,
        method,
        evidence: evidence.slice(0, 2000),
        status: "pending",
        resolved_by: null,
      },
      { onConflict: "client_id,chetto_group_id" },
    )
    .select("id, client_id, chetto_group_id, confidence, method, evidence")
    .single();

  if (error) {
    console.error("upsertPendingSuggestion", error);
    return { success: false, error: "Failed to save suggestion" };
  }

  return { success: true, suggestion: data as ChettoMappingSuggestion };
}

export async function generateChettoSuggestionForClient(
  clientId: string,
): Promise<{
  success: boolean;
  suggestion?: ChettoMappingSuggestion;
  error?: string;
  noMatch?: boolean;
}> {
  try {
    const uuid = z.string().uuid().safeParse(clientId);
    if (!uuid.success) return { success: false, error: "Invalid client id" };

    const gate = await assertChettoMappingAccess();
    if (!gate.ok) return { success: false, error: gate.error };

    const { data: client, error: cErr } = await gate.supabase
      .from("clients")
      .select("id, first_name, last_name, phone_number, queendom, chetto_group_id")
      .eq("id", clientId)
      .single();

    if (cErr || !client) {
      return { success: false, error: "Client not found" };
    }

    if (client.chetto_group_id) {
      return { success: false, error: "Client already has a Chetto group id" };
    }

    const match = await resolveClientChettoTier2({
      phone: client.phone_number,
      firstName: client.first_name,
      lastName: client.last_name,
      queendom: client.queendom,
    });

    if (!match) {
      return { success: true, noMatch: true };
    }

    const saved = await upsertPendingSuggestion(
      gate.supabase,
      clientId,
      match.groupId,
      match.confidence,
      match.method,
      match.evidence,
    );

    if (!saved.success) return { success: false, error: saved.error };

    revalidatePath("/clients/chetto-mapping");
    return { success: true, suggestion: saved.suggestion };
  } catch (e) {
    console.error(e);
    return { success: false, error: "Unexpected error" };
  }
}

const batchSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
  onlyUnmapped: z.boolean().optional(),
});

export async function generateChettoSuggestionsBatch(
  raw: z.infer<typeof batchSchema> = {},
): Promise<{
  success: boolean;
  processed: number;
  matched: number;
  noMatch: number;
  errors: number;
  error?: string;
}> {
  try {
    const parsed = batchSchema.safeParse(raw);
    const opts = parsed.success ? parsed.data : {};
    const limit = opts.limit ?? 10;

    const gate = await assertChettoMappingAccess();
    if (!gate.ok) {
      return {
        success: false,
        processed: 0,
        matched: 0,
        noMatch: 0,
        errors: 0,
        error: gate.error,
      };
    }

    let query = gate.supabase
      .from("clients")
      .select("id")
      .order("first_name", { ascending: true })
      .limit(limit);

    if (opts.onlyUnmapped !== false) {
      query = query.is("chetto_group_id", null);
    }

    const { data: rows, error: qErr } = await query;
    if (qErr) {
      return {
        success: false,
        processed: 0,
        matched: 0,
        noMatch: 0,
        errors: 0,
        error: "Failed to load clients",
      };
    }

    let matched = 0;
    let noMatch = 0;
    let errors = 0;

    for (const row of rows ?? []) {
      const res = await generateChettoSuggestionForClient(row.id as string);
      if (!res.success) errors += 1;
      else if (res.noMatch) noMatch += 1;
      else if (res.suggestion) matched += 1;
    }

    revalidatePath("/clients/chetto-mapping");
    return {
      success: true,
      processed: rows?.length ?? 0,
      matched,
      noMatch,
      errors,
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      processed: 0,
      matched: 0,
      noMatch: 0,
      errors: 0,
      error: "Unexpected error",
    };
  }
}

export async function acceptChettoSuggestion(
  suggestionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(suggestionId);
    if (!uuid.success) return { success: false, error: "Invalid suggestion id" };

    const gate = await assertChettoMappingAccess();
    if (!gate.ok) return { success: false, error: gate.error };

    const { data: suggestion, error: sErr } = await gate.supabase
      .from("client_chetto_suggestions")
      .select("id, client_id, chetto_group_id, status")
      .eq("id", suggestionId)
      .single();

    if (sErr || !suggestion) {
      return { success: false, error: "Suggestion not found" };
    }
    if (suggestion.status !== "pending") {
      return { success: false, error: "Suggestion is no longer pending" };
    }

    const write = await updateClientChettoGroupId(
      suggestion.client_id,
      suggestion.chetto_group_id,
    );
    if (!write.success) return write;

    const { error: uErr } = await gate.supabase
      .from("client_chetto_suggestions")
      .update({ status: "accepted", resolved_by: gate.userId })
      .eq("id", suggestionId);

    if (uErr) {
      return { success: false, error: "Mapped client but failed to update suggestion" };
    }

    revalidatePath("/clients/chetto-mapping");
    revalidatePath(`/clients/${suggestion.client_id}`);
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function rejectChettoSuggestion(
  suggestionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uuid = z.string().uuid().safeParse(suggestionId);
    if (!uuid.success) return { success: false, error: "Invalid suggestion id" };

    const gate = await assertChettoMappingAccess();
    if (!gate.ok) return { success: false, error: gate.error };

    const { error } = await gate.supabase
      .from("client_chetto_suggestions")
      .update({ status: "rejected", resolved_by: gate.userId })
      .eq("id", suggestionId)
      .eq("status", "pending");

    if (error) return { success: false, error: "Failed to reject suggestion" };

    revalidatePath("/clients/chetto-mapping");
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}
