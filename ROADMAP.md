# RecruitingATS — Roadmap

> **Foco MVP**: optimizar el flujo de la **firma de reclutamiento** (el que paga). Client portal: tiene que funcionar bien y verse lindo, pero secundario. Landing y marketing al final.

## 🧭 Principios transversales

Aplican a cualquier feature nueva o existente:

1. **Auto-fill obsesivo**. Si el dato ya vive en otra parte del ATS (cliente, búsqueda, candidato, descripción), no se lo pidas al usuario. Pre-rellenalo y dejalo editable.
2. **Diferenciar Recruiting vs Staff Aug**. Recruiting cliente = terms a nivel cliente (fee, payment terms, garantía, currency). Staff Aug cliente = terms a nivel JOB (cada búsqueda negocia los suyos; client.default* quedan null). Cadena de fallback: `job → client → default`.
3. **Default geográfico**: target principal recruiters de US, default everywhere USD; permitir override.
4. **Visualmente prolijo, ágil, óptimo para el usuario**. Menos clicks, menos campos en blanco, menos pantallas que rebotar.

**Convenciones**
- `- [x]` hecho + confirmado funcionando por el usuario
- `- [~]` implementado en staging, **pendiente que vos verifiques**
- `- [ ]` pendiente / nuevo
- Acceso rápido: `/roadmap` desde Claude Code

**Última actualización**: 2026-06-09

---

## 🚨 Crítico

- [ ] **#3 — Cambio de estado sin acceso al job** (BUG seguridad). Desde la vista del candidato, un user sin acceso a una búsqueda puede mover el stage y compartirlo. Debe bloquearse — mismo gate que ya existe en el tab Jobs ("Job not found"). Atacar primero.

---

## 🎯 Sprint actual — Notion 9 jun

### Quick wins

- [ ] **#11 — Confirmar password en signup**. Pedir confirmación y validar coincidencia.
- [ ] **#14 — Logo clickeable** para volver al menú desde cualquier pantalla.
- [ ] **#26 — Sacar Create Account del lado cliente**. El cliente solo entra por invitación.
- [ ] **#8 — Sacar pipeline violeta del dashboard**. No aporta valor.
- [ ] **#10 — Nombre del cliente en notificaciones de JD**. Al comentar una JD, incluir el cliente para identificar la búsqueda.
- [ ] **#24 — Assigned Firms muestra mail equivocado** (client portal). Tienen que aparecer los mails de la agencia colaboradora, no el del cliente. Bonus: al compartir candidatos, indicar de qué agencia provienen.
- [ ] **#25 — No mostrar verify-banner si ya validó por invitación**. Solo el alta manual debe pedir verificación; los invitados no deben ver el cartel.
- [ ] **#6 — Scroll en pantalla Pop-out**. No deja scrollear.
- [ ] **#22 — No notificar fill/placement al cliente** (ni mail ni notification). Evita confusión si la agencia se equivoca.

### Alcance medio

- [ ] **#4 — Botón confirmar al sumar member a búsqueda**.
- [ ] **#5 — Submission cuenta al mandar al cliente, no al subir al portal** (Recruiter Performance).
- [ ] **#12 — Resaltar @menciones seleccionadas** estilo Outlook (color al hacer click).
- [ ] **#13 — Auditoría visibilidad de candidatos por org**: todos los candidatos visibles para todos los miembros de la org, scoped a la org.
- [ ] **#19 — My Team accesible para users no-admin**. Tab dentro del portal de la agencia visible en el menú; user (no admin) puede invitar gente de su equipo.
- [ ] **#20 — Engagements: cliente y contacto correctos** al aceptar. Quitar texto del creador debajo del título del job en portal cliente.
- [ ] **#21 — Robar members solo con acceso a la búsqueda**. En el chat con cliente, limitar el picker a members que tienen acceso a esa búsqueda (no a toda la agencia).
- [ ] **#28 — Notificar al cliente cuando agencia acepta**. Notificación ATS + mail al cliente que invitó.

### Grandes (sesión completa cada uno)

- [ ] **#7 — Revisar copys de todos los mails transaccionales**. Auditoría + reescritura.
- [ ] **#18 — Rehacer UX del invite a Recruiter**. Repensar y simplificar el flujo (solo UX/UI).

### En staging — verificá y pasa a `[x]`

- [x] **#1 — Link de verificación inválido al actualizar**. Token row idempotente; `/verify-email` agregado a proxy publicPaths. Confirmado funcionando 2026-06-09. Commits `17fc2af` + `dae38ba`.
- [~] **#2 — Selección de documentos por envío**. Pivot `SubmissionDocument`, picker en share dialog, editable post-envío. El cliente ve solo lo seleccionado. PR #305.
- [~] **#9 — Contabilizar solo cambio de stage + tooltip KPI**. Dashboard cuenta transitions, no calendar events. Tooltips grises explicando cada métrica. Commit `df5db65`.
- [~] **#15 — Popup invite agencia + signup→Agency**. Modal nuevo + mail con link de registro que rutea a `/register?type=agency` (no a Client). Commits `319dca6` + `c7cf391`.
- [~] **#16 — Candidato submiteado no aparece (multi-firm)**. 9 endpoints del client portal fixeados: filtran por `jobId IN visibleAgencyJobIds` (vía `accessibleAgencyJobIds`) en vez de `clientId`. PR #308.
- [~] **#17 — Barras proporcionales en charts**. Max compartido entre series + NaN guard. PR #304.
- [~] **#23 — Sugerir contactos del cliente al compartir búsqueda**. Autocomplete de mail con contactos cargados. PR #299.
- [~] **#27 — Invite Team Member first-week banner**. Banner en dashboard la primera semana. `2d24a36` / #297. **Verificar si está bien visible o falta destacar más.**
- [~] **#29 — Sentry: captación de errores end-to-end**. `@sentry/nextjs` integrado en server (Node + Edge) + client + `onRequestError` de Next 16 (Server Components / Route Handlers / Server Actions / Proxy). `app/global-error.tsx` para crashes del root layout. `next.config.ts` con `withSentryConfig`; source maps gated en `SENTRY_AUTH_TOKEN`. Sin DSN todo es no-op. Commit `eafa844`. **Pendiente vos**: crear cuenta en sentry.io → New Project Next.js → setear `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` en Vercel staging + production. Romper algo en staging y confirmar que el evento llega.

---

## ⚠️ Decisiones pendientes (charlar con Ari)

- [ ] Qué métricas mostrar primero en reporting
- [ ] Definición completa de qué campos cambian entre Staff Aug y Recruiting
- [ ] **¿Cobrar a las hiring companies también?** → si sí, habilitar Billing tab en client portal
- [ ] Referral scheme: qué incentivo damos (crédito sub / cash / otro)
- [ ] **Set final de JobStatus**: hoy DB tiene 5 (`OPEN`, `ACTIVE`, `ON_HOLD`, `FILLED`, `CLOSED`) pero en la práctica se usan 2. Decidir entre mergear OPEN+ACTIVE, agregar DRAFT/CANCELLED/LOST, y si hacer transiciones automáticas (Placement → FILLED, etc).

---

## ⏳ Diferido (post-MVP)

### Pre-launch (final stretch)

- [ ] **Landing**: free trial cliente end-to-end + sacar testimonios inventados (Sarah Mitchell, Jessica Torres, David Chen) + sacar métricas en cero + reemplazar naranja de validación por paleta ATS + destacar sección "Math".
- [ ] **Billing**: Stripe checkout end-to-end ($15 Solo / $19 Team) + customer portal + webhooks + dunning.

### P1 / P2

- [ ] Currency con API real-time server-side + cachear en DB (hoy `/placements` usa open.er-api.com client-side con localStorage cache).
- [ ] Salario Bruto/Neto en Argentina (~17% aporte) cuando cliente AR (detectar por currency ARS o flag).
- [ ] Email verification gate más profundo (hoy auto-login sin verificar)
- [ ] Phone prefix por geo-IP (AR → +54, US → +1)
- [ ] Google OAuth en client portal (hoy solo invite)
- [ ] Apollo: trackear logins + onboarding events → push a sequences
- [ ] UI de mapeo de columnas al importar (hoy solo hint text)
- [ ] Sacar refs a Bullhorn + LinkedIn Import del flow de import
- [ ] Banner primera semana promoviendo "Migrar desde otro ATS" → CTA al import
- [ ] Reporting serio: revenue esperado, placements timeline, cashflow, comisiones, performance
- [ ] Chrome extension para LinkedIn (1-click add candidate)
- [ ] Import desde LinkedIn, Indeed, otros portales
- [ ] Gmail / Outlook sync real
- [ ] Copilot alerts: "Búsqueda X sin candidatos hace Y días"
- [ ] Shareable public link a shortlist (cliente read-only sin cuenta)
- [ ] Per-JO member access (hoy el team es global)
- [ ] Deshacer / cancelar invites (hoy quedan en historial para siempre)
- [ ] Upload PDFs/archivos a Events (Interviews ya soportan; falta `Document.calendarEventId` + UI)
- [ ] Parser mejorado para JDs formato "Close Up" (pendiente: ejemplo para tunear)
- [ ] Tirarle 50 CVs al parser y medir accuracy; si <85% cambiar modelo
- [ ] Calendly-like: candidato elige slot del calendar del recruiter
- [ ] Loom onboarding autoplay
- [ ] Microsoft Teams integration (ON HOLD esperando tenant Microsoft propio)

### Housekeeping

- [ ] `sitemap.xml` + `robots.txt`
- [ ] Meta descriptions decentes
- [ ] PostHog o Plausible para analytics
- [ ] Tests automáticos mínimos (smoke)
- [ ] Issue/PR templates GitHub
- [ ] Decidir `app.recruitingats.com` subdominio vs `/app/*`

---

## ✅ Done — confirmado por usuario (histórico)

**Auth / Onboarding / Email**
- Login con Google (agencia) + Microsoft eliminado + login unificado con portal selector
- Copy "You already pay a fee" (cliente) + sacar "Free forever" (trial 5 días con CC)
- Industry + company size obligatorios en signup + nombre empresa en header
- Welcome email automático al registrarse
- Stages estándar (no personalizados) + decisión + migración
- Email verification idempotente + `/verify-email` público (agency + client portal) — `17fc2af` + `dae38ba` — confirmado 2026-06-09

**Clients / Contacts / JD**
- Quitar Main contact del create + "Set as main" en lista + Main contact en `/contacts`
- Sacar Deals + Attachments al crear cliente + Edit inline solo con pencil
- Recruiting/Staff Aug dropdown + Fee type lockea $/% + Currency 50+ monedas
- JD + Additional Documents persistidos (PR #11) + "Auto-filled document" hint oculto hasta subir
- Eliminar tab "Client Portal Users"

**Pipeline / Share workflow**
- Rename "Contacted" → "Internal Review"
- Modal confirmación al compartir con "Share with Client"
- Chat dual per-submission (Internal + Shared with Client)

**Import**
- CSV + Excel `.xlsx/.xls` + TSV soportados

**Client portal**
- "Back to home" + sacar "Assigned Recruiter" + Rename "Candidates in Assigned Firms" → "Rejected"
- List view de candidatos + Chat dual (CLIENT_INTERNAL + CLIENT_VISIBLE)
- File download fix (PR #26) + "Mora" matchea "Morabits" (PR #26)
- Sacar calendar del client portal (nunca tuvo route)

**Otros**
- Notifications history panel (campana + popover + Mark all read)
- Ratings eliminados de toda la app (column tabla, candidate detail, calendar interview, read-only pipeline)
- Duplicate from cancelled job (`/jobs/new?fromJobId=<uuid>` + botón Duplicate)
- Currency format unificado (suprime `.00` en enteros)

---

## Cómo trabajamos esta hoja

1. Cada item que cae se mueve a `[~]` (implementado, falta tu verificación) o `[x]` (confirmado).
2. Cuando vos testeás y confirmás, pasa de `[~]` a `[x]`.
3. Items nuevos van al bloque "Sprint actual". Si requiere decisión de producto, va a "Decisiones pendientes".
4. Landing y marketing quedan al final hasta que vos digas lo contrario.
