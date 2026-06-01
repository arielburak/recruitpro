// Shared calendar option catalogs. Used by /calendar's grid + modals
// and any future inline-edit / quick-add surfaces. Kept module-level
// so they're tree-shake friendly and so a future feature flag (e.g.
// disable Zoom) only flips one place.
//
// Icons + components-only stuff live in the consuming file — this
// module stays icon-agnostic so it can be imported from server code
// too without dragging React.

import { FEATURES } from "@/lib/feature-flags";

export type InterviewTypeOption = {
  value: string;
  label: string;
};

export const TYPE_OPTIONS: InterviewTypeOption[] = [
  { value: "VIDEO", label: "Video Call" },
  { value: "PHONE", label: "Phone" },
  { value: "IN_PERSON", label: "In Person" },
];

export const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-yellow-100 text-yellow-700",
};

export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

export type PlatformOption = {
  value: string;
  label: string;
  color: string;
  requiresIntegration: boolean;
  provider?: "google" | "microsoft";
};

const ALL_PLATFORM_OPTIONS: PlatformOption[] = [
  { value: "google_meet", label: "Google Meet", color: "text-green-600", requiresIntegration: true, provider: "google" },
  { value: "microsoft_teams", label: "Microsoft Teams", color: "text-blue-600", requiresIntegration: true, provider: "microsoft" },
  { value: "zoom", label: "Zoom", color: "text-blue-500", requiresIntegration: false },
  { value: "custom", label: "Custom Link", color: "text-gray-600", requiresIntegration: false },
  { value: "none", label: "No Video", color: "text-gray-400", requiresIntegration: false },
];

// Microsoft Teams is gated on the feature flag so it only surfaces
// once the Azure tenant is configured. Everything else ships always.
export const PLATFORM_OPTIONS: PlatformOption[] = ALL_PLATFORM_OPTIONS.filter(
  (p) => !(p.provider === "microsoft" && !FEATURES.microsoftIntegration)
);

export type TimezoneOption = {
  value: string;
  label: string;
  offset: string;
  region: string;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Americas
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", offset: "UTC-3", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo", offset: "UTC-3", region: "Americas" },
  { value: "America/Santiago", label: "Santiago", offset: "UTC-3", region: "Americas" },
  { value: "America/Bogota", label: "Bogotá", offset: "UTC-5", region: "Americas" },
  { value: "America/Lima", label: "Lima", offset: "UTC-5", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City", offset: "UTC-6", region: "Americas" },
  { value: "America/New_York", label: "New York (ET)", offset: "UTC-5/4", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (CT)", offset: "UTC-6/5", region: "Americas" },
  { value: "America/Denver", label: "Denver (MT)", offset: "UTC-7/6", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)", offset: "UTC-8/7", region: "Americas" },
  { value: "America/Toronto", label: "Toronto", offset: "UTC-5/4", region: "Americas" },
  { value: "America/Vancouver", label: "Vancouver", offset: "UTC-8/7", region: "Americas" },
  // Europe
  { value: "Europe/London", label: "London (GMT/BST)", offset: "UTC+0/1", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", offset: "UTC+3", region: "Europe" },
  // Asia & Middle East
  { value: "Asia/Dubai", label: "Dubai (GST)", offset: "UTC+4", region: "Asia" },
  { value: "Asia/Kolkata", label: "Mumbai (IST)", offset: "UTC+5:30", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "UTC+8", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: "UTC+8", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: "UTC+9", region: "Asia" },
  { value: "Asia/Seoul", label: "Seoul (KST)", offset: "UTC+9", region: "Asia" },
  // Oceania
  { value: "Australia/Sydney", label: "Sydney (AEST)", offset: "UTC+10/11", region: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)", offset: "UTC+12/13", region: "Oceania" },
];
