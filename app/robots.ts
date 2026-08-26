import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// robots.txt generado por Next (App Router). Antes daba 404: los
// crawlers igual indexan sin él, pero con robots.txt + sitemap la
// discovery es más rápida y explícita — arranque del SEO 2026-06-26.
//
// Bloqueamos todo lo que está detrás de login o es transaccional:
// no aporta a búsqueda y no queremos esas URLs en el índice.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/settings",
        "/jobs",
        "/candidates",
        "/clients",
        "/contacts",
        "/placements",
        "/calendar",
        "/engagements",
        "/import",
        "/profile",
        "/client-portal",
        "/invite/",
        "/verify-email",
        "/reset-password",
        "/complete-profile",
        "/onboarding",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
