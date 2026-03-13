import { z } from "zod";

// ── Source options ────────────────────────────────────────
export const LEAD_SOURCES = [
  "Meta Ads",
  "Google Ads",
  "Website Form",
  "Referral",
  "Direct/WhatsApp",
] as const;

// ── Domain / division options ─────────────────────────────
export const LEAD_DOMAINS = [
  "Indulge Global",
  "Indulge Shop",
  "The Indulge House",
  "Indulge Legacy",
] as const;

// ── Status options available at creation time ─────────────
export const LEAD_FORM_STATUSES = [
  "new",
  "attempted",
  "in_discussion",
  "nurturing",
] as const;

// ── Keep the old alias so existing imports don't break ────
export const CAMPAIGN_SOURCES = LEAD_SOURCES;

// ── Main form schema ──────────────────────────────────────
export const addLeadSchema = z.object({
  // Single "Full Name" field — split into first/last on submit.
  // Single-word names are valid (last_name will be null).
  full_name: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Name is too long"),

  phone: z
    .string()
    .min(7, "Enter a valid phone number")
    .max(20, "Phone number is too long")
    .regex(/^[+\d\s\-()+]+$/, "Enter a valid phone number"),

  email: z
    .string()
    .email("Enter a valid email address")
    .max(200)
    .optional()
    .or(z.literal("")),

  city: z.string().max(100, "City name is too long").optional().or(z.literal("")),

  // Lead source (replaces campaign_source)
  source: z.enum(LEAD_SOURCES).optional(),

  // Campaign name typed as free text — maps to campaign_id column
  campaign_name: z
    .string()
    .max(120, "Campaign name is too long")
    .optional()
    .or(z.literal("")),

  // Division / brand vertical — optional in form, defaults to "Indulge Global" server-side
  domain: z.enum(LEAD_DOMAINS).optional(),

  status: z.enum(LEAD_FORM_STATUSES),

  // Hidden for agents (auto-filled server-side); shown for scout/admin
  assigned_to: z.string().optional().or(z.literal("")),

  initial_notes: z
    .string()
    .max(1000, "Notes cannot exceed 1,000 characters")
    .optional()
    .or(z.literal("")),
});

export type AddLeadFormValues = z.infer<typeof addLeadSchema>;
