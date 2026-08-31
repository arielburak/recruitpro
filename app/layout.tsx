import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toast";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { siteUrl } from "@/lib/site-url";

const inter = Inter({ subsets: ["latin"] });

const title = "Recruiting ATS — Applicant Tracking System for Agencies";
const description =
  "Track candidates, jobs and clients in one place. Built for recruiting agencies, with a client portal your clients will actually use.";

export const metadata: Metadata = {
  // Sin metadataBase, Next resuelve las URLs relativas de og:image
  // contra un host que adivina (localhost en build) — los previews de
  // Slack / LinkedIn / WhatsApp quedaban sin imagen. Reusamos el mismo
  // helper que robots.ts y sitemap.ts para no tener dos resoluciones
  // de URL canónica que puedan divergir.
  metadataBase: new URL(siteUrl()),
  title,
  description,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: { url: "/icon.svg", type: "image/svg+xml" },
  },
  // No declaramos `images` acá a propósito: lo resuelve el archivo
  // app/opengraph-image.tsx (file convention), que genera un PNG de
  // 1200x630. Antes apuntaba a /icon.svg y los scrapers sociales no
  // renderizan SVG.
  openGraph: {
    type: "website",
    siteName: "Recruiting ATS",
    url: "/",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        <Providers>{children}</Providers>
        <Toaster />
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
