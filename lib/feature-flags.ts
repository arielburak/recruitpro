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
   * Enabled by default — needed for the OAuth verification demo video. If
   * you ever need to hide the UI again (e.g. if Google rejects verification
   * and you want to hide the friction until you resubmit), set the env var
   * NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS to "false" in Vercel.
   */
  calendarIntegrations:
    process.env.NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS !== "false",
} as const;
