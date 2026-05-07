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

  /**
   * Microsoft Outlook Calendar + Teams meeting integration. Microsoft as
   * an auth/login provider was removed product-wide — this flag now only
   * gates the Teams/Calendar integration UI entry points (integrations
   * tab card + calendar platform picker option). Hidden by default until
   * the Azure App Registration is configured against a proper
   * RecruitingATS tenant.
   *
   * To enable: set NEXT_PUBLIC_ENABLE_MICROSOFT to "true" in Vercel
   * (Production + Preview) + fill in AZURE_AD_CLIENT_ID /
   * AZURE_AD_CLIENT_SECRET. Then redeploy.
   */
  microsoftIntegration:
    process.env.NEXT_PUBLIC_ENABLE_MICROSOFT === "true",
} as const;
