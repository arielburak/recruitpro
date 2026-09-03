# Recruiting ATS

Applicant tracking system para agencias de recruiting. Next.js 16 (App
Router) + Prisma/Neon + Stripe + NextAuth. En producción en
[recruitingats.com](https://recruitingats.com).

Dos tipos de usuario:

- **Agencia** (`/dashboard` y todo lo demás) — los recruiters que pagan.
  Manejan candidatos, búsquedas, clientes y placements.
- **Portal del cliente** (`/client-portal/*`) — las empresas que
  contratan a la agencia. Ven los candidatos que les compartieron, dejan
  feedback y piden entrevistas. No pagan nada.

Las convenciones de código y el flujo de git están en
[AGENTS.md](AGENTS.md). Las notas de deploy, en
[docs/DEPLOY-NOTES.md](docs/DEPLOY-NOTES.md).

---

## ⚠️ Antes de levantarlo: la base de datos

**Staging y producción comparten la misma base.** Si copiás el
`DATABASE_URL` de Vercel a tu `.env` local, vas a estar desarrollando
contra datos reales de clientes: cada candidato que crees probando, cada
borrado, cada migración, van a la base de producción.

**Armate tu propia base antes de correr nada.** Neon tiene branching
instantáneo, que es exactamente para esto:

1. Entrar al proyecto en [console.neon.tech](https://console.neon.tech).
2. Crear un branch nuevo desde `main` (te da una copia
   copy-on-write, tarda segundos y no duplica el costo de storage).
3. Copiar el connection string de **ese** branch a tu `.env`.

Así tenés el schema real y podés romper lo que quieras. Si preferís
arrancar de cero, `npx prisma db push` contra una base vacía te crea
todo el schema.

Lo que **no** hay que hacer nunca contra la base de producción:

- Correr `/api/admin/dev-billing-reset` (borra candidatos, búsquedas,
  clientes y entrevistas del workspace).
- Correr `prisma db push --accept-data-loss`.
- Aplicar un cambio de schema sin coordinarlo. Ver
  [docs/DEPLOY-NOTES.md](docs/DEPLOY-NOTES.md).

---

## Setup

Requiere **Node 24** (es la versión que usa el proyecto en Vercel).

```bash
git clone https://github.com/arielburak/recruitpro.git
cd recruitpro
git checkout staging      # la rama de trabajo; main es producción
npm install               # el postinstall corre prisma generate
cp .env.example .env      # y completar, ver abajo
npm run dev
```

Queda en [http://localhost:3000](http://localhost:3000).

### Variables de entorno

`.env.example` tiene la lista completa con comentarios. Lo que importa
saber es qué bloquea y qué no:

**Obligatorias — sin estas no arranca:**

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres (pooled). Usá tu branch de Neon, no la de producción. |
| `DIRECT_DATABASE_URL` | Conexión directa, sin pooler. La usa Prisma para migraciones. |
| `NEXTAUTH_SECRET` | Firma de los JWT de sesión. Generala con `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | `http://localhost:3000` en local. |

**Opcionales — la app arranca sin ellas, pero se cae la feature:**

| Variable | Qué se rompe si falta |
|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` | El botón "Continue with Google" aparece pero falla. Login con email y contraseña sigue andando. |
| `STRIPE_SECRET_KEY` y las `STRIPE_PRICE_ID_*` | Todo lo de billing tira error al usarlo (el cliente de Stripe es lazy, así que la app igual levanta). Usá claves de **test**. |
| `STRIPE_WEBHOOK_SECRET` | El webhook rechaza todo. Para probarlo local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. |
| `RESEND_API_KEY` | No sale ningún mail. Degrada solo: `sendEmail` devuelve `{skipped:true}` sin tirar excepción, así que los flujos no se cortan — pero el mail no llega y en la UI parece que sí. Ventaja para local: sin la key, el HTML del mail se loguea en la consola, así que los links de invitación y de reset los sacás del terminal. |
| `BLOB_READ_WRITE_TOKEN` | No se pueden subir ni borrar archivos adjuntos. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | El rate limiting queda **apagado**. En local da igual; en producción es un agujero. |
| `SENTRY_*` | Sin reporte de errores. Irrelevante en local. |
| `AZURE_AD_CLIENT_ID` / `_SECRET` | La integración con Microsoft Calendar (está detrás de un feature flag). |

### Ojo con los mails salientes

Si por cualquier razón terminás corriendo local con la `RESEND_API_KEY`
real y una base con datos reales, un flujo de prueba puede mandarle un
mail a un cliente de verdad. Hay dos frenos para eso, y conviene dejar
uno puesto en el `.env` local:

```
DISABLE_OUTBOUND_EMAIL=1          # no sale nada, se loguea todo
# o, si querés recibir los mails vos:
EMAIL_ALLOWLIST=vos@tumail.com    # solo estas direcciones reciben
```

Producción tiene las dos sin setear, y así debe quedar.

### Conseguir una cuenta para entrar

Con tu propia base, lo más simple es registrarte:
`/register` crea un workspace nuevo con 7 días de trial, sin tarjeta.
Quedás ADMIN de tu propio workspace y podés invitar usuarios de prueba
desde `/settings/team`.

Para probar el portal del cliente hace falta el otro lado: creá un
Client, agregale un Contact con email, e invitalo al portal desde la
ficha del contacto. Te llega (o no, si no tenés Resend configurado —
el link de set-password igual queda en la tabla `ClientPortalToken`).

---

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # prisma generate + next build. Corré esto antes de pushear
npm run lint       # eslint
npx prisma studio  # explorador de la base, útil para ver qué quedó
npx prisma db push # aplica el schema a la base (SIN --accept-data-loss)
```

## Deploy

Vercel, conectado al repo. `main` es producción (`recruitingats.com`),
`staging` deploya como preview. El flujo de git está en
[AGENTS.md](AGENTS.md): todo pasa por `staging` primero, y `main` solo
cuando se decide promover.
