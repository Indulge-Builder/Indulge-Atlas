import { z } from "zod";

// Zod schemas for concierge ticket server actions. Enum literals are kept in sync
// with the Postgres enums (migration 106) and lib/types/database.ts.

const uuid = z.string().uuid();

// Active Queendoms only — keep in sync with CONCIERGE_GROUPS in database.ts.
export const conciergeGroupSchema = z.enum(["anishqa", "ananyshree"]);
export const conciergePrioritySchema = z.enum(["low", "medium", "urgent"]);
export const conciergeStatusSchema = z.enum([
  "open", "pending", "nudge_client", "nudge_vendor",
  "ongoing_delivery", "invoice_due", "resolved", "closed",
]);

export const conciergeEscalationSchema = z.enum([
  "not_escalated", "under_review", "unable_to_solve", "delay_in_response", "resolved", "closed",
]);

const tagArraySchema = z.array(z.string().trim().min(1).max(40)).max(20);

export const createTicketSchema = z.object({
  clientId: uuid,
  title: z.string().trim().min(1, "Subject is required").max(200, "Subject is too long"),
  description: z.string().trim().max(10000).optional(),
  categoryId: uuid,
  subcategoryId: uuid.optional(),
  group: conciergeGroupSchema.optional(),
  priority: conciergePrioritySchema.optional(),
  assignedTo: uuid.optional(),
  tags: tagArraySchema.optional(),
  escalationStatus: conciergeEscalationSchema.optional(),
  scheduledOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Scheduled date must be YYYY-MM-DD")
    .optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateEscalationSchema = z.object({
  ticketId: uuid,
  escalationStatus: conciergeEscalationSchema,
});

export const updateTagsSchema = z.object({
  ticketId: uuid,
  tags: tagArraySchema,
});

export const assignTicketSchema = z.object({ ticketId: uuid, assigneeId: uuid });
export const transferTicketSchema = z.object({
  ticketId: uuid,
  toAssigneeId: uuid,
  reason: z.string().trim().max(2000).optional(),
});

export const addNoteSchema = z.object({
  ticketId: uuid,
  body: z.string().trim().min(1, "Note cannot be empty").max(10000, "Note is too long"),
  attachmentIds: z.array(uuid).max(20).optional(),
});

export const changeStatusSchema = z.object({
  ticketId: uuid,
  to: conciergeStatusSchema,
  reason: z.string().trim().max(2000).optional(),
  note: z.string().trim().max(10000).optional(),
  trackingId: z.string().trim().max(200).optional(),
  override: z.boolean().optional(),
});

export const setBillableSchema = z.object({
  ticketId: uuid,
  isBillable: z.boolean(),
  invoiceNumber: z.string().trim().max(120).optional(),
});

export const upsertInvoiceSchema = z.object({
  ticketId: uuid,
  clientName: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  serviceCharge: z.number().nonnegative(),
  vendorId: uuid.nullish(),
  vendorName: z.string().trim().max(200).nullish(),
  vendorBillAttId: uuid.nullish(),
  paymentMethod: z.string().trim().min(1).max(60),
  invoiceAttId: uuid.nullish(),
  billInOtherName: z.string().trim().max(200).nullish(),
});

export const toggleChecklistItemSchema = z.object({ itemId: uuid, checked: z.boolean() });

export const applyCannedResponseSchema = z.object({ ticketId: uuid, templateId: uuid });

export const vendorInputSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  company: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("")),
  poc: z.string().trim().max(200).nullish(),
  location: z.string().trim().max(200).nullish(),
});
export type VendorInputSchema = z.infer<typeof vendorInputSchema>;

export const vendorFeedbackSchema = z.object({
  ticketId: uuid,
  vendorId: uuid,
  quality: z.number().int().min(1).max(5),
  promptness: z.enum(["within_1h", "within_24h", "2_3_days"]),
  cost: z.enum(["lowest", "moderate", "high_premium"]),
  delivery: z.enum(["on_time", "delay", "poor_communication"]),
});

export const ticketListFiltersSchema = z.object({
  scope: z.enum(["mine", "queue"]).optional(),
  status: conciergeStatusSchema.or(z.literal("all")).optional(),
  categoryId: uuid.or(z.literal("all")).optional(),
  subcategoryId: uuid.or(z.literal("all")).optional(),
  priority: conciergePrioritySchema.or(z.literal("all")).optional(),
  billable: z.enum(["yes", "no", "all"]).optional(),
  createdRange: z.enum(["today", "yesterday", "this_week", "this_month", "all"]).optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  scheduledRange: z.enum(["today", "yesterday", "this_week", "this_month", "all"]).optional(),
  agent: z.string().optional(), // "all" | "unassigned" | "overdue" | <uuid>
  group: conciergeGroupSchema.or(z.literal("all")).optional(),
  sort: z.enum(["created", "updated", "priority", "status", "due"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

// ── Admin-configurable ticket settings (spec §2) ───────────────────────────────
// CRUD for the reference tables that were previously seed-only.

/** ticket_categories row. parentId null = a top-level category; set = a subcategory. */
export const ticketCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  parentId: uuid.nullish(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isRetail: z.boolean().optional(),
});
export type TicketCategoryInput = z.infer<typeof ticketCategorySchema>;

/** ticket_checklist_templates row — a checklist item snapshotted onto new tickets of a category. */
export const checklistTemplateSchema = z.object({
  categoryId: uuid,
  label: z.string().trim().min(1, "Label is required").max(120),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

/** canned_responses row. categoryId null = available on every ticket. */
export const cannedResponseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  shortcut: z.string().trim().max(40).nullish(),
  bodyTemplate: z.string().trim().min(1, "Body is required").max(10000),
  categoryId: uuid.nullish(),
  isActive: z.boolean().optional(),
});
export type CannedResponseInput = z.infer<typeof cannedResponseSchema>;

// SLA policy editor (admin). categoryId null = applies broadly; priority null = all priorities.
export const slaPolicySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  categoryId: uuid.nullish(),
  priority: conciergePrioritySchema.nullish(),
  firstResponseMinutes: z.number().int().min(0).max(1000000),
  resolutionMinutes: z.number().int().min(0).max(1000000),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  escalationEnabled: z.boolean(),
  clock: z.enum(["calendar", "business_hours"]),
});
export type SlaPolicyInput = z.infer<typeof slaPolicySchema>;
