export const TRIAL_DAYS = 5;

// Tiered per-seat pricing (monthly, in cents).
// Solo covers the independent recruiter; Team kicks in at the second seat.
export const SOLO_PRICE_PER_SEAT_CENTS = 1500; // $15
export const TEAM_PRICE_PER_SEAT_CENTS = 1900; // $19

export const SOLO_MAX_SEATS = 1;
export const TEAM_MIN_SEATS = 2;
export const TEAM_MAX_SEATS = 10;

export const STRIPE_PRICE_ID_SOLO = process.env.STRIPE_PRICE_ID_SOLO || "";
export const STRIPE_PRICE_ID_TEAM = process.env.STRIPE_PRICE_ID_TEAM || "";

export type PricingTier = "SOLO" | "TEAM";

export function tierForSeats(seats: number): PricingTier {
  return seats <= SOLO_MAX_SEATS ? "SOLO" : "TEAM";
}

export function stripePriceIdForSeats(seats: number): string {
  return tierForSeats(seats) === "SOLO" ? STRIPE_PRICE_ID_SOLO : STRIPE_PRICE_ID_TEAM;
}

export function perSeatCents(seats: number): number {
  return tierForSeats(seats) === "SOLO"
    ? SOLO_PRICE_PER_SEAT_CENTS
    : TEAM_PRICE_PER_SEAT_CENTS;
}

export function monthlyTotalCents(seats: number): number {
  return perSeatCents(seats) * seats;
}

// The one canonical pipeline used across the whole ATS — both the recruiting
// firm side (PipelineStage, per job) and the client portal side
// (ClientPipelineStage, per client). Each tenant gets the exact same 9
// stages; customization is intentionally not supported. Each side surfaces
// the stages that matter to them in the UI, but both read from this list so
// terminal/kind semantics line up for metrics.
export type StageKind = "positive" | "negative" | null;

export interface StageSpec {
  name: string;
  color: string;
  isTerminal: boolean;
  kind: StageKind;
}

export const DEFAULT_STAGES: StageSpec[] = [
  { name: "Sourced",         color: "#94a3b8", isTerminal: false, kind: null },
  { name: "Internal Review", color: "#60a5fa", isTerminal: false, kind: null },
  { name: "Submitted",       color: "#a78bfa", isTerminal: false, kind: null },
  { name: "Under Review",    color: "#f59e0b", isTerminal: false, kind: null },
  { name: "Interviewing",    color: "#3b82f6", isTerminal: false, kind: null },
  { name: "Offered",         color: "#8b5cf6", isTerminal: false, kind: null },
  { name: "Placed",          color: "#10b981", isTerminal: true,  kind: "positive" },
  { name: "Lost",            color: "#ef4444", isTerminal: true,  kind: "negative" },
  { name: "Rejected",        color: "#6b7280", isTerminal: true,  kind: "negative" },
];

// Aliases from legacy stage names to the canonical set. Used by the migration
// script to remap existing PipelineStage rows.
export const LEGACY_STAGE_ALIASES: Record<string, string> = {
  Interview: "Interviewing",
  Offer: "Offered",
  Contacted: "Internal Review",
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  FILLED: "Filled",
  CLOSED: "Closed",
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  ON_HOLD: "bg-yellow-100 text-yellow-800",
  FILLED: "bg-purple-100 text-purple-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

export const WORK_ARRANGEMENT_LABELS: Record<string, string> = {
  ON_SITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

export const WORK_ARRANGEMENT_COLORS: Record<string, string> = {
  ON_SITE: "bg-orange-100 text-orange-800",
  REMOTE: "bg-emerald-100 text-emerald-800",
  HYBRID: "bg-sky-100 text-sky-800",
};
