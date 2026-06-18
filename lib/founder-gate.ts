// Gate de "founder-only" pages — /operations + cualquier panel ejecutivo
// que solo veamos Nicolás y Ari. Lista por env var para que la podamos
// expandir sin redeploys de código (solo cambio en Vercel).
//
// Defaults: si la env var no está, gateamos a SOLO Nicolás (su email
// canonical), porque ese es el caso de bootstrap inicial. Si querés
// dejar el panel inaccesible mientras se setea Vercel, el default es
// laissez-faire — mejor cuidá agregar la env var.

const DEFAULT_FOUNDER_EMAILS = [
  "ncuello@morabits.net",
  "arielb@morabits.net",
];

export function getFounderEmails(): string[] {
  const raw = process.env.FOUNDER_EMAILS;
  if (!raw) return DEFAULT_FOUNDER_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getFounderEmails().includes(normalized);
}
