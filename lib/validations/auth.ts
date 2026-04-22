import { z } from "zod";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/constants";

export const registerSchema = z.object({
  orgName: z.string().min(2, "Organization name is required"),
  name: z.string().min(2, "Your name is required"),
  title: z.string().optional(),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  industry: z
    .string()
    .refine((v) => INDUSTRY_OPTIONS.includes(v), "Please pick your industry"),
  companySize: z
    .string()
    .refine((v) => COMPANY_SIZE_OPTIONS.includes(v), "Please pick your team size"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
