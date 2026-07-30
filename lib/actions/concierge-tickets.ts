"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { sanitizeText } from "@/lib/utils/sanitize";
import { isPrivilegedRole, canManageConciergeTickets } from "@/lib/types/database";
import type {
  ConciergeGroup,
  ConciergeTicketStatus,
  SlaPolicy,
  TicketListItem,
  TicketListFilters,
  TicketDetail,
  TicketInvoiceInput,
  UserRole,
  EmployeeDepartment,
} from "@/lib/types/database";
import {
  createTicketSchema,
  assignTicketSchema,
  transferTicketSchema,
  addNoteSchema,
  changeStatusSchema,
  setBillableSchema,
  upsertInvoiceSchema,
  toggleChecklistItemSchema,
  applyCannedResponseSchema,
  ticketListFiltersSchema,
  updateEscalationSchema,
  updateTagsSchema,
} from "@/lib/schemas/concierge";
import { matchSlaPolicy } from "@/lib/concierge/slaPolicy";
import { computeSlaDueDates } from "@/lib/concierge/slaClock";
import { interpolateCannedResponse } from "@/lib/concierge/cannedResponse";
import {
  validateStatusChange,
  type TicketGateContext,
} from "@/lib/concierge/ticketStateMachine";
import { insertTicketNotification, notifyFinanceDepartment } from "@/lib/services/ticketNotificationInsert";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  /** Machine-readable gate/failure code (e.g. "proof_required") for the UI. */
  code?: string;
  /** UI field a gate failure maps to. */
  field?: string;
}

const IMAGE_PDF_MAX = 25 * 1024 * 1024; // 25 MB
const VIDEO_MAX = 200 * 1024 * 1024; // 200 MB

/**
 * Bishop (concierge manager) or admin/founder/super_admin.
 *
 * Build spec: "Only Bishops / Queens can create, assign, move, and resolve tickets."
 * So create / assign / transfer / status-change (move + resolve) are gated to these
 * roles. Genies (agents) keep everything else — notes, checklist, attachments,
 * canned responses, billable/invoice, vendor feedback.
 *
 * [GOVERNANCE — spec-literal default; relax here if Genies should move their own
 *  tickets. To let assigned agents advance status, drop the guard in
 *  changeTicketStatus; to let them reassign, drop it in reassign().]
 */
function isBishopOrAdmin(role: UserRole, department: EmployeeDepartment | null): boolean {
  return isPrivilegedRole(role) || (role === "manager" && department === "concierge");
}

function revalidateTicket(ticketId?: string) {
  revalidatePath("/concierge/tickets");
  if (ticketId) revalidatePath(`/concierge/tickets/${ticketId}`);
}

/** Caller's PRIMARY concierge_group (profiles.concierge_group) — used to default a ticket's group. */
async function getCallerGroup(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  userId: string,
): Promise<ConciergeGroup | null> {
  const { data } = await supabase.from("profiles").select("concierge_group").eq("id", userId).single();
  return (data?.concierge_group as ConciergeGroup | null) ?? null;
}

/** Every concierge group a profile belongs to (concierge_agent_groups membership; one agent → many groups). */
async function getMembershipGroups(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  profileId: string,
): Promise<ConciergeGroup[]> {
  const { data } = await supabase
    .from("concierge_agent_groups")
    .select("org_group")
    .eq("profile_id", profileId);
  return ((data as { org_group: ConciergeGroup }[] | null) ?? []).map((r) => r.org_group);
}

/** Is a profile a member of the given group? (assignee / caller eligibility) */
async function isGroupMember(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  profileId: string,
  group: ConciergeGroup,
): Promise<boolean> {
  const { data } = await supabase
    .from("concierge_agent_groups")
    .select("org_group")
    .eq("profile_id", profileId)
    .eq("org_group", group)
    .maybeSingle();
  return !!data;
}

/** Trim + sanitize + case-insensitive dedupe; cap at 20 (matches the Zod schema). */
function dedupeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = sanitizeText(raw).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

// ── createTicket ────────────────────────────────────────────────────────────

export async function createTicket(
  input: unknown,
): Promise<ActionResult<{ id: string; refNumber: number }>> {
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const p = parsed.data;

  try {
    const { supabase, user, role, department } = await getAuthUser();
    const privileged = isPrivilegedRole(role);
    const isBishop = role === "manager" && department === "concierge";
    if (!privileged && !isBishop) {
      return { success: false, error: "Only bishops (concierge managers) and admins can create tickets." };
    }

    // Client + default group
    const { data: client } = await supabase
      .from("clients")
      .select("id, first_name, last_name, concierge_group")
      .eq("id", p.clientId)
      .single();
    if (!client) return { success: false, error: "Client not found or not accessible." };

    const callerPrimary = await getCallerGroup(supabase, user.id);
    const group: ConciergeGroup | null =
      (p.group as ConciergeGroup | undefined) ??
      (client.concierge_group as ConciergeGroup | null) ??
      callerPrimary;
    if (!group) {
      return { success: false, error: "No group set. Assign the client to a group or pick one.", field: "group" };
    }
    if (!privileged) {
      // A bishop may file under any group they belong to (primary + memberships).
      const myGroups = await getMembershipGroups(supabase, user.id);
      const allowed = new Set<ConciergeGroup>([...myGroups, ...(callerPrimary ? [callerPrimary] : [])]);
      if (!allowed.has(group)) {
        return { success: false, error: "You can only create tickets for a group you belong to.", field: "group" };
      }
    }

    // Category / subcategory validation
    const { data: cats } = await supabase
      .from("ticket_categories")
      .select("id, parent_id")
      .in("id", [p.categoryId, p.subcategoryId].filter(Boolean) as string[]);
    const category = cats?.find((c) => c.id === p.categoryId);
    if (!category) return { success: false, error: "Invalid category.", field: "categoryId" };
    if (p.subcategoryId) {
      const sub = cats?.find((c) => c.id === p.subcategoryId);
      if (!sub || sub.parent_id !== p.categoryId) {
        return { success: false, error: "Subcategory must belong to the selected category.", field: "subcategoryId" };
      }
    }

    const priority = p.priority ?? "medium";

    // SLA due dates
    const { data: policies } = await supabase
      .from("sla_policies")
      .select("id, name, category_id, priority, first_response_minutes, resolution_minutes, is_default, is_active, escalation_enabled, clock, created_at")
      .eq("is_active", true);
    const matched = matchSlaPolicy((policies ?? []) as SlaPolicy[], p.categoryId, p.subcategoryId ?? null, priority);
    const nowIso = new Date().toISOString();
    const sla = matched
      ? computeSlaDueDates(nowIso, matched.first_response_minutes, matched.resolution_minutes)
      : null;

    // Assignee must be a member of the ticket's group (mirrors the RLS edit scope).
    if (p.assignedTo) {
      const member = await isGroupMember(supabase, p.assignedTo, group);
      if (!member) {
        return { success: false, error: "The selected agent isn't in this group.", field: "assignedTo" };
      }
    }

    const cleanTags = dedupeTags(p.tags ?? []);

    // Insert ticket
    const { data: ticket, error: insErr } = await supabase
      .from("concierge_tickets")
      .insert({
        client_id: p.clientId,
        title: sanitizeText(p.title),
        description: p.description ? sanitizeText(p.description) : null,
        category_id: p.categoryId,
        subcategory_id: p.subcategoryId ?? null,
        org_group: group,
        priority,
        assigned_to: p.assignedTo ?? null,
        created_by: user.id,
        tags: cleanTags,
        escalation_status: p.escalationStatus ?? "not_escalated",
        scheduled_on: p.scheduledOn ?? null,
        sla_first_response_due: sla?.firstResponseDue ?? null,
        sla_resolution_due: sla?.resolutionDue ?? null,
      })
      .select("id, ref_number")
      .single();
    if (insErr || !ticket) {
      console.error("[createTicket] insert", insErr);
      return { success: false, error: "Could not create the ticket." };
    }

    // Snapshot checklist templates (category + subcategory)
    const catIds = [p.categoryId, p.subcategoryId].filter(Boolean) as string[];
    const { data: templates } = await supabase
      .from("ticket_checklist_templates")
      .select("id, label, sort_order")
      .in("category_id", catIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (templates && templates.length > 0) {
      await supabase.from("concierge_ticket_checklist_items").insert(
        templates.map((t, i) => ({
          ticket_id: ticket.id,
          template_id: t.id,
          label: t.label,
          sort_order: t.sort_order ?? i,
        })),
      );
    }

    // System 'created' timeline entry
    await supabase.from("concierge_ticket_updates").insert({
      ticket_id: ticket.id,
      author_id: user.id,
      kind: "system",
      body: null,
      metadata: { event: "created", group, priority },
    });

    if (p.assignedTo) {
      insertTicketNotification({
        recipientId: p.assignedTo,
        actorId: user.id,
        type: "ticket_assigned",
        ticketId: ticket.id,
        title: `You were assigned ticket #${ticket.ref_number}`,
        body: sanitizeText(p.title),
      });
    }

    revalidateTicket(ticket.id);
    return { success: true, data: { id: ticket.id as string, refNumber: ticket.ref_number as number } };
  } catch (err) {
    console.error("[createTicket]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── assign / transfer ─────────────────────────────────────────────────────────

async function reassign(
  ticketId: string,
  toAssigneeId: string,
  reason: string | undefined,
  kindLabel: "assigned" | "transferred",
): Promise<ActionResult> {
  const { supabase, user, role, department } = await getAuthUser();
  if (!isBishopOrAdmin(role, department)) {
    return { success: false, error: "Only bishops (concierge managers) and admins can assign or transfer tickets." };
  }
  const { data: ticket } = await supabase
    .from("concierge_tickets")
    .select("id, ref_number, assigned_to, org_group")
    .eq("id", ticketId)
    .single();
  if (!ticket) return { success: false, error: "Ticket not found or not accessible." };

  // Assignee must be a member of the ticket's group.
  const member = await isGroupMember(supabase, toAssigneeId, ticket.org_group as ConciergeGroup);
  if (!member) {
    return { success: false, error: "The selected agent isn't in this group." };
  }

  const { error } = await supabase
    .from("concierge_tickets")
    .update({ assigned_to: toAssigneeId })
    .eq("id", ticketId);
  if (error) return { success: false, error: "You don't have permission to reassign this ticket." };

  await supabase.from("concierge_ticket_updates").insert({
    ticket_id: ticketId,
    author_id: user.id,
    kind: "assignment",
    body: reason ? sanitizeText(reason) : null,
    metadata: { old_assignee: ticket.assigned_to, new_assignee: toAssigneeId, event: kindLabel },
  });

  insertTicketNotification({
    recipientId: toAssigneeId,
    actorId: user.id,
    type: kindLabel === "assigned" ? "ticket_assigned" : "ticket_transferred",
    ticketId,
    title: `Ticket #${ticket.ref_number} was ${kindLabel} to you`,
  });

  revalidateTicket(ticketId);
  return { success: true };
}

export async function assignTicket(input: unknown): Promise<ActionResult> {
  const parsed = assignTicketSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    return await reassign(parsed.data.ticketId, parsed.data.assigneeId, undefined, "assigned");
  } catch (err) {
    console.error("[assignTicket]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function transferTicket(input: unknown): Promise<ActionResult> {
  const parsed = transferTicketSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    return await reassign(parsed.data.ticketId, parsed.data.toAssigneeId, parsed.data.reason, "transferred");
  } catch (err) {
    console.error("[transferTicket]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── addTicketNote ───────────────────────────────────────────────────────────

export async function addTicketNote(input: unknown): Promise<ActionResult<{ updateId: string }>> {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, body, attachmentIds } = parsed.data;

  try {
    const { supabase, user } = await getAuthUser();
    const { data: ticket } = await supabase
      .from("concierge_tickets")
      .select("id, ref_number, assigned_to, first_response_at")
      .eq("id", ticketId)
      .single();
    if (!ticket) return { success: false, error: "Ticket not found or not accessible." };

    const { data: update, error } = await supabase
      .from("concierge_ticket_updates")
      .insert({ ticket_id: ticketId, author_id: user.id, kind: "note", body: sanitizeText(body), metadata: {} })
      .select("id")
      .single();
    if (error || !update) return { success: false, error: "You don't have permission to add a note here." };

    if (attachmentIds && attachmentIds.length > 0) {
      await supabase
        .from("concierge_ticket_attachments")
        .update({ update_id: update.id })
        .in("id", attachmentIds)
        .eq("ticket_id", ticketId);
    }

    // First agent note = first response.
    if (!ticket.first_response_at) {
      await supabase.from("concierge_tickets").update({ first_response_at: new Date().toISOString() }).eq("id", ticketId);
    }

    if (ticket.assigned_to && ticket.assigned_to !== user.id) {
      insertTicketNotification({
        recipientId: ticket.assigned_to,
        actorId: user.id,
        type: "ticket_note_added",
        ticketId,
        title: `New note on ticket #${ticket.ref_number}`,
      });
    }

    revalidateTicket(ticketId);
    return { success: true, data: { updateId: update.id as string } };
  } catch (err) {
    console.error("[addTicketNote]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── uploadTicketAttachment (FormData: ticketId, file, isProof?, updateId?) ─────

function attachmentKind(mime: string): "image" | "pdf" | "video" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

export async function uploadTicketAttachment(
  formData: FormData,
): Promise<ActionResult<{ attachmentId: string; storagePath: string }>> {
  try {
    const ticketId = String(formData.get("ticketId") ?? "");
    const isProof = String(formData.get("isProof") ?? "") === "true";
    const linkToUpdateId = formData.get("updateId") ? String(formData.get("updateId")) : null;
    const file = formData.get("file");
    if (!ticketId || !(file instanceof File)) return { success: false, error: "Missing ticket or file." };

    const mime = file.type || "application/octet-stream";
    const kind = attachmentKind(mime);
    if (kind === "other") return { success: false, error: "Only images, PDFs, and videos are allowed." };
    const cap = kind === "video" ? VIDEO_MAX : IMAGE_PDF_MAX;
    if (file.size > cap) {
      return { success: false, error: `File is too large (max ${kind === "video" ? "200MB" : "25MB"}).` };
    }

    const { supabase, user } = await getAuthUser();

    const safeName = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-120);
    const storagePath = `concierge/${ticketId}/${randomUUID()}-${safeName}`;

    // Insert the row FIRST — RLS (can_edit_concierge_ticket) is the permission gate.
    const { data: row, error: rowErr } = await supabase
      .from("concierge_ticket_attachments")
      .insert({
        ticket_id: ticketId,
        update_id: linkToUpdateId,
        uploaded_by: user.id,
        storage_path: storagePath,
        file_name: file.name || safeName,
        mime_type: mime,
        size_bytes: file.size,
        kind,
        is_proof: isProof,
      })
      .select("id")
      .single();
    if (rowErr || !row) return { success: false, error: "You don't have permission to attach files here." };

    // Upload to private storage via the service client.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const service = getServiceSupabaseClient();
    const { error: upErr } = await service.storage
      .from("ticket-attachments")
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      await supabase.from("concierge_ticket_attachments").delete().eq("id", row.id);
      console.error("[uploadTicketAttachment] storage", upErr);
      return { success: false, error: "Upload failed. Please try again." };
    }

    if (isProof || linkToUpdateId) {
      await supabase.from("concierge_ticket_updates").insert({
        ticket_id: ticketId,
        author_id: user.id,
        kind: "attachment",
        body: null,
        metadata: { attachment_id: row.id, file_name: file.name, is_proof: isProof },
      });
    }

    revalidateTicket(ticketId);
    return { success: true, data: { attachmentId: row.id as string, storagePath } };
  } catch (err) {
    console.error("[uploadTicketAttachment]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/** Mint a short-lived signed URL for a stored attachment (server-side). */
export async function getAttachmentSignedUrl(attachmentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase } = await getAuthUser();
    // RLS ensures the caller can only read attachments for tickets they can view.
    const { data: att } = await supabase
      .from("concierge_ticket_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .single();
    if (!att) return { success: false, error: "Attachment not found or not accessible." };
    const service = getServiceSupabaseClient();
    const { data, error } = await service.storage
      .from("ticket-attachments")
      .createSignedUrl(att.storage_path as string, 300);
    if (error || !data) return { success: false, error: "Could not generate a link." };
    return { success: true, data: { url: data.signedUrl } };
  } catch (err) {
    console.error("[getAttachmentSignedUrl]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── changeTicketStatus (state machine + entry gates) ──────────────────────────

export async function changeTicketStatus(
  input: unknown,
): Promise<ActionResult<{ requiresVendorFeedback: boolean; vendorId: string | null }>> {
  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, to, reason, note, trackingId, override } = parsed.data;

  try {
    const { supabase, user, role, department } = await getAuthUser();
    if (!isBishopOrAdmin(role, department)) {
      return { success: false, error: "Only bishops (concierge managers) and admins can change a ticket's status." };
    }

    const { data: ticket } = await supabase
      .from("concierge_tickets")
      .select("id, ref_number, status, assigned_to, is_billable, invoice_number, primary_vendor_id")
      .eq("id", ticketId)
      .single();
    if (!ticket) return { success: false, error: "Ticket not found or not accessible." };

    const from = ticket.status as ConciergeTicketStatus;

    // Assemble the gate context from related rows.
    let vendorHasContact = false;
    if (ticket.primary_vendor_id) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("name, phone, email")
        .eq("id", ticket.primary_vendor_id)
        .single();
      vendorHasContact = !!(vendor && (vendor.phone || vendor.email || vendor.name));
    }
    const { count: proofCount } = await supabase
      .from("concierge_ticket_attachments")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticketId)
      .eq("is_proof", true);
    const { data: invoice } = await supabase
      .from("ticket_invoices")
      .select("id, invoice_att_id")
      .eq("ticket_id", ticketId)
      .maybeSingle();
    const { data: checklist } = await supabase
      .from("concierge_ticket_checklist_items")
      .select("is_checked")
      .eq("ticket_id", ticketId);
    const checklistTotal = checklist?.length ?? 0;
    const checklistChecked = checklist?.filter((c) => c.is_checked).length ?? 0;

    const ctx: TicketGateContext = {
      from,
      to,
      hasPrimaryVendor: !!ticket.primary_vendor_id,
      vendorHasContact,
      noteBodyProvided: !!note?.trim(),
      hasProofAttachment: (proofCount ?? 0) > 0,
      trackingIdProvided: !!trackingId?.trim(),
      invoiceComplete: !!invoice,
      invoiceAttachmentLinked: !!invoice?.invoice_att_id,
      isBillableDecided: ticket.is_billable !== null,
      isBillable: ticket.is_billable === true,
      invoiceNumberPresent: !!ticket.invoice_number,
      checklistTotal,
      checklistChecked,
      isAdminOverride: !!override && isPrivilegedRole(role),
    };

    const verdict = validateStatusChange(ctx);
    if (!verdict.ok) {
      const first = verdict.blocked[0];
      return { success: false, error: first?.message ?? "This status change isn't allowed.", code: first?.code, field: first?.field };
    }

    // Apply the transition.
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: to,
      status_changed_at: nowIso,
      is_overdue: false,
    };
    if (to === "resolved") patch.resolved_at = nowIso;
    if (to === "closed") patch.closed_at = nowIso;
    if (to === "open") {
      patch.resolved_at = null;
      patch.closed_at = null;
    }
    const { error: updErr } = await supabase.from("concierge_tickets").update(patch).eq("id", ticketId);
    if (updErr) return { success: false, error: "You don't have permission to change this ticket's status." };

    // Nudge note (required for nudge_* — surfaced in the timeline as a note).
    if (note?.trim()) {
      await supabase.from("concierge_ticket_updates").insert({
        ticket_id: ticketId,
        author_id: user.id,
        kind: "note",
        body: sanitizeText(note),
        metadata: { context: `status:${to}` },
      });
    }

    // Status-change timeline entry (with any override warnings recorded).
    await supabase.from("concierge_ticket_updates").insert({
      ticket_id: ticketId,
      author_id: user.id,
      kind: "status_change",
      body: reason ? sanitizeText(reason) : null,
      metadata: {
        old_status: from,
        new_status: to,
        ...(trackingId ? { tracking_id: sanitizeText(trackingId) } : {}),
        ...(verdict.warnings.length ? { warnings: verdict.warnings.map((w) => w.code), overridden: ctx.isAdminOverride } : {}),
      },
    });

    // Side effects
    if (to === "invoice_due") {
      notifyFinanceDepartment({
        actorId: user.id,
        ticketId,
        title: `Invoice due on ticket #${ticket.ref_number}`,
      });
    }
    if (ticket.assigned_to && ticket.assigned_to !== user.id) {
      insertTicketNotification({
        recipientId: ticket.assigned_to,
        actorId: user.id,
        type: "ticket_status_changed",
        ticketId,
        title: `Ticket #${ticket.ref_number} → ${to.replace(/_/g, " ")}`,
      });
    }

    // Build spec: "After every ticket moves from 'Ongoing Delivery' to 'Invoice Due,'
    // the Genie must fill in the vendor's scores." We prompt (auto-open the scorecard
    // modal) at that transition when a primary vendor is set. [Spec-literal capture
    // point; strong prompt, not a hard block — flip to a gate later if required.]
    const requiresVendorFeedback =
      from === "ongoing_delivery" && to === "invoice_due" && !!ticket.primary_vendor_id;
    revalidateTicket(ticketId);
    return {
      success: true,
      data: { requiresVendorFeedback, vendorId: requiresVendorFeedback ? (ticket.primary_vendor_id as string) : null },
    };
  } catch (err) {
    console.error("[changeTicketStatus]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── billable / invoice / checklist / canned ────────────────────────────────────

export async function setBillable(input: unknown): Promise<ActionResult> {
  const parsed = setBillableSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, isBillable, invoiceNumber } = parsed.data;
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase
      .from("concierge_tickets")
      .update({ is_billable: isBillable, invoice_number: invoiceNumber ? sanitizeText(invoiceNumber) : null })
      .eq("id", ticketId);
    if (error) return { success: false, error: "You don't have permission to update this ticket." };
    revalidateTicket(ticketId);
    return { success: true };
  } catch (err) {
    console.error("[setBillable]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function upsertTicketInvoice(ticketId: string, payload: TicketInvoiceInput): Promise<ActionResult> {
  const parsed = upsertInvoiceSchema.safeParse({ ticketId, ...payload });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    const { supabase, user } = await getAuthUser();
    const { error } = await supabase
      .from("ticket_invoices")
      .upsert(
        {
          ticket_id: d.ticketId,
          client_name: sanitizeText(d.clientName),
          description: sanitizeText(d.description),
          cost_price: d.costPrice,
          selling_price: d.sellingPrice,
          service_charge: d.serviceCharge,
          vendor_id: d.vendorId ?? null,
          vendor_name: d.vendorName ? sanitizeText(d.vendorName) : null,
          vendor_bill_att_id: d.vendorBillAttId ?? null,
          payment_method: sanitizeText(d.paymentMethod),
          invoice_att_id: d.invoiceAttId ?? null,
          bill_in_other_name: d.billInOtherName ? sanitizeText(d.billInOtherName) : null,
          created_by: user.id,
        },
        { onConflict: "ticket_id" },
      );
    if (error) return { success: false, error: "You don't have permission to edit this invoice." };
    revalidateTicket(d.ticketId);
    return { success: true };
  } catch (err) {
    console.error("[upsertTicketInvoice]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function toggleChecklistItem(input: unknown): Promise<ActionResult> {
  const parsed = toggleChecklistItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { itemId, checked } = parsed.data;
  try {
    const { supabase, user } = await getAuthUser();
    const { data: item, error } = await supabase
      .from("concierge_ticket_checklist_items")
      .update({ is_checked: checked, checked_by: checked ? user.id : null, checked_at: checked ? new Date().toISOString() : null })
      .eq("id", itemId)
      .select("ticket_id")
      .single();
    if (error || !item) return { success: false, error: "You don't have permission to update this checklist." };
    revalidateTicket(item.ticket_id as string);
    return { success: true };
  } catch (err) {
    console.error("[toggleChecklistItem]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function applyCannedResponse(input: unknown): Promise<ActionResult<{ body: string }>> {
  const parsed = applyCannedResponseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, templateId } = parsed.data;
  try {
    const { supabase, user, profile } = await getAuthUser();
    const [{ data: template }, { data: ticket }] = await Promise.all([
      supabase.from("canned_responses").select("body_template").eq("id", templateId).single(),
      supabase.from("concierge_tickets").select("client_id").eq("id", ticketId).single(),
    ]);
    if (!template) return { success: false, error: "Canned response not found." };

    let clientName = "";
    if (ticket?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("first_name, last_name")
        .eq("id", ticket.client_id)
        .single();
      clientName = [client?.first_name, client?.last_name].filter(Boolean).join(" ");
    }

    const prof = profile as { full_name?: string; job_title?: string | null; phone?: string | null } | null;
    const body = interpolateCannedResponse(template.body_template as string, {
      agent_name: prof?.full_name ?? "",
      agent_designation: prof?.job_title ?? "",
      agent_phone: prof?.phone ?? "",
      client_name: clientName,
    });
    void user;
    return { success: true, data: { body } };
  } catch (err) {
    console.error("[applyCannedResponse]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Escalation status / tags (FD-style; separate from workflow status) ──────────

export async function updateTicketEscalationStatus(input: unknown): Promise<ActionResult> {
  const parsed = updateEscalationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, escalationStatus } = parsed.data;
  try {
    const { supabase, user } = await getAuthUser();
    const { data: ticket } = await supabase
      .from("concierge_tickets")
      .select("id, ref_number, escalation_status")
      .eq("id", ticketId)
      .single();
    if (!ticket) return { success: false, error: "Ticket not found or not accessible." };
    if (ticket.escalation_status === escalationStatus) return { success: true };

    const { error } = await supabase
      .from("concierge_tickets")
      .update({ escalation_status: escalationStatus })
      .eq("id", ticketId);
    if (error) return { success: false, error: "You don't have permission to update this ticket." };

    // History entry — tagged so the timeline can distinguish it from workflow status.
    await supabase.from("concierge_ticket_updates").insert({
      ticket_id: ticketId,
      author_id: user.id,
      kind: "status_change",
      body: null,
      metadata: {
        field: "escalation_status",
        old_status: ticket.escalation_status,
        new_status: escalationStatus,
      },
    });

    revalidateTicket(ticketId);
    return { success: true };
  } catch (err) {
    console.error("[updateTicketEscalationStatus]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateTicketTags(input: unknown): Promise<ActionResult> {
  const parsed = updateTagsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { ticketId, tags } = parsed.data;
  try {
    const { supabase } = await getAuthUser();
    const { error } = await supabase
      .from("concierge_tickets")
      .update({ tags: dedupeTags(tags) })
      .eq("id", ticketId);
    if (error) return { success: false, error: "You don't have permission to update this ticket." };
    revalidateTicket(ticketId);
    return { success: true };
  } catch (err) {
    console.error("[updateTicketTags]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

const LIST_SELECT =
  "id, ref_number, title, status, priority, org_group, is_overdue, is_billable, created_at, status_changed_at, sla_resolution_due, scheduled_on, " +
  "client:clients!client_id(id, first_name, last_name, avatar_url), " +
  "assignee:profiles!assigned_to(id, full_name), " +
  "category:ticket_categories!category_id(name), " +
  "subcategory:ticket_categories!subcategory_id(name)";

 
function mapListRow(row: any): TicketListItem {
  const client = row.client
    ? {
        id: row.client.id as string,
        name: [row.client.first_name, row.client.last_name].filter(Boolean).join(" ") || "Unknown",
        avatar_url: (row.client.avatar_url as string | null) ?? null,
      }
    : null;
  return {
    id: row.id,
    ref_number: row.ref_number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    org_group: row.org_group,
    is_overdue: row.is_overdue,
    is_billable: row.is_billable,
    created_at: row.created_at,
    status_changed_at: row.status_changed_at,
    sla_resolution_due: row.sla_resolution_due,
    scheduled_on: row.scheduled_on ?? null,
    category_name: row.category?.name ?? null,
    subcategory_name: row.subcategory?.name ?? null,
    client,
    assignee: row.assignee ? { id: row.assignee.id, full_name: row.assignee.full_name } : null,
  };
}
 

function createdRangeStart(range: TicketListFilters["createdRange"]): Date | null {
  if (!range || range === "all") return null;
  const now = new Date();
  const d = new Date(now);
  switch (range) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d;
    case "yesterday":
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "this_week": {
      const day = d.getDay(); // 0=Sun
      const diff = (day + 6) % 7; // days since Monday
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "this_month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      return null;
  }
}

/** Local YYYY-MM-DD (server-local, matching createdRange's local-time behavior). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bounds for the scheduled_on (date) filter. `eq` for a single day; `gte`/`lt` for a range. */
function scheduledRangeBounds(
  range: TicketListFilters["scheduledRange"],
): { eq?: string; gte?: string; lt?: string } | null {
  if (!range || range === "all") return null;
  const now = new Date();
  switch (range) {
    case "today":
      return { eq: localDateStr(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { eq: localDateStr(y) };
    }
    case "this_week": {
      const start = new Date(now);
      const diff = (start.getDay() + 6) % 7; // days since Monday
      start.setDate(start.getDate() - diff);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { gte: localDateStr(start), lt: localDateStr(end) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { gte: localDateStr(start), lt: localDateStr(end) };
    }
    default:
      return null;
  }
}

async function fetchTickets(filters: TicketListFilters, forceMine: boolean): Promise<TicketListItem[]> {
  const { supabase, user, role, department } = await getAuthUser();
  const parsed = ticketListFiltersSchema.safeParse(filters);
  const f = parsed.success ? parsed.data : {};

  let q = supabase.from("concierge_tickets").select(LIST_SELECT);

  // Scope
  const wantsMine = forceMine || f.scope === "mine";
  if (wantsMine) {
    q = q.eq("assigned_to", user.id);
  }

  // Agent filter (queue view)
  if (!wantsMine && f.agent && f.agent !== "all") {
    if (f.agent === "unassigned") q = q.is("assigned_to", null);
    else if (f.agent === "overdue") q = q.eq("is_overdue", true);
    else q = q.eq("assigned_to", f.agent);
  }

  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.priority && f.priority !== "all") q = q.eq("priority", f.priority);
  if (f.categoryId && f.categoryId !== "all") q = q.eq("category_id", f.categoryId);
  if (f.subcategoryId && f.subcategoryId !== "all") q = q.eq("subcategory_id", f.subcategoryId);
  if (f.billable === "yes") q = q.eq("is_billable", true);
  if (f.billable === "no") q = q.eq("is_billable", false);

  // Group filter only meaningful for admins (RLS scopes others anyway).
  if (isPrivilegedRole(role) && f.group && f.group !== "all") q = q.eq("org_group", f.group);
  void department;

  const start = createdRangeStart(f.createdRange);
  if (start) q = q.gte("created_at", start.toISOString());
  if (f.createdRange === "yesterday") {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    q = q.lt("created_at", end.toISOString());
  }
  if (f.createdFrom) q = q.gte("created_at", f.createdFrom);
  if (f.createdTo) q = q.lte("created_at", f.createdTo);

  const sched = scheduledRangeBounds(f.scheduledRange);
  if (sched?.eq) q = q.eq("scheduled_on", sched.eq);
  if (sched?.gte) q = q.gte("scheduled_on", sched.gte);
  if (sched?.lt) q = q.lt("scheduled_on", sched.lt);

  // Global search (spec §1): matches ticket #ref, title, and the client's name/phone.
  if (f.search && f.search.trim()) {
    const s = f.search.trim();
    const asNum = Number(s.replace(/^#/, ""));
    if (Number.isInteger(asNum) && asNum > 0) {
      q = q.eq("ref_number", asNum);
    } else {
      // Strip PostgREST filter-breaking chars before building the ilike/or strings.
      const raw = s.replace(/[%,()]/g, "").trim();
      if (raw) {
        const like = `%${raw}%`;
        // Client name/phone → ticket via client_id (RLS-scoped client lookup).
        const { data: clientMatches } = await supabase
          .from("clients")
          .select("id")
          .or(`first_name.ilike.${like},last_name.ilike.${like},phone_number.ilike.${like}`)
          .limit(50);
        const ids = ((clientMatches as { id: string }[] | null) ?? []).map((c) => c.id);
        q = ids.length
          ? q.or(`title.ilike.${like},client_id.in.(${ids.join(",")})`)
          : q.ilike("title", like);
      }
    }
  }

  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 30;

  // Sort. Default: newest created first (preserves prior behavior). Postgres orders
  // enums by DECLARED order (low < medium < urgent), so priority desc = most-urgent
  // first — the TicketsIndex "Priority" option passes sortDir=desc. A created_at
  // tiebreak keeps ordering stable; nulls sort last (e.g. tickets with no due date).
  const SORT_COLUMN: Record<NonNullable<TicketListFilters["sort"]>, string> = {
    created: "created_at",
    updated: "updated_at",
    status: "status_changed_at",
    due: "sla_resolution_due",
    priority: "priority",
  };
  const sortCol = SORT_COLUMN[f.sort ?? "created"];
  const ascending = f.sortDir === "asc"; // default desc
  q = q.order(sortCol, { ascending, nullsFirst: false });
  if (sortCol !== "created_at") q = q.order("created_at", { ascending: false });
  q = q.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error } = await q;
  if (error) {
    console.error("[fetchTickets]", error);
    return [];
  }
   
  return (data as any[]).map(mapListRow);
}

export async function getMyTickets(filters: TicketListFilters = {}): Promise<TicketListItem[]> {
  try {
    return await fetchTickets(filters, true);
  } catch (err) {
    console.error("[getMyTickets]", err);
    return [];
  }
}

export async function getTicketQueue(filters: TicketListFilters = {}): Promise<TicketListItem[]> {
  try {
    return await fetchTickets({ ...filters, scope: "queue" }, false);
  } catch (err) {
    console.error("[getTicketQueue]", err);
    return [];
  }
}

export async function getTicketById(id: string): Promise<TicketDetail | null> {
  try {
    const { supabase } = await getAuthUser();
    const { data: ticket } = await supabase.from("concierge_tickets").select("*").eq("id", id).single();
    if (!ticket) return null;

    const [clientRes, catsRes, assigneeRes, vendorRes, updatesRes, attRes, checklistRes, invoiceRes] = await Promise.all([
      supabase.from("clients").select("id, first_name, last_name, phone_number, email, avatar_url, notes").eq("id", ticket.client_id).maybeSingle(),
      supabase.from("ticket_categories").select("id, name, parent_id, sort_order, is_active, created_at").in("id", [ticket.category_id, ticket.subcategory_id].filter(Boolean)),
      ticket.assigned_to ? supabase.from("profiles").select("id, full_name").eq("id", ticket.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
      ticket.primary_vendor_id ? supabase.from("vendors").select("*").eq("id", ticket.primary_vendor_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("concierge_ticket_updates").select("*, author:profiles!author_id(id, full_name)").eq("ticket_id", id).order("created_at", { ascending: false }),
      supabase.from("concierge_ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
      supabase.from("concierge_ticket_checklist_items").select("*").eq("ticket_id", id).order("sort_order", { ascending: true }),
      supabase.from("ticket_invoices").select("*").eq("ticket_id", id).maybeSingle(),
    ]);

     
    const cats = (catsRes.data as any[]) ?? [];
    const client = clientRes.data
      ? {
          id: clientRes.data.id,
          name: [clientRes.data.first_name, clientRes.data.last_name].filter(Boolean).join(" ") || "Unknown",
          phone_number: clientRes.data.phone_number,
          email: clientRes.data.email,
          avatar_url: clientRes.data.avatar_url,
          notes: clientRes.data.notes,
        }
      : null;
    return {
      ticket: ticket as TicketDetail["ticket"],
      client,
      category: cats.find((c) => c.id === ticket.category_id) ?? null,
      subcategory: cats.find((c) => c.id === ticket.subcategory_id) ?? null,
      assignee: (assigneeRes.data as any) ?? null,
      primaryVendor: (vendorRes.data as any) ?? null,
      updates: ((updatesRes.data as any[]) ?? []).map((u) => ({ ...u, author: u.author ?? null })),
      attachments: (attRes.data as any[]) ?? [],
      checklist: (checklistRes.data as any[]) ?? [],
      invoice: (invoiceRes.data as any) ?? null,
    };
     
  } catch (err) {
    console.error("[getTicketById]", err);
    return null;
  }
}
