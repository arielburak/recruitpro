import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  defaultCurrency: z.string().optional(),
  defaultFeeType: z.string().optional(),
  defaultFeeAmount: z.number().optional().nullable(),
});

export type ClientFormData = z.infer<typeof clientSchema>;
