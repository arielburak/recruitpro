# Prompt para Ari — backlog post-launch

**Cómo usar este archivo:** abrí Claude Code (o el agente que uses) parado en el repo, y pegá esto:

> Leé `docs/PROMPT-ARI.md` completo y ejecutá las tareas en orden. Respetá los guardrails al pie de la letra — hay uno que puede borrar datos de producción. Antes de empezar cada tarea, confirmame cuál vas a hacer.

Todo lo de acá abajo es el brief.

---

## Contexto

ATS para agencias de recruiting. Next.js 16 (App Router) + Prisma/Neon + Stripe + NextAuth. Ya está en producción en `recruitingats.com`. No hay clientes pagos todavía: estamos en validación de MVP, así que el criterio es **no romper nada** por encima de agregar features.

Rama de trabajo: `staging`. PR contra `staging` y mergealo vos mismo cuando pase el build. `main` solo si Nicolás lo pide explícitamente.

Lo que sigue son bugs y deudas reales, verificados en el código. Ninguno es bloqueante para operar — son cosas que se notan cuando empieza a entrar gente de afuera.

---

## Guardrails (leer antes de tocar nada)

**1. Staging y producción comparten la MISMA base de datos.** Verificado: un signup en producción aparece en la base contra la que escribe staging. Consecuencias:

- **Nunca** corras `/api/admin/dev-billing-reset` ni ningún script de seed/reset. Borra datos reales.
- Cualquier migración de Prisma impacta producción. Ver tarea T5.
- El script de build corre `prisma db push --accept-data-loss` cuando `VERCEL_ENV = preview`. **Antes de abrir tu primer PR**, confirmá con Nicolás qué `DATABASE_URL` tienen los deploys de preview. Si apuntan a la base de producción, un preview build puede tirar columnas. Si es así, avisá y frená — eso se arregla primero.

**2. `proxy.ts` tiene que conservar `export const config = { matcher }` al final del archivo.** Si desaparece, se rompe el ruteo de CSS/JS y la app queda sin estilos. Verificá con `curl` después de tocarlo.

**3. Toda copy visible al usuario va en inglés.** Botones, diálogos, toasts, mensajes de error de API, emails. Los comentarios en el código y los commits pueden ir en castellano — el repo ya es así.

**4. Nunca commitees `.test-credentials.json`** ni ninguna key. Está en `.gitignore`, que siga así. No pegues secrets de Stripe (`sk_live_`, `sk_test_`) en ningún lado.

**5. Este Next.js no es el que conocés.** Hay breaking changes respecto de lo que trae la mayoría de los modelos en su training. Antes de escribir código de framework, leé la guía correspondiente en `node_modules/next/dist/docs/`.

**6. Para cambios que toquen 3+ archivos, corré `npx next build` local antes de pushear.** El HMR no caza errores de tipos que sí rompen el build de Vercel.

**7. Arreglá la raíz, no el síntoma.** Si ves que estás hardcodeando algo, duplicando lógica o agregando un "y si pasa X", ese es el olor de que estás poniendo una curita. El fix tiene que sobrevivir cuando cambien los inputs.

---

## T1 — Los link previews están rotos

**Qué pasa hoy:** cuando alguien comparte `recruitingats.com` en Slack, WhatsApp, LinkedIn o X, no aparece imagen. Dos causas, las dos en [app/layout.tsx](../app/layout.tsx):

- No hay `metadataBase`. Sin eso Next resuelve la URL de la imagen contra un host que adivina, no contra el dominio real.
- La imagen de OG es `/icon.svg`, 512x512. Casi ningún scraper social renderiza SVG, y el ratio correcto es 1200x630.

**Qué hay que lograr:** que pegar el link en Slack muestre título, descripción e imagen.

- Usá el helper que ya existe, `siteUrl()` en [lib/site-url.ts](../lib/site-url.ts), para setear `metadataBase`. No inventes otra resolución de URL.
- Agregá una imagen OG de 1200x630 en PNG. Podés generarla con `ImageResponse` en un `app/opengraph-image.tsx` (es lo más mantenible: no hay que versionar un binario) o meter un PNG estático. Cualquiera de las dos sirve.
- Revisá de paso que el `title` y la `description` sean los que queremos mostrar: hoy dicen "Recruiting ATS - Applicant Tracking System" y "Modern ATS for recruiting firms".

**Cómo verificar:** `curl -s https://recruitingats.com | grep 'og:'` tiene que devolver URLs absolutas al dominio real. Después pegá el link en el validador de LinkedIn o en un canal de Slack de prueba.

---

## T2 — Hay tres direcciones de soporte distintas dando vueltas

**Qué pasa hoy:** un usuario que pide ayuda ve un mail distinto según dónde esté parado.

| Dirección | Dónde aparece |
|---|---|
| `support@recruitingats.com` | Páginas de forgot-password y reset-password |
| `contact@alphabridgepartners.com` | Landing, reply-to por defecto de todos los mails, y **hardcodeado adentro de un mensaje de error de API** |
| `nicolas@alphabridgepartners.com` | Privacy y Terms |

Dos de esas ni siquiera son del dominio del producto. Y `alphabridgepartners.com` es otra empresa — para el que lo recibe parece phishing.

**Qué hay que lograr:** una sola dirección, definida en un solo lugar.

- Ya existe la env var `SUPPORT_EMAIL`, pero solo la lee [lib/email.ts](../lib/email.ts). Exportá un helper único desde ahí (o desde `lib/constants.ts`) y usalo en **todos** los lugares de la tabla.
- El caso peor es [app/api/admin/billing/update-seats/route.ts:66](../app/api/admin/billing/update-seats/route.ts), que tiene el mail escrito adentro del string de error. Eso tiene que salir del helper.
- **Preguntale a Nicolás qué dirección queda** antes de propagar. No la elijas vos.

**Cómo verificar:** buscar los tres literales en el repo no devuelve nada, salvo el único fallback del helper.

---

## T3 — `/login` y `/register` sirven HTML vacío

**Qué pasa hoy:** las dos páginas arrancan con `"use client"`, así que el HTML que sale del servidor es un esqueleto. El contenido aparece recién cuando corre el JS. Google indexa poco y nada, y cualquiera con JS lento ve una pantalla en blanco. Esto importa ahora que arranca el SEO.

**Qué hay que lograr:** que el HTML servido ya traiga los textos.

- Convertí la página en server component y bajá a un componente cliente **solo la parte interactiva** (el form, el estado, los hooks).
- Cuidado con dos cosas en [app/(auth)/login/page.tsx](<../app/(auth)/login/page.tsx>): lee `searchParams` para mostrar los errores de OAuth (`error=OAuthAccountNotLinked`, `AccessDenied`, etc.) y para el caso `deactivated`. Ese comportamiento no se puede perder — es un fix reciente. Probá los dos caminos a mano después de refactorizar.
- Lo interactivo va envuelto en `<Suspense>`.

**Cómo verificar:** `curl -s https://recruitingats.com/login | grep -i "sign in"` tiene que encontrar el texto real, no un `<div id="root">` pelado. Y el login con Google tiene que seguir funcionando, incluidos los mensajes de error.

---

## T4 — Hay 3 cron jobs y el plan de Vercel puede bancar 2

**Qué pasa hoy:** [vercel.json](../vercel.json) declara tres crons diarios: `expire-trials`, `cleanup-webhook-events` y `reconcile-seats`. El plan Hobby de Vercel permite 2, y solo con frecuencia diaria. Si el proyecto está en Hobby, hay uno que directamente no corre — y `expire-trials` es el que corta el acceso cuando se vence un trial, o sea que si el que no corre es ese, la gente sigue entrando gratis.

**Qué hay que lograr:** los tres jobs corriendo.

- Primero fijate en qué plan está el proyecto. Si es Pro, no hay nada que hacer más que confirmar en los logs que los tres se ejecutan.
- Si es Hobby: consolidá los tres en un único route handler que los llame en secuencia, con un solo cron. Mantené la autenticación por `Bearer ${CRON_SECRET}` que ya usan, y que el fallo de uno no impida que corran los otros.

**Cómo verificar:** los logs de Vercel muestran ejecución de los tres al día siguiente.

---

## T5 — El token del portal de clientes no identifica a la persona ⚠️ requiere migración

**Qué pasa hoy:** `ClientPortalToken` guarda solo `clientId` — la empresa, no la persona. La identidad sale del email que el invitado tipea en el form de set-password.

Por eso, hasta el commit `ea82e95`, re-invitar a alguien invalidaba los links pendientes de **todos sus compañeros** de la misma empresa: ellos clickeaban y veían "Invalid or expired link" sin entender nada. El parche fue dejar de invalidar; los tokens viejos ahora viven hasta su expiry de 7 días. Está documentado en [app/api/contacts/[id]/invite-portal/route.ts:122](<../app/api/contacts/[id]/invite-portal/route.ts>).

**Qué hay que lograr:** invalidación por persona, no por empresa.

- Agregá `clientUserId String?` a `ClientPortalToken` en [prisma/schema.prisma:323](../prisma/schema.prisma), con su índice.
- Seteá el campo al crear el token.
- Restaurá la invalidación, ahora scopeada por `clientUserId`.
- Los tokens viejos quedan con `clientUserId = null`: tienen que seguir funcionando hasta que expiren. No los invalides en la migración.

**⚠️ Antes de aplicar la migración, hablá con Nicolás.** Corre contra la base de producción. Agregar una columna nullable es aditivo y de bajo riesgo, pero no lo hagas sin avisar, y no uses `--accept-data-loss` a mano.

---

## T6 — Quién manda sobre la cantidad de seats: investigar antes de tocar

**Qué pasa hoy:** hay dos mecanismos empujando en direcciones opuestas.

- El webhook `customer.subscription.updated` en [app/api/webhooks/stripe/route.ts:444](../app/api/webhooks/stripe/route.ts) escribe `seats: quantity` — o sea Stripe manda sobre la base.
- El cron [app/api/cron/reconcile-seats](../app/api/cron/reconcile-seats/route.ts) hace lo inverso: lee `Subscription.seats` de la base y lo pushea a Stripe.

En régimen normal convergen, así que no hay bug observado. El riesgo es una carrera: si llega un evento viejo de Stripe justo después de que un admin cambió los seats desde la app, el evento pisa el valor nuevo.

**Qué hay que lograr:** entender cuál es la fuente de verdad y dejarlo explícito.

El modelo de negocio es: Stripe cobra **Purchased** (`Subscription.seats`, lo que el admin compró), que puede ser mayor que **Assigned** (usuarios activos). La diferencia son seats disponibles sin asignar, y eso es válido — está pensado como LinkedIn Recruiter.

**Esta tarea es de investigación primero.** No reescribas nada hasta poder explicar en qué orden llegan los eventos y cuál de los dos tiene que ganar. Si no llegás a una conclusión clara, escribí lo que encontraste y dejáselo a Nicolás. Es la tarea de menor prioridad de la lista.

---

## Lo que NO se puede hacer desde GitHub

Esto necesita acceso a dashboards o una tarjeta. Si Ari no los tiene, quedan para Nicolás:

- **Stripe (producción):** que `STRIPE_WEBHOOK_SECRET` sea el signing secret del endpoint live, y que estén suscritos los 8 eventos: `checkout.session.completed`, `customer.subscription.created` / `.updated` / `.deleted`, `customer.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- **Google Cloud Console:** el estado de publicación de la app OAuth tiene que ser "In production", no "Testing". En Testing solo entran los usuarios de prueba cargados a mano (tope ~100). No hace falta pasar por la revisión de Google porque solo pedimos `openid email profile`, que son permisos no sensibles.
- **Vercel:** que estén seteadas `RESEND_API_KEY`, `CRON_SECRET` y `NEXTAUTH_URL`, y el plan (ver T4).
- **Un pago real de $20.** Es lo único que cierra el circuito completo Stripe → webhook → base. No se puede simular.
- **Separar la base de staging de la de producción** (Neon). Tiene que pasar antes del primer cliente pago. Ver guardrail 1.
