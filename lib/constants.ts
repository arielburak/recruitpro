// Decisión 2026-06-19: 7 días free trial sin tarjeta. Después hard
// paywall (ver requireActiveSubscription) — el user tiene que pagar
// para seguir creando data.
export const TRIAL_DAYS = 7;

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
  { name: "Interviewing",    color: "#3b82f6", isTerminal: false, kind: null },
  { name: "Offered",         color: "#8b5cf6", isTerminal: false, kind: null },
  { name: "Placed",          color: "#10b981", isTerminal: true,  kind: "positive" },
  { name: "Lost",            color: "#ef4444", isTerminal: true,  kind: "negative" },
  { name: "Rejected",        color: "#6b7280", isTerminal: true,  kind: "negative" },
];

// Stages the client side ever sees. Everything before "Submitted" is
// agency-internal work (sourcing, screening) and never reaches the
// client portal. The pipeline view in /client-portal/jobs/[id] and the
// auto-mirror of clientStage both filter by this list — keep it
// consistent with DEFAULT_STAGES.
export const CLIENT_VISIBLE_STAGE_NAMES = [
  "Submitted",
  "Interviewing",
  "Offered",
  "Placed",
  "Lost",
  "Rejected",
] as const;
export const CLIENT_VISIBLE_STAGE_SET: ReadonlySet<string> = new Set(
  CLIENT_VISIBLE_STAGE_NAMES
);

// Aliases from legacy stage names to the canonical set. Used by the
// migration script to remap existing PipelineStage rows. "Under Review"
// is folded into "Submitted" — it used to sit between Submitted and
// Interviewing but recruiters never used it in practice, the flow goes
// straight from Submitted to Interviewing or Rejected.
export const LEGACY_STAGE_ALIASES: Record<string, string> = {
  Interview: "Interviewing",
  Offer: "Offered",
  Contacted: "Internal Review",
  "Under Review": "Submitted",
};

// User-facing statuses recruiters can pick. Order matches the
// flow: signed → working → outcome (positive or negative).
export const JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
  LOST: "Lost",
  // Legacy — included so old rows still render, hidden from
  // selectable options via JOB_STATUS_SELECTABLE below.
  CLOSED: "Closed",
};

// Subset that's offered in create / edit dropdowns. CLOSED is
// rendered for legacy rows but you can't save a new job as CLOSED.
export const JOB_STATUS_SELECTABLE: readonly string[] = [
  "OPEN",
  "ACTIVE",
  "ON_HOLD",
  "FILLED",
  "CANCELLED",
  "LOST",
];

export const JOB_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  ON_HOLD: "bg-yellow-100 text-yellow-800",
  FILLED: "bg-purple-100 text-purple-800",
  CANCELLED: "bg-red-100 text-red-800",
  LOST: "bg-rose-100 text-rose-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

// AR payroll: worker pays ~17% in contributions (Jubilación 11% +
// Ley 19032 / PAMI 3% + Obra Social 3%). So gross × 0.83 = net,
// and net / 0.83 = gross. Used to normalise a NETO salary back to
// BRUTO before fees are calculated.
export const AR_NET_TO_GROSS = 1 / 0.83;

// Currencies where the Bruto/Neto toggle is shown on the Placement
// form. ARS is the obvious case; if other LATAM markets need it
// later just add them here. Other currencies hide the toggle and
// default the placement to BRUTO so US-flow users don't see a knob
// they don't need.
export const SALARY_KIND_CURRENCIES = new Set(["ARS"]);

export function netToGross(net: number): number {
  return net * AR_NET_TO_GROSS;
}

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

// Industry verticals a recruiting firm may focus on. Stored as the raw label
// so it renders directly without an extra lookup.
export const INDUSTRY_OPTIONS: string[] = [
  "Recruitment & Staffing",
  "Technology & Engineering",
  "Finance & Banking",
  "Healthcare & Life Sciences",
  "Sales & Marketing",
  "Executive / C-Suite",
  "Legal",
  "Manufacturing & Industrial",
  "Retail & Consumer",
  "Creative & Design",
  "Operations & Supply Chain",
  "Non-profit & Education",
  "General / Multi-vertical",
  "Other",
];

// Recruiting firm headcount bucket. Stored as the label so we don't need a
// separate mapping table for reads.
export const COMPANY_SIZE_OPTIONS: string[] = [
  "Under 10",
  "10–50",
  "50–200",
  "200+",
];
