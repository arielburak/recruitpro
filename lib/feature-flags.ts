/**
 * Feature flags for the Recruiting ATS.
 *
 * All flags are NEXT_PUBLIC_* so they're available in both client and server
 * components. Default is OFF for features in progress — set the env var to
 * "true" in Vercel / .env.local to enable.
 *
 * When the Google OAuth app finishes verification (4-6 weeks), flip
 * NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS to "true" in production to
 * turn the feature back on everywhere at once.
 */

export const FEATURES = {
  /**
   * Calendar + meeting integrations (Google Calendar/Meet, Microsoft Teams).
   * Hidden by default while Google OAuth verification is pending, because the
   * "Google hasn't verified this app" warning creates friction for end users.
   */
  calendarIntegrations:
    process.env.NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS === "true",
} as const;
