import { z } from "zod";
import type { IndulgeDomain, UserRole } from "@/lib/types/database";

const INDULGE_DOMAINS: IndulgeDomain[] = [
  "indulge_global",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

export const indulgeDomainSchema = z.enum(INDULGE_DOMAINS);

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(1, "Full name is required").transform((v) => v.trim()),
  role: z.enum(["agent", "scout", "admin", "finance"]) as z.ZodType<UserRole>,
  domain: indulgeDomainSchema,
});

export const updateUserProfileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").transform((v) => v.trim()).optional(),
  role: z.enum(["agent", "scout", "admin", "finance"]).optional() as z.ZodType<UserRole | undefined>,
  domain: indulgeDomainSchema.optional(),
  is_active: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
