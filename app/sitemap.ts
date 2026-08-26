import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Solo páginas públicas e indexables. Login/register quedan fuera a
// propósito: no son contenido de búsqueda y ensucian el índice.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
