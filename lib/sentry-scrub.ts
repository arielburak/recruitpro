// Shared scrubber para Sentry beforeSend. Filtra PII de los events
// antes de mandarlos al endpoint de Sentry. Aplica al stack trace,
// breadcrumbs, request data, y user context.
//
// Lo que scrubea:
//   · Emails  (foo@bar.com → [email])
//   · Stripe IDs (cus_*, sub_*, pi_*, in_*, etc → [stripe-id])
//   · Query params sospechosos (?token=*, ?key=*, ?password=* → redacted)
//   · Authorization headers
//   · Cookies
//   · session.user.email + session.user.id de objetos serializados
//
// Lo que NO scrubea:
//   · Stack traces de código (paths, line numbers)
//   · Mensajes de error genéricos
//
// Por qué no más agresivo: Sentry necesita info para que el error sea
// útil. Si dropeamos todo, nos quedamos con "Error: Something happened"
// sin contexto. Balance: scrub identificadores personales pero dejá
// la forma del error.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const STRIPE_ID_RE = /\b(cus|sub|pi|in|si|seti|ch|src|tok|prod|price)_[A-Za-z0-9]{6,}\b/g;
const SENSITIVE_PARAM_RE = /([?&](?:token|key|password|secret|api_key|auth)=)[^&\s]+/gi;

// Tokens que viajan en el PATH, no en la query string. SENSITIVE_PARAM_RE
// no los agarra porque busca "?token=" o "&token=".
//
// Tres rutas los usan asi: /invite/<token>, /api/invite/<token> y
// /client-portal/<token>. Un error en cualquiera de esas paginas mandaba
// la URL completa a Sentry con el token adentro — y un invite token
// alcanza para crear una cuenta dentro del workspace.
//
// El {20,} sin guiones evita pisar segmentos legitimos: los tokens son
// hex de 64 chars o cuid alfanumerico, mientras que la ruta mas larga
// del portal ("complete-profile") tiene guion y no matchea.
const PATH_TOKEN_RE = /\/(invite|client-portal)\/[A-Za-z0-9]{20,}/g;

function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(STRIPE_ID_RE, "[stripe-id]")
    .replace(SENSITIVE_PARAM_RE, "$1[redacted]")
    .replace(PATH_TOKEN_RE, "/$1/[redacted]");
}

function scrubDeep(obj: any, depth = 0): any {
  if (depth > 5 || obj == null) return obj;
  if (typeof obj === "string") return scrubString(obj);
  if (Array.isArray(obj)) return obj.map((x) => scrubDeep(x, depth + 1));
  if (typeof obj === "object") {
    const out: any = {};
    for (const key of Object.keys(obj)) {
      // Drop campos sensibles de raíz — no los serialicemos ni
      // scrubeados (no aporta nada al debug y aumenta risk de leak).
      if (
        key === "password" ||
        key === "passwordHash" ||
        key === "authorization" ||
        key === "cookie" ||
        key === "set-cookie" ||
        key === "Authorization"
      ) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = scrubDeep(obj[key], depth + 1);
    }
    return out;
  }
  return obj;
}

// Sentry beforeSend hook. Type-safe contra @sentry/types pero usamos
// any para no tener que importar el SDK acá (evita bundle bloat
// instrumentation-side).
export function scrubSentryEvent(event: any): any {
  if (!event) return event;

  // Scrub el mensaje del error si existe.
  if (event.message) {
    event.message = scrubString(event.message);
  }

  // Scrub stack trace values (exception.values[].value).
  if (event.exception?.values) {
    for (const exc of event.exception.values) {
      if (exc.value) exc.value = scrubString(exc.value);
    }
  }

  // Scrub breadcrumbs (URLs, mensajes, data attached).
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b: any) => ({
      ...b,
      message: b.message ? scrubString(b.message) : b.message,
      data: scrubDeep(b.data),
    }));
  }

  // Scrub request payload completo.
  if (event.request) {
    event.request = scrubDeep(event.request);
  }

  // Scrub user context — Sentry suele guardar email + ip. Dejamos un
  // hash o id genérico pero NO el email crudo.
  if (event.user?.email) {
    event.user = { ...event.user, email: "[email]" };
  }

  // Scrub extra y tags (devs a veces ponen objects con info sensitive).
  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.contexts) event.contexts = scrubDeep(event.contexts);

  return event;
}
