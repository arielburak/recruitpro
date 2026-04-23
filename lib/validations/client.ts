import { z } from "zod";

// The legacy "main contact" inline fields on Client
// (contactName/contactEmail/contactPhone) are no longer written by any
// form — the Contact[] relation with isPrimary=true is the source of
// truth for "who to talk to at this client". The DB columns are kept
// for now as a read-side fallback for older clients that still have
// data there, but the write schema never accepts them.
export const clientSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
  defaultCurrency: z.string().optional(),
  defaultFeeType: z.string().optional(),
  defaultFeeAmount: z.number().optional().nullable(),
});

export type ClientFormData = z.infer<typeof clientSchema>;
