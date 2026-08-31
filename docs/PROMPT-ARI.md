# Prompt para Ari — estado y backlog

**Cómo usar este archivo:** abrí Claude Code parado en el repo y pegá esto:

> Leé `docs/PROMPT-ARI.md` completo. Respetá los guardrails al pie de la letra — hay uno que puede borrar datos de producción. Decime qué tarea querés que agarre y confirmame antes de empezar.

---

## Contexto

ATS para agencias de recruiting. Next.js 16 (App Router) + Prisma/Neon + Stripe + NextAuth. Ya está en producción en `recruitingats.com`. No hay clientes pagos todavía: estamos en validación de MVP, así que el criterio es **no romper nada** por encima de agregar features.

Rama de trabajo: `staging`. PR contra `staging` y mergealo vos mismo cuando pase el build. `main` solo si Nicolás lo pide explícitamente.

---

## Guardrails (leer antes de tocar nada)

**1. Staging y producción comparten la MISMA base de datos.** Verificado: un signup en producción aparece en la base contra la que escribe staging. Consecuencias:

- **Nunca** corras `/api/admin/dev-billing-reset` ni ningún script de seed/reset. Borra datos reales.
- Cualquier migración de Prisma impacta producción.
- El script de build corre `prisma db push --accept-data-loss` cuando `VERCEL_ENV = preview`. **Antes de abrir tu primer PR**, confirmá con Nicolás qué `DATABASE_URL` tienen los deploys de preview. Si apuntan a la base de producción, un preview build puede tirar columnas. Si es así, avisá y frená — eso se arregla primero.

**2. `proxy.ts` tiene que conservar `export const config = { matcher }` al final del archivo.** Si desaparece, se rompe el ruteo de CSS/JS y la app queda sin estilos.

**3. Toda copy visible al usuario va en inglés.** Botones, diálogos, toasts, errores de API, emails. Comentarios y commits pueden ir en castellano — el repo ya es así.

**4. Nunca commitees `.test-credentials.json`** ni ninguna key. No pegues secrets de Stripe (`sk_live_`, `sk_test_`) en ningún lado.

**5. Este Next.js no es el que conocés.** Antes de escribir código de framework, leé la guía correspondiente en `node_modules/next/dist/docs/`.

**6. Para cambios que toquen 3+ archivos, corré `npx next build` local antes de pushear.** El HMR no caza errores de tipos que sí rompen el build de Vercel.

**7. Arreglá la raíz, no el síntoma.** Si estás hardcodeando algo, duplicando lógica o agregando un "y si pasa X", eso es una curita.

---

## Ya está hecho (no rehacer)

Todo esto se resolvió y está mergeado en `staging`:

- **Link previews.** Faltaba `metadataBase` y la imagen era un SVG que los scrapers sociales no renderizan. Ahora hay `app/opengraph-image.tsx` que genera un PNG 1200x630. De paso apareció que el proxy 307eaba `/opengraph-image` a `/login`, así que el fix habría quedado anulado en prod.
- **Mail de soporte.** Había tres direcciones distintas, y `recruitingats.com` no tiene registros MX — a la gente bloqueada afuera de su cuenta le decíamos que escriba a un buzón inexistente. Unificado en `SUPPORT_EMAIL` (`lib/constants.ts`).
- **`/login` y `/register` servían HTML vacío.** Eran client components enteros. Ahora la page es server y el form quedó como island.
- **Cron jobs.** Había 3 declarados y el plan Hobby limita la cantidad, así que al menos uno nunca corría. Consolidados en `/api/cron/daily`; la lógica vive en `lib/cron-jobs.ts`.
- **Webhook de Stripe.** `customer.subscription.updated` escribía los seats desde el payload del evento, que puede llegar desordenado. Como el cron después empuja esos seats de vuelta a Stripe, un evento atrasado cambiaba lo que se le factura al cliente. Ahora relee el estado con `subscriptions.retrieve()`.

---

## Lo que queda

### T1 — Token del portal de clientes por persona ⚠️ requiere migración

**Qué pasa hoy:** `ClientPortalToken` guarda solo `clientId` — la empresa, no la persona. La identidad sale del email que el invitado tipea en el form de set-password.

Por eso, hasta el commit `ea82e95`, re-invitar a alguien invalidaba los links pendientes de **todos sus compañeros** de la misma empresa: clickeaban y veían "Invalid or expired link" sin entender nada. El parche fue dejar de invalidar; los tokens viejos viven hasta su expiry de 7 días. Está documentado en [app/api/contacts/[id]/invite-portal/route.ts](<../app/api/contacts/[id]/invite-portal/route.ts>).

**Qué hay que lograr:** invalidación por persona.

- Agregar `clientUserId String?` a `ClientPortalToken` en [prisma/schema.prisma](../prisma/schema.prisma), con su índice.
- Setear el campo al crear el token.
- Restaurar la invalidación, ahora scopeada por `clientUserId`.
- Los tokens viejos quedan con `clientUserId = null`: tienen que seguir funcionando hasta que expiren. No los invalides en la migración.

**⚠️ No apliques la migración sin hablar con Nicolás.** Corre contra la base de producción. Agregar una columna nullable es aditivo y de bajo riesgo, pero el cambio de schema y el deploy tienen que salir juntos: si el código llega antes que la columna, Prisma rompe en cualquier query de esa tabla.

### T2 — Separar la base de staging de la de producción

Ver guardrail 1. Tiene que pasar antes del primer cliente pago. Es trabajo de Neon + env vars en Vercel, no de código.

---

## Accesos y dashboards

Esto no sale de GitHub. Si no tenés acceso, es de Nicolás:

- **Vercel:** el proyecto es `recruitpro`, bajo la cuenta `arielburak's projects`, en plan **Hobby**. Dos cosas a mirar: en Hobby la cuenta es personal, así que sumar un segundo colaborador implica pasar a Pro; y conviene confirmar con Vercel que el plan Hobby admite uso comercial antes de cobrarle a clientes desde ahí.
- **Stripe (producción):** que `STRIPE_WEBHOOK_SECRET` sea el signing secret del endpoint live, y que estén suscritos los 8 eventos: `checkout.session.completed`, `customer.subscription.created` / `.updated` / `.deleted`, `customer.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- **Google Cloud Console:** el estado de publicación de la app OAuth tiene que ser "In production", no "Testing". En Testing solo entran los usuarios de prueba cargados a mano (tope ~100). No hace falta la revisión de Google porque solo pedimos `openid email profile`, permisos no sensibles.
- **Env vars en Vercel:** `RESEND_API_KEY`, `CRON_SECRET`, `NEXTAUTH_URL`. Opcional: `SUPPORT_EMAIL` si se cambia la dirección de soporte.
- **DNS de recruitingats.com:** no tiene registros MX. Mientras siga así, ninguna dirección `@recruitingats.com` puede recibir mail.
- **Un pago real de $20.** Es lo único que cierra el circuito Stripe → webhook → base. No se puede simular.
