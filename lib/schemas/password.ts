import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters required")
  .regex(/[A-Z]/, "At least one uppercase letter required")
  .regex(/[0-9]/, "At least one number required");

export const updatePasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>;
