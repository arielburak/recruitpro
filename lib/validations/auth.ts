import { z } from "zod";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/constants";

// Emails se normalizan a lowercase en TODA entrada (signup, login, invite,
// forgot-password). Sin esto, "John@gmail" y "john@gmail" pueden crear
// cuentas duplicadas, o un lookup que use el casing original puede no
// encontrar al user existente. El canonical es siempre lowercase.
const normalizedEmail = z
  .string()
  .email("Invalid email")
  .transform((v) => v.trim().toLowerCase());

export const registerSchema = z.object({
  orgName: z.string().min(2, "Organization name is required"),
  name: z.string().min(2, "Your name is required"),
  title: z.string().optional(),
  email: normalizedEmail,
  password: z.string().min(8, "Password must be at least 8 characters"),
  industry: z
    .string()
    .refine((v) => INDUSTRY_OPTIONS.includes(v), "Please pick your industry"),
  companySize: z
    .string()
    .refine((v) => COMPANY_SIZE_OPTIONS.includes(v), "Please pick your team size"),
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, "Password is required"),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
