import { z } from "zod";

export const jobSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["OPEN", "ACTIVE", "ON_HOLD", "FILLED", "CLOSED"]).default("OPEN"),
  currency: z.string().default("USD"),
  feeType: z.enum(["PERCENTAGE", "FLAT"]).default("PERCENTAGE"),
  feeAmount: z.number().optional().nullable(),
  salary: z.string().optional(),
  location: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
});

export type JobFormData = z.infer<typeof jobSchema>;
