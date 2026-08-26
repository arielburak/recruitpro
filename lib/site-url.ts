// URL canónica del sitio para metadata (robots, sitemap, og tags).
//
// Orden: NEXT_PUBLIC_SITE_URL (override explícito) → NEXTAUTH_URL (ya
// seteada en prod) → VERCEL_URL (previews) → localhost. Nunca devuelve
// undefined: un sitemap con "undefined/privacy" es peor que uno con el
// host equivocado.
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
