import { z } from "zod";

export const candidateSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  linkedIn: z.string().url("Invalid URL").optional().or(z.literal("")),
  location: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  currentSalary: z.number().optional().nullable(),
  desiredSalary: z.number().optional().nullable(),
  salaryCurrency: z.string().default("USD"),
  skills: z.array(z.string()).default([]),
  summary: z.string().optional(),
  source: z.string().optional(),
  // Optional override for the recruiter that owns this candidate. When
  // unset the API defaults to the creator; when set the API verifies
  // the user is in the same org before assigning.
  ownerId: z.string().optional(),
});

export type CandidateFormData = z.infer<typeof candidateSchema>;
