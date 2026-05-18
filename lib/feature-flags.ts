/**
 * Feature flags for the Recruiting ATS.
 *
 * All flags are NEXT_PUBLIC_* so they're available in both client and server
 * components. Default is OFF for features in progress — set the env var to
 * "true" in Vercel / .env.local to enable.
 */

export const FEATURES = {
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
