// Rate limiting para endpoints de auth y otros high-risk.
//
// Backend: Upstash Redis serverless (REST API, sin TCP — funciona en
// Edge runtime + Vercel Functions sin connection pooling). Sliding
// window por defecto — fair contra bursts y simple de razonar.
//
// Setup (una sola vez):
//   1. Crear DB en https://console.upstash.com/redis (free tier:
//      10k commands/día, alcanza para un ATS de tamaño MVP).
//   2. Copiar REST URL + REST Token de "REST API" tab.
//   3. Setear en Vercel env vars de production y preview:
//        UPSTASH_REDIS_REST_URL
//        UPSTASH_REDIS_REST_TOKEN
//
// Fallback graceful: si las env vars no están seteadas, el limiter
// se vuelve no-op (todo `success=true`). Permite deployar sin
// configurar Upstash todavía sin romper auth. Pero deja los
// endpoints sin protección — no es el end state.
//
// Buckets predefinidos. Identifier es:
//   · IP (typical) — IPv4 / IPv6 del request
//   · email (login / resend) — para que un atacante no pueda quemar
//     verificaciones de otros emails desde una misma IP
//   · combinación IP:email — más granular, para signup

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Singleton Redis client — lazy init para no fallar al cargar el módulo
// cuando faltan env vars. Null = no configurado = no-op.
let redisClient: Redis | null = null;
let redisInitTried = false;

function getRedis(): Redis | null {
  if (redisInitTried) return redisClient;
  redisInitTried = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting disabled. Auth endpoints are UNPROTECTED against brute force.",
      );
    }
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

// Buckets — cada uno es un Ratelimit instance con su política propia.
// Defined lazy para no inicializar si Redis no está disponible.
type BucketKey =
  | "auth:register"
  | "auth:login"
  | "auth:forgot-password"
  | "auth:reset-password"
  | "auth:resend-verification"
  | "auth:verify-email";

const bucketConfig: Record<
  BucketKey,
  { tokens: number; window: `${number} ${"s" | "m" | "h" | "d"}` }
> = {
  // Signup: 5 por IP por minuto. Suficiente para retries legítimos,
  // bloquea bots intentando enumerar emails.
  "auth:register": { tokens: 5, window: "1 m" },
  // Login (credentials): 10 por IP por minuto. Más permisivo que
  // signup porque users legítimos tipean mal la password. Brute force
  // queda capado a 600/hora desde una sola IP.
  "auth:login": { tokens: 10, window: "1 m" },
  // Forgot password: 3 por IP por 10 minutos. Cada request manda mail
  // — costo real ($$$ resend + abuso del inbox del usuario target).
  "auth:forgot-password": { tokens: 3, window: "10 m" },
  // Reset password (con token): 5 por IP por minuto. Token corto y
  // único, no es brute-forceable, pero rate-limit defensivo.
  "auth:reset-password": { tokens: 5, window: "1 m" },
  // Resend verification: 3 por hora. Identifier debería ser EMAIL
  // (no IP) para que un user no pueda spammear su propio inbox y
  // tampoco se pueda atacar a varios emails desde una IP.
  "auth:resend-verification": { tokens: 3, window: "1 h" },
  // Verify email (GET con token): 30 por IP por minuto. Token es
  // 32 bytes random, no brute-forceable, pero hay que evitar que
  // un atacante haga DDoS via verify endpoint.
  "auth:verify-email": { tokens: 30, window: "1 m" },
};

const limiters = new Map<BucketKey, Ratelimit>();

function getLimiter(bucket: BucketKey): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = limiters.get(bucket);
  if (!limiter) {
    const cfg = bucketConfig[bucket];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(cfg.tokens, cfg.window),
      // Prefix por bucket para que la key en Redis sea legible y no
      // colisione con otros usos.
      prefix: `rl:${bucket}`,
      analytics: false,
    });
    limiters.set(bucket, limiter);
  }
  return limiter;
}

// Extrae la IP del request — Vercel/Cloudflare ponen la IP real en
// x-forwarded-for. Sin esto, todos los requests parecerían venir
// del proxy y rate-limit sería inútil.
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for puede ser "client, proxy1, proxy2" — la primera
    // es la IP del client. Trim por las dudas.
    return xff.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Fallback — si no hay headers de proxy, sin IP útil. Devolver un
  // string fijo hace que TODOS los requests compartan la cuota, lo
  // que es mejor que falsear que cada uno es único.
  return "unknown";
}

export type RateLimitResult = {
  success: boolean;
  // Cuántos requests permitidos en la ventana actual.
  limit: number;
  // Cuántos quedan disponibles.
  remaining: number;
  // Unix timestamp (ms) cuando se resetea la cuota.
  reset: number;
};

// Chequea el bucket — devuelve `success=true` si está OK, false si
// excedió la cuota. Si Redis no está configurado, devuelve true por
// defecto (no-op) para no romper auth mientras se setea Upstash.
export async function checkRateLimit(
  bucket: BucketKey,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket);
  if (!limiter) {
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: 0,
    };
  }
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// Helper para devolver el 429 con headers estándar (Retry-After,
// RateLimit-*). El frontend puede leer los headers para mostrar
// un mensaje útil al user.
export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  const resetSeconds = Math.max(
    0,
    Math.ceil((result.reset - Date.now()) / 1000),
  );
  return {
    "Retry-After": String(resetSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  };
}
