export const TRIAL_DAYS = 7;
export const PRICE_PER_SEAT_CENTS = 1000; // $10.00
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";

export const DEFAULT_PIPELINE_STAGES = [
  { name: "Sourced", color: "#94a3b8" },
  { name: "Contacted", color: "#60a5fa" },
  { name: "Submitted", color: "#a78bfa" },
  { name: "Interview", color: "#fbbf24" },
  { name: "Offer", color: "#34d399" },
  { name: "Placed", color: "#22c55e" },
];

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

export const WORK_MODE_LABELS: Record<string, string> = {
  ON_SITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

export const WORK_MODE_COLORS: Record<string, string> = {
  ON_SITE: "bg-orange-100 text-orange-800",
  REMOTE: "bg-emerald-100 text-emerald-800",
  HYBRID: "bg-sky-100 text-sky-800",
};
