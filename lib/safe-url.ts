// Saneo de URLs que vienen de datos del usuario y terminan en un href.
//
// Por que hace falta: en zod 4, `z.string().url()` valida con el
// constructor `URL`, que acepta CUALQUIER esquema. O sea que
// `javascript:alert(document.cookie)` y `data:text/html,<script>...`
// pasan la validacion sin chistar. Esos campos (candidate.linkedIn,
// client.website, contact.linkedIn) se renderizan en un `href`, asi
// que un valor preparado ejecuta script con la sesion del reclutador
// que hace click.
//
// No es un caso hipotetico: esos campos no los tipea solo el
// reclutador. Entran tambien por import de CSV, por el parseo de CV y
// por POST /api/contacts.
//
// React NO protege de esto: escapa el contenido de texto, no el
// esquema de un href.

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Devuelve la URL si es segura para poner en un `href`, o `undefined`
 * si no lo es. Un valor sin esquema (`acme.com`) se asume https.
 */
export function safeExternalUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Sin esquema: asumimos https en vez de descartarlo, porque la
  // gente escribe "linkedin.com/in/fulano" todo el tiempo.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }

  // `protocol` sale normalizado en minusculas, asi que "JaVaScRiPt:"
  // tambien cae aca.
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return undefined;

  return parsed.toString();
}

/**
 * Para usar en schemas de zod: acepta vacio, y rechaza cualquier URL
 * cuyo esquema no sea seguro. Corta el problema en la entrada, no solo
 * en el render.
 */
export function isSafeExternalUrl(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  return safeExternalUrl(value) !== undefined;
}
