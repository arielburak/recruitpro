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

**Última actualización**: 2026-06-17

---

## 🚨 Crítico

- [x] **#3 — Cambio de estado sin acceso al job** (BUG seguridad). `canAccessJob` extraído a `lib/job-access.ts` y aplicado en `PATCH` + `DELETE` de `/api/submissions/[id]` (cubre stage change Y share-with-client). 404, no 403, para no leakear existencia. Defensa en UI: `/candidates/[id]` esconde stage select + share + remove cuando no estás asignado al job; muestra un badge readonly con el stage actual + "view only". Commit `7277df0`.

---

## 🎯 Sprint actual — Notion 9 jun

### Quick wins — todos cayeron en staging 2026-06-10, verificá

- [x] **#11 — Confirmar password en signup**. Ya estaba en `/register`, los 2 reset-password y `/set-password`. Faltaba `/invite/[token]` (aceptar invitación teammate) — agregado input + validación. Commit `5d4f5e7`.
- [x] **#14 — Logo clickeable**. Ya estaba hecho en agency sidebar y client portal layout — el logo está envuelto en `<Link href="{/dashboard|/client-portal/dashboard}">`. Audit confirmó.
- [x] **#26 — Sacar Create Account del lado cliente**. `/register` ahora muestra SOLO el form de Agency. Removido el step "select" y el step "client-info". `/login` ya mandaba al cliente al portal sin signup. Commit `5f4f135`.
- [x] **#8 — Sacar pipeline violeta del dashboard**. Removido `<PipelineDistribution>` (BarChart violeta de stages). Activity Trend ocupa fila completa. Commit `5f4f135`.
- [x] **#10 — Nombre del cliente en notificaciones de JD**. `notifyOnNewJobComment` email ahora usa `jobLabel = "<title> @ <client>"`. `notifyOnNewComment` también suma el cliente al jobTitle del mail de candidate mention. Commit `32c1f3f`.
- [x] **#24 — Assigned Firms mail equivocado + firms aceptados visibles**. Bug principal del email del cliente apareciendo como recruiter ya estaba cerrado por el sweep aburak (3 capas: block al invitar + filtro defensivo + cleanup). Hoy: el filtro defensivo se relajó para que los engagements legacy/post-cleanup (con `invitedUser` null) aparezcan como "No specific recruiter on record · firm-level" en vez de desaparecer la firma entera. Commit `0755eb7`.
- [x] **#25 — No mostrar verify-banner si ya validó por invitación**. `/api/auth/register` ahora hace lookup de `PendingFirmInvite` antes de crear el user, y stampea `emailVerifiedAt = now()` si la había. Los demás paths invitados (`/invite/[token]`, `/client-portal/set-password`) ya lo tenían. Commit `a713cb0`.
- [x] **#6 — Scroll en pantalla Pop-out**. Un fix en `components/ui/dialog.tsx` agrega `max-h-[90dvh] overflow-y-auto` al DialogContent base. Beneficia automáticamente a TODOS los dialogs (placement, share docs, interview, etc.). Botón X close sigue accesible. Commit `b415833`.
- [x] **#22 — No notificar fill/placement al cliente**. Funcionalmente ya estaba (el helper de status notifs solo notifica ON_HOLD). Hoy: cleanup del call desde `/api/placements` que era no-op pero confuso. Commit `a713cb0`.

### Alcance medio — cayó todo en staging 2026-06-10, verificá

- [x] **#4 — Confirmar al sumar member a búsqueda**. Dialog Assign Team Members ahora es multi-select. Click en row toggle chip indigo; barra abajo "Add N members" + Clear cuando hay al menos uno. Reset al close. Commit `4569050`.
- [x] **#5 — Submission cuenta al mandar al cliente** (Recruiter Performance). La métrica pasa de contar `submission.createdAt` a contar `Activity.action="submission.shared"`. Dashboard + drilldown actualizados. Legacy rows con fallback regex. Commit `4569050`.
- [x] **#12 — @menciones resaltadas al click** estilo Outlook. Nuevo subcomponente MentionChip con local state — click toggle entre look default y activated (ring + bg). Aplicado en chat-notes y client-portal/candidate-chat. Commit `4569050`.
- [x] **#13 — Auditoría visibilidad candidatos por org**. Audit encontró que `/api/candidates` GET ocultaba candidatos a USER no-admin por default (la UI lo paliaba con `mine=false` pero el endpoint mentía). Removido el branch — ahora todos ven todos. Commit `4569050`.
- [x] **#19 — /settings/team accesible para users no-admin**. La tab Team pasa de admin-only a accesible a cualquier user del org. Lectura libre (lista + roles + status), escritura (invite, promote/demote, remove) sigue admin-only. GET endpoints abiertos, mutations gateados. Commit `4569050`.
- [x] **#20 — Engagements: quitar texto del creador**. En `/engagements/page.tsx` (lado agency), el card de pending invite mostraba "Contact: X (email)" debajo del título del job — ruido redundante. Removido. Commit `4569050`.
- [x] **#21 — Mention picker scoped a job assignees**. Fix de un edge case: cuando un job no tenía assignees, el filter del picker fallaba abierto y mostraba TODOS los recruiters del org. Ahora siempre se aplica el scope, incluso con lista vacía (fail-closed). Cierra el leak. Commit `4569050`.
- [x] **#28 — Notificar al cliente cuando agencia acepta**. Ya estaba implementado — `/api/engagements/[id]/route.ts` acción "accept" crea ClientNotification + manda mail vía sendEngagementAcceptedEmail al inviter. Audit-confirmado 2026-06-10.

### Grandes (sesión completa cada uno)

- [x] **#7 — Revisar copys de todos los mails transaccionales**. Auditoría + reescritura estructural de las 18 sendX helpers en `lib/email.ts`. Shell unificada `wrapTemplate`, sender único `Recruiting ATS <noreply@…>` con `replyTo` cuando aplica (interview invites, mentions, candidate shared) para que el reply caiga al humano y no a noreply. Copy tightening pasada en todos los templates. Commit `1361690`.
- [x] **#18 — Rehacer UX del invite a Recruiter**. Repensar y simplificar el flujo. Pasó por 3 iteraciones: (a) dropdown separado de firms → chips horizontales filtrando in-place; (b) input single-select → multi-select tipo Outlook con chips de recipients arriba + Enter/coma/Backspace; (c) copy neutral "Send invitations" (antes "Invite recruiters"). Cada suggestion ahora tiene checkbox visible. Lista con max-h scroll. Send hace N POSTs en paralelo. Commits `aa8b33f` + `c330068` + `bc3fa7e`.

### Sprint 14-17 jun (post-10-jun sweep)

- [x] **Rename "Active Recruiters" → "Recruiting Firms"** en el dashboard del client portal. La métrica medía firmas únicas, no personas, y el label confundía. Commit `4a254b4`.
- [x] **Client portal candidates list: multi-search rows alineados**. Cuando un candidato esta en 2+ jobs, los sub-rows ahora siguen las columnas del header (job + status + activity) en vez de un layout flat que se desalineaba en mobile. Fix de raíz, no curita visual. Commits `6fc1366` + `20948ac`.
- [x] **Assigned Firms: stats + cards + empty-state usan el mismo filter**. Antes una firma con invitedUser inactivo podía contar para "2 Active" pero no renderizar la card. Single source aplicado al inicio del card. Commit `ce4f891`. Después extendido para filtrar soft-released — `99b8123`.
- [x] **QA P1 — `isInvitedUserVisible` single source en server + client**. El dropdown del Invite Recruiter mostraba recruiters soft-released aunque la card de Assigned Firms los ocultaba. Extraído a `lib/firm-engagement-visibility.ts` y reusado en (a) Assigned Firms component, (b) `/api/client-portal/invite-suggestions`, (c) chat tabs "Shared with X". Single source of truth. Commits `be9aa5a` + `71d422d`.
- [x] **QA P2/P3/P4 — chat tab consistency, USER readonly status, no-op activity, screen-reader title**. (a) Chat tabs ya no muestran firms con invitedUser oculto; (b) status select en /jobs list es Badge readonly para USER (antes alertaba 403); (c) activity log skip si stage nuevo === stage actual (no más "Submitted → Submitted"); (d) DeleteConfirmDialog fallback "Confirm deletion" cuando itemLabel vacío (antes leía "Delete ?" en a11y tree). Commit `71d422d`.

### En staging — verificá y pasa a `[x]`

- [x] **#1 — Link de verificación inválido al actualizar**. Token row idempotente; `/verify-email` agregado a proxy publicPaths. Confirmado funcionando 2026-06-09. Commits `17fc2af` + `dae38ba`.
- [x] **#2 — Selección de documentos por envío**. Cuando compartís un candidato con el cliente, ahora aparece una lista con checkboxes para elegir QUÉ documentos mandarle (antes iban todos). Lo podés cambiar después sin re-compartir. El cliente solo ve lo que tildaste. PR #305. Audit-confirmado 2026-06-09.
- [x] **#9 — Contabilizar solo cambio de stage + tooltip KPI**. Dashboard cuenta transitions, no calendar events. Tooltips grises explicando cada métrica. Commit `df5db65`.
- [x] **#15 — Popup invite agencia + signup→Agency**. Dos cosas: (a) el popup "Invite a Recruiter" del client portal ahora es un modal flotante grande, antes era una tarjetita apretada bajo "Assigned Firms"; (b) cuando le llega el mail al recruiter invitado, el link lo manda directo al form de Agency con el email ya cargado y un banner "You've been invited as a recruiter" — antes caía al selector "Agency vs Client" y muchos elegían Client por error. Commits `319dca6` + `c7cf391`. Audit-confirmado 2026-06-09.
- [x] **#16 — Candidato submiteado no aparece (multi-firm)**. Bug fix: si el cliente tenía 2+ agencias laburando la misma búsqueda, los candidatos que mandaba la Firma A no le aparecían al cliente. Ahora ve los candidatos de todas las firmas que tienen acceso a esa búsqueda. PR #308. Audit-confirmado 2026-06-09 (8 endpoints del client portal usan el helper correcto, ninguno filtra mal).
- [x] **#17 — Barras proporcionales en charts**. Los gráficos de barras del dashboard ahora se dibujan a escala compartida — todas las barras se miden contra el mismo máximo, así se pueden comparar de un vistazo (antes cada serie tenía su propia escala y dos barras "llenas" no querían decir lo mismo). PR #304. Audit-confirmado 2026-06-09.
- [x] **#23 — Sugerir contactos del cliente al compartir búsqueda**. Autocomplete de mail con contactos cargados. PR #299.
- [x] **#27 — Invite Team Member first-week banner**. Banner en dashboard la primera semana. `2d24a36` / #297. **Verificar si está bien visible o falta destacar más.**
- [x] **#29 — Sentry: captación de errores end-to-end**. Confirmado funcionando 2026-06-17. Stack trace de prueba capturado con `SentryAsyncLocalStorageContextManager` visible en el trace — instrumenta todo el código. DSN + AUTH_TOKEN + ORG + PROJECT cargados en Production + Preview de Vercel. `@sentry/nextjs` integrado en server (Node + Edge) + client + `onRequestError` de Next 16 (Server Components / Route Handlers / Server Actions / Proxy). `app/global-error.tsx` para crashes del root layout. `next.config.ts` con `withSentryConfig`; source maps gated en `SENTRY_AUTH_TOKEN`. Sin DSN todo es no-op. Commit `eafa844`. **Pendiente vos**: crear cuenta en sentry.io → New Project Next.js → setear `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` en Vercel staging + production. Romper algo en staging y confirmar que el evento llega.

### En staging — bloque grande del 2026-06-10

- [x] **Admin-only delete + DeleteConfirmDialog universal**. 17 endpoints DELETE gateados con `requireAdminResponse(role)` (devuelve 403 con copy claro). Componente `<DeleteConfirmDialog>` reusable en `components/ui/` (con consequence list + optional toggle + custom title/description). 14+ call sites del UI wireados; botones escondidos para USER. Toda la copy en inglés. Bonus: el delete de candidate acepta `?keepMetrics=true` para preservar Activity rows del dashboard. Commits varios — el final es `b6211ee`.
- [x] **Activity cascade migration**. Schema cambió de SetNull a Cascade en `Activity.candidateId`. Pusheado a staging DB. Borrar un candidato ahora se lleva sus eventos de historial — métricas viejas del dashboard se limpian solas. Commit `c582d70`.
- [x] **#3 Crítico — Gate canAccessJob en submissions PATCH/DELETE + UI defense**. Helper extraído a `lib/job-access.ts`, gateado el endpoint, UI esconde controles cuando no tenés acceso. Defensa en profundidad. Commit `7277df0`.
- [x] **Owner del candidato también puede mover/share submissions**. Extensión del gate anterior con un OR: `isAssigned(job) OR isOwner(candidate)`. Server + UI espejados. Commit `1a946a4`.
- [x] **Stop-sharing confirm dialog + chip Shared visual nuevo**. Click en el chip "Shared" del row de un job ahora abre confirm modal en vez de un-share directo. Visual del chip cleanup: separador sutil + "Client sees: X" + icono X en hover. Commit `5c34e3d`.
- [x] **Bug aburak (ClientUser apareciendo como recruiter)**. Tres capas: bloqueo al invitar self-team email + filtro defensivo en `/api/client-portal/invite-suggestions` + cleanup de las 2 filas sucias en DB. Commit `eba0a18`.
- [x] **Engagement accept: sembrar Contact + OrganizationClient pivot**. Cuando una agency acepta una invitación: (a) crea el Client en su book (ya estaba), (b) NUEVO: upsert el pivot OrganizationClient para que aparezca en `/clients`, (c) NUEVO: seedea un Contact con datos del ClientUser que invitó (postedBy). Idempotente. Backfill aplicado a los 3 orgs que les faltaba el pivot. Commit `1197f89`.
- [x] **Portal status match por (name + email)**. En el detail del cliente y en `/contacts`, el badge "In portal" / "Invite" se calculaba mal porque comparaba IDs entre Contact y ClientUser que viven en namespaces distintos. Ahora matchea por nombre+email. Nick aparece como "In portal" cuando es quien invitó. Commit `d4b0088`.
- [x] **Modal state retention universal fix**. 5 dialogs del ATS tenían state retention al cerrar (Invite Recruiter, Add Member, Invite Client, Assign Team, Share Candidate, dashboard Invite Teammate). useEffect que resetea state al `!open`. Commit `31b2f32`.

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
- [ ] **Hardening del contador de Interviews (#9)**. Edge case: si borrás un candidato del sistema (no archivar, borrar), las métricas de Interviews del dashboard pueden contar de menos en períodos viejos porque la dedup queda ambigua. Riesgo bajo en práctica pero conviene documentarlo o agregar `metadata.submissionId` siempre.

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
- Selección de docs al compartir candidato (cliente solo ve los tildados) — #305 — 2026-06-09
- Invite a recruiter como Dialog modal + mail rutea directo al form Agency — `319dca6` + `c7cf391` — 2026-06-09
- Multi-firm: candidatos de cualquier firma visibles al cliente — #308 — 2026-06-09
- Charts con barras a escala compartida — #304 — 2026-06-09

---

## Cómo trabajamos esta hoja

1. Cada item que cae se mueve a `[~]` (implementado, falta tu verificación) o `[x]` (confirmado).
2. Cuando vos testeás y confirmás, pasa de `[~]` a `[x]`.
3. Items nuevos van al bloque "Sprint actual". Si requiere decisión de producto, va a "Decisiones pendientes".
4. Landing y marketing quedan al final hasta que vos digas lo contrario.

---

## 📋 Inventario de cierre — 2026-06-17

**Sprint Notion (9 jun) — CERRADO**. Auditoría 2026-06-17 con paths/líneas confirmó las 26 items implementadas en código:

- Crítico: #3 ✅
- Quick wins (9): #6, #8, #10, #11, #14, #22, #24, #25, #26 ✅
- Alcance medio (8): #4, #5, #12, #13, #19, #20, #21, #28 ✅
- Grandes (2): #7, #18 ✅
- En staging confirmados: #1, #2, #9, #15, #16, #17, #23, #27 ✅
- #29 Sentry → `[~]` hasta cargar DSN en Vercel (única acción tuya pendiente)

**Bloque post-10-jun sweep** — todo `[x]`. Trajo además QA P1/P2/P3/P4, multi-select Invite, copy neutral, My Team sidebar, Resend abierto a USER, first-week banners por user.createdAt, growth loop completo (notif inviter + banner X joined + CTA persistente + chip Team N), gate canAccessJob en submission CREATE (security gap).

**Lo que queda pendiente — NO del sprint Notion**

### Decisiones con Ari (charlar)
- Métricas a mostrar primero en reporting
- Campos Staff Aug vs Recruiting
- ¿Cobrar a hiring companies?
- Referral scheme
- Set final de JobStatus

### Pre-launch
- Landing (copy + paleta + sacar testimonios inventados)
- Billing (Stripe checkout end-to-end)

### Acción tuya
- #29 Sentry → cargar DSN + env vars en Vercel + smoke test
