import { z } from "zod";
import type { IndulgeDomain, UserRole, EmployeeDepartment } from "@/lib/types/database";

const INDULGE_DOMAINS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_shop",
  "indulge_house",
  "indulge_legacy",
  "indulge_global",
];

const EMPLOYEE_DEPARTMENTS: EmployeeDepartment[] = [
  "concierge",
  "finance",
  "tech",
  "shop",
  "house",
  "legacy",
  "marketing",
  "onboarding",
];

export const indulgeDomainSchema = z.enum(
  INDULGE_DOMAINS as [IndulgeDomain, ...IndulgeDomain[]]
);

export const employeeDepartmentSchema = z.enum(
  EMPLOYEE_DEPARTMENTS as [EmployeeDepartment, ...EmployeeDepartment[]]
);

// ── createUserSchema ─────────────────────────────────────────
// Used by both the Server Action and the wizard form (via zodResolver).
// password is optional when send_invite = true (invite email flow).

export const userRoleSchema = z.enum([
  "admin",
  "founder",
  "manager",
  "agent",
  "guest",
]);

export const createUserSchema = z
  .object({
    email: z
      .string()
      .email("Invalid email address")
      .transform((v) => v.trim().toLowerCase()),
    full_name: z
      .string()
      .min(1, "Full name is required")
      .max(120, "Full name must be under 120 characters")
      .transform((v) => v.trim()),
    job_title: z
      .string()
      .min(1, "Job title is required")
      .max(120, "Job title must be under 120 characters")
      .transform((v) => v.trim()),
    role: userRoleSchema,
    domain: indulgeDomainSchema,
    department: employeeDepartmentSchema.nullable().optional(),
    reports_to: z.string().uuid("Invalid profile ID").nullable().optional(),
    /** When true: use inviteUserByEmail (magic link). When false: password required. */
    send_invite: z.boolean().optional(),
    /** Empty string must normalize to undefined — invite flow often leaves "" registered when field unmounts. */
    password: z.preprocess(
      (val) => (val === "" || val === null || val === undefined ? undefined : val),
      z.string().min(12, "Password must be at least 12 characters").optional()
    ),
  })
  .superRefine((data, ctx) => {
    // send_invite undefined/true → invite flow (no password required)
    // send_invite false → direct create (password required)
    if (data.send_invite === false && (!data.password || data.password.length < 12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password must be at least 12 characters when not sending an invite",
      });
    }
  });

export const updateUserProfileSchema = z.object({
  full_name: z
    .string()
    .min(1, "Full name is required")
    .transform((v) => v.trim())
    .optional(),
  job_title: z
    .string()
    .min(1)
    .max(120)
    .transform((v) => v.trim())
    .optional()
    .nullable(),
  role: userRoleSchema.optional(),
  domain: indulgeDomainSchema.optional(),
  department: employeeDepartmentSchema.nullable().optional(),
  reports_to: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

/** Raw form / API values before Zod transforms (matches `zodResolver` field state). */
export type CreateUserFormInput = z.input<typeof createUserSchema>;
/** Parsed output after transforms + superRefine (server action payload). */
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
