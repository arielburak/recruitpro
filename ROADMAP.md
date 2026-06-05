# RecruitingATS — Roadmap

> **Foco MVP**: optimizar el flujo de la **firma de reclutamiento** (el que paga). Client portal: tiene que funcionar bien y verse lindo, pero secundario. Landing y marketing al final.

## 🧭 Principios transversales del ATS

Aplicarse a cualquier feature nueva o existente:

1. **Auto-fill obsesivo**. Si el dato ya vive en otra parte del ATS (cliente, búsqueda, candidato, descripción), no se lo pidas al usuario. Pre-rellenalo y dejalo editable.
2. **Diferenciar Recruiting vs Staff Aug**. Recruiting cliente = terms a nivel cliente (fee, payment terms, garantía, currency). Staff Aug cliente = terms a nivel JOB (cada búsqueda negocia los suyos; client.default* quedan null). La cadena de fallback siempre es `job → client → default`.
3. **Default geográfico**: target principal son recruiters de US, default everywhere es USD; permitir override.
4. **Visualmente prolijo, ágil, óptimo para el usuario**. Menos clicks, menos campos en blanco, menos pantallas que rebotar.

**Convenciones**
- `- [x]` hecho + confirmado funcionando por el usuario
- `- [~]` implementado en staging, **pendiente que vos verifiques**
- `- [ ]` pendiente / parcial / falta
- Si dice "(parcial)" arriba del bullet, está empezado pero le falta algo concreto
- Acceso rápido: `/roadmap` desde Claude Code

**Última actualización**: 2026-06-04

---

## 🎯 Round 3 — Limpieza Notion + Final stretch (sesión 4 jun)

Items rescatados del board de Notion ("No hace falta ya" + "Final final") con triage propio: lo que ya cayó esta sesión queda `[~]`, lo que falta agarrar va `[ ]`.

- [~] **Barra de nav rota al entrar a Engagements** (client portal) — la regex que detectaba magic-link tokens en `app/client-portal/layout.tsx` no listaba `engagements`, así que se ocultaba la barra. Fix en PR #277.
- [~] **Notificación al recruiter al claim invitación vía signup** — `processPendingInvites` ahora emite la `UserNotification "engagement_invited"` igual que el path de usuarios ya registrados; antes el bell quedaba vacío y había que adivinar que vivía en `/engagements`. PR #275.
- [~] **Chat: mail solo en @-mention** — `notifyOnNewJobComment` y `notifyOnNewCandidateComment` mandaban `sendMentionEmail` a todos los assignees/owner aunque no estuvieran arrobados. Ahora el mail sale solo con mention real; el bell sigue avisando al resto. PR #276.
- [~] **Owner por default 'selected' en un placement** — ya implementado en `components/placements/placement-dialog.tsx:595-639`: tanto el path "congrats desde board" como "manual desde /placements" pre-pickean `recruiterId` desde `selectedCandidate.ownerId`. `recruiterTouchedRef` evita pisar la elección manual. (Auditoría 5 jun)
- [~] **Reemplazar "Engagements" por "Recruiting Firms"** — rename de strings user-visible en el client portal: nav label, `<h1>` y empty state de `/client-portal/engagements`, breadcrumb "Back to..." en `[firmId]`, copy del dashboard ("firm status"). DB model `FirmEngagement` y variables internas no cambian. PR (esta sesión).
- [~] **Unificar diseño del chat en ambos portales** — el client portal seguía con flat-list (avatar izquierda + texto plano) mientras agency usaba bubbles. Ahora `components/client-portal/candidate-chat.tsx` es mirror exacto de `chat-notes.tsx`: bubbles + sides por equipo + colores consistentes (agencia=indigo, cliente=emerald) + `renderMentions` neutral (`font-semibold underline`) + `showHeader` collapsa mensajes consecutivos. Side flipea según perspectiva (mi equipo siempre a la derecha). PRs #285, #286, #287.
- [x] **Cancelar un job → crear otro hereda info del cancelado** — `/jobs/new` ahora acepta `?fromJobId=<uuid>`: hace fetch al source y pre-llena title, description, location, workMode, currency, salary, feeType, feeAmount, clientId. Si hay `fromJobId`, omite la restauración del draft local (sino sobreescribiría los datos del source). En `/jobs/[id]`, cuando el status es CANCELLED o CLOSED, aparece un botón "Duplicate" arriba a la derecha que linkea al form con el query param. Banner indigo en el form: "Cloning from <title> (<status>)" con X para limpiar. PR #283.
- [~] **Colapsar contactos de una empresa con un click** — implementado en `/contacts` (página global agrupada por empresa, no en el detalle del cliente que ya es una tab dedicada): header de cada Card es ahora clickeable y togglea expand/collapse con chevron + role=button + soporte teclado. State en memoria (no localStorage) para no esconder grupos tras cambiar filtros. PR (esta sesión).
- [~] **Sacar el texto debajo del logo en Organization settings** — ya hecho: `app/(dashboard)/settings/organization/page.tsx:25-50` muestra solo el logo + label, sin subtítulo redundante. (Auditoría 5 jun)
- [~] **Industry visible aunque el cliente no tenga portal users** — ya hecho: `app/(dashboard)/clients/[id]/page.tsx:330-340` renderiza Industry siempre, sin condición sobre portal users. (Auditoría 5 jun)
- [~] **Orden Start/End date + MRR de pérdida en placement** — en `placement-dialog.tsx` el modo edit OS ahora muestra Starting date ANTES que el bloque "Has end date" (timeline left-to-right). Cuando se marca el end date y hay monthly fee, inline amber: "Losing $X/mo of recurring revenue once this ends." HH edit conserva el orden Starting → Payment due original. PR (esta sesión).

### Final final (pre-launch)

- [ ] **Landing: free trial del cliente + revisar textos/backs** — ver `🟤 Landing` para el detalle. Foco: el CTA de free trial del cliente debe funcionar end-to-end y los textos no pueden mentir (testimonios inventados, métricas en cero, copy de "Free forever" residual).
- [ ] **Billing** — Stripe checkout end-to-end ($15 Solo / $19 Team) + customer portal + webhooks + dunning. Listado en `🔭 Futuro` — se promueve a final stretch pre-launch.

---

## 🎯 Round 2 — Engagements + Calendar + Placements (sesión 22→29 may)

- [~] **Multi-user + My Team** (client portal): tab dedicada con avatars, kebab actions (promote / demote / remove) gated a ADMIN. Roles de ClientUser via `/api/profile` (la sesión no expone role).
- [~] **Engagements page espejo** (agency + client portal): aggregate strip + Pending / Active / Declined sections + drill-down a `/engagements/[clientId]` / `/client-portal/engagements/[firmId]`. `/api/client-portal/firms-engaged` ahora devuelve pending + declined.
- [~] **Métricas engagement-level**: `Submitted` (lo que llegó al cliente) / `Offers` (submissions en stage "Offered") / `Placements`. Drop del "Sourced/Shared" duplicado y del "Interviews" (lo cubre el kanban del job).
- [~] **Stage "Under Review" eliminado** del catálogo canónico. Alias `Under Review → Submitted` en `LEGACY_STAGE_ALIASES`. La migración rutea submissions huérfanas a su canonical aliased en vez de a firstStageId.
- [~] **Placements HH (one-time) vs OS (recurring MRR)**: `Placement.kind` + `monthlyFee` + `endDate`. KPI strip separado en dos cards (Headhunting / Staff Aug) con: Revenue (HH) + Placements (HH) | Active MRR + Engagements + Projected (OS). Tabla split: HH filtrada por Year/Q, OS full active book. Form pre-pickea kind desde `Client.engagementType`.
- [~] **Active MRR alineada con la tabla**: cuenta cualquier OS no terminada (incluso si startDate es futuro = "committed MRR"). Antes excluía signed contracts pre-start.
- [~] **Projected forward-looking** en lugar de Accrued: para engagements sin endDate proyecta hasta periodEnd ("¿cuánto vale Karen para 2026?" en vez de "¿cuánto facturó hasta hoy?").
- [~] **Currency format unificado**: `formatCurrency` + `formatCurrencyValue` ahora suprimen `.00` en montos enteros (`$6,300,000` no `$6,300,000.00`); mantienen decimales reales cuando los hay. Un criterio para todo el ATS.
- [~] **Payment Due column** en HH Placements con tratamiento amber/red (soon/overdue), suprimido si la invoice ya está PAID.
- [~] **Calendar generic events tipo Outlook**: nuevo `CalendarEvent` model (Event / Follow-up / Reminder), per-user scope, no envía emails. Opcionalmente attaché a Client/Candidate/Job (luego sacado del UI por simplicidad; legacy events mantienen el link).
- [~] **Recurrencia con "every N units"**: `recurrenceInterval` agregado al schema. Modal expone Every [N] [unit] con dropdown unidad + Until opcional. Expansión client-side respeta el step (every 2 weeks, every 3 days, etc).
- [~] **Calendar Event modal Outlook-style**: title bare input, fila única date+start–end con auto-end-anchor de duración, Repeat colapsado, Location/Link icon-prefixed. Sacado el "Related to" picker, sacado el kind "Meeting" (lo cubre Interview).
- [~] **Calendar Interview modal Outlook-style**: misma simplificación. 5 campos visibles (title, candidate search + submission picker, date+time, type pill + link/location contextual, notes) + 4 detrás de "Show more" (platform, timezone, interviewers, client contacts, notify toggle). Defaults inteligentes para que se pueda guardar sin tocar nada más que candidato + fecha.
- [~] **Chooser "Event or Interview?"** en doble-click sobre un día — surface explícito de la elección. Header buttons siguen yendo directo.
- [~] **Card overflow-hidden fix** global: dropdowns / popovers dentro de Cards ya no se cortan.
- [~] **Read-only pipeline más grande** en client portal (260px → 320px columnas, padding más generoso, sin rating chip residual).
- [~] **Back button del job usa history**: si venís desde Engagements, te devuelve ahí; fallback a `/jobs` si no hay history.
- [~] **Job page full-width pipeline**: la kanban va arriba a ancho completo; supporting cards (Your Team / Job access / Assigned Firms) abajo en strip de 3 columnas.
- [~] **Manage Access panel envía emails** a newly-added members (diff previousIds vs finalIds + ClientNotification + sendClientJobAccessGrantedEmail). Skip al inviter mismo.
- [~] **Mention picker scoped a job members**: search filtra por `clientJobId`, STRICT (creator + miembros explícitos, sin ADMIN bypass).
- [x] **Ratings eliminados** de toda la app (column tabla, candidate detail, calendar interview, read-only pipeline chips). Schema queda pero UI no lo expone.

## 🎯 Round 1 — Items 22/4 (los últimos del video)

- [~] Parser **no pisa Job Title** al parsear JD — extracción de title removida del autofill (location + workMode siguen autocompletando)
- [~] Parser **no pisa Current Title / Current Company** al parsear CV — removidos del autofill
- [~] **"Share with Client" mueve el candidato a Submitted** automáticamente — server-side: si el stage actual es anterior a Submitted, lo avanza al sharear
- [~] Salary range con `$` como **prefijo visual** del input (en /jobs/new y /jobs/[id] edit)
- [ ] Parser mejorado para JDs formato "Close Up" — *pendiente: mandame un ejemplo para tunear*
- [x] Notifications history panel (campana con popover y "Mark all read")
- [~] **Placeholder del PhoneInput**: contar `#` del template y emitir exacto esa cantidad de dígitos. Fix universal — afecta a todos los lugares que usan PhoneInput (candidates, clients, contacts, jobs).
- [~] **Parser CV: detectar prefijo de país** — strip paréntesis del prefijo (`(+54)` → `+54`) + inferencia por location del CV (Argentina/Brasil/etc → dial code). PhoneInput defensivo acepta `(+54) ...` también si llega así desde otro lado.
- [~] **Archivos clickeables**: click en el icono o el nombre del archivo (candidatos + jobs JD + Additional Documents) abre el archivo en nueva pestaña. Botón de download sigue forzando descarga via `?download=1`. Cambio del API: `Content-Disposition: inline` por default, `attachment` con query param.
- [~] **Board drag instantáneo**: optimistic update en `persistMove`. La card se mueve visualmente al instante; la PATCH y el refetch corren en background. Si falla, rollback al estado anterior.

## 🟦 Estados de las búsquedas (JobStatus)

Hoy: DB tiene 5 (`OPEN`, `ACTIVE`, `ON_HOLD`, `FILLED`, `CLOSED`) pero en la práctica se usan 2 (todo cae en OPEN o ACTIVE).

- [ ] **Repensar el set de statuses** — definir qué estados realmente son útiles para el flujo de la firma. Candidatos a evaluar:
  - `DRAFT` (intake recibido, no se arrancó a sourcear)
  - `OPEN` / `ACTIVE` (activa, sourceando) — ¿se justifican dos o un solo "Active" alcanza?
  - `ON_HOLD` (pausada por cliente)
  - `FILLED` (placement hecho, no hay seats abiertos)
  - `CANCELLED` (cliente bajó la búsqueda)
  - `LOST` (la perdimos vs competencia) — útil para reporting
- [ ] **Agregar selector de status al create form** — hoy nacen siempre OPEN. Para clientes que firman búsquedas que arrancan ON_HOLD o DRAFT.
- [ ] **Diferencia OPEN vs ACTIVE clarificada o eliminada** — si quedan ambos, que tengan semántica distinta. Si no, mergear.
- [ ] **Transiciones automáticas**: al hacer un Placement → ¿auto-FILLED? Al ON_HOLD → ¿notificar al cliente?

Decisión de producto pendiente: cuál es el set final. *Sumar a "Decisiones pendientes" si necesitamos charlarlo con Ari.*

## 🔴 Pipeline / Stages / Share workflow (lado firma)

- [x] Rename "Contacted" → "Internal Review"
- [x] Modal de confirmación al compartir con copy "Are you sure..." y botón "Share with Client"
- [~] Share gated a "moviendo a Submitted" (no valida que el source sea Internal Review específicamente — probablemente OK)
- [~] **Cambiar stage desde la lista de Jobs**: `/jobs/page.tsx` tiene dropdown per-row con `changeStatus` handler. (Audit verificó)
- [~] **List view (Notion-style)** de candidatos además del Board — toggle `Board / List` en `/jobs/[id]`. Mismas transiciones (share dialog en Submitted, placement en Placed, interview en Interviewing). Cada row: candidato + contact + dropdown de stage + share toggle + activity counters + remove.
- [~] **Desde candidato: cambiar stage inline** por submission — `candidates/[id]/page.tsx` tiene `<select>` por cada submission con `changeSubmissionStage` handler.
- [~] **Notas a nivel candidato** (independientes del job) — `Candidate notes` surface en `candidates/[id]/page.tsx` filtra Comments con `!c.submissionId`.
- [x] **Chat dual**: resuelto a nivel **per-submission**, no per-candidato. Cada job que el candidato tiene activo expone Internal + Shared with Client (`CLIENT_VISIBLE`). Notas generales del candidato quedan internal-only por diseño (un candidato en 5 jobs con 5 clientes distintos → ambiguo a quién ven las notas client-visible).

## 🟠 Placements + Interviews + Calendar

- [~] Modal "Congratulations" al marcar Placed
- [~] Form pre-fill (salary, start date, terms, fecha cobro)
- [~] Manual placement create desde `/placements`
- [~] **Editar placement existente** desde `/placements`: rows clickeables abren `PlacementDialog mode="edit"`. Hidrata todos los campos + agrega `Actual start date` (anchor de garantía) y `Invoice status` (Draft/Sent/Paid) que no existen al crear. PUT a `/api/placements/[id]`. Cubre el flow "Skip / Complete later" del board.
- [~] **Interview stage → modal para crear evento en calendar** — `QuickInterviewDialog` salta al mover a Interviewing en el board. Form lean (type/date/time/duration/link o location/notes). Skip = stage queda movido sin evento. Save to ATS = POST a `/api/interviews` **sin mandar mail** (registro interno). Checkbox opt-in si querés que sí mande invite al candidato. Para fields avanzados (interviewers, Google Meet auto-create, client contacts) ir a /calendar.
- [~] **`/calendar` modal full**: mismo toggle "Save to ATS" vs "Save & send invite". Default = ledger interno (sin mails). Tick = mails al candidato + client contacts.
- [~] **Client Interview purpose = registro forzado** (sin mails). El toggle de email solo aparece para "Candidate Call" (donde el recruiter coordina con el candidato directamente). Para Client Interview salta un nota: "Client interviews save as an internal ATS record. No emails sent — the client coordinates the meeting on their side."
- [~] **Vista agregada de interviews por job**: tab Interviews en `/jobs/[id]` con list/calendar toggle (lines 1232-1413).
- [~] **Click en día → desglose** del día (interviews + events + first days + fechas de cobro) — implementado vía `selectedDay` sidebar.
- [ ] **Upload PDFs / archivos a Events** (Interviews ya soportan attachments via `Document.interviewId`. Falta `Document.calendarEventId` + UI.)
- [~] **Color-code interview por purpose**: candidato vs cliente vía `interviewClassNames` (clientContacts.length > 0 → amber; sin → indigo). Cancelled/completed sobreescriben.
- [~] **Placements feed al calendar**: milestones (first day / payment due / guarantee expiry) integrados en el grid + sidebar Upcoming.
- [ ] Calendly-like: candidato elige slot del calendar del recruiter — **diferido**

## 🟢 Clients / Contacts / JD documents

- [x] Quitar "Main contact" del create form del cliente
- [x] "Set as main" en lista de contactos
- [x] Main contact aparece en `/contacts`
- [x] Sacar Deals
- [x] Attachments al crear cliente
- [x] Edit inline solo con pencil icon
- [x] Dropdown Recruiting / Staff Aug al crear cliente
- [x] Fee type lockea formato $/%
- [x] Currency dropdown (50+ monedas)
- [x] JD + Additional Documents persistidos (PR #11)
- [x] "Auto-filled document" hint oculto hasta que subas algo
- [x] Eliminar tab "Client Portal Users"
- [~] **Payment terms + guarantee a nivel Cliente** — `Client.defaultPaymentTerms` y `Client.defaultGuaranteePeriod` ya viven en el schema y se pueden setear al crear/editar el cliente (solo Recruiting). Auto-fill al crear placement (congrats desde board o manual desde /placements) + en edit mode. Preview live de guarantee expiry y payment due date en el form. Bug del recompute del payment due en edit arreglado (solo respeta valor existente, si está vacío recomputa).
- [ ] **Salario Bruto / Neto en Argentina** — opción de tipo de salario (bruto vs neto, con el aporte ~ 17%) cuando el cliente es Argentino. Detectar AR por algún flag del cliente o por currency ARS. Útil para reporting más adelante.
- [~] Invitar / sacar portal users desde detail del cliente — falta verificar flow de remove

## 🟡 Import

- [x] Soportar CSV
- [x] Soportar Excel `.xlsx` / `.xls`
- [x] Soportar TSV
- [ ] **UI de mapeo de columnas** al importar — hoy solo hint text
- [ ] **Sacar LinkedIn Import** — sigue la ruta `/api/import/linkedin` + refs en candidates/new y marketing
- [ ] **Sacar refs a Bullhorn** en flow de import + FAQ marketing
- [ ] **Banner primera semana** (solo agencia) promoviendo "Migrar desde otro ATS" → CTA al import

## 🔵 Auth / Onboarding / Email

- [x] Login con Google funcionando (lado agencia)
- [x] Microsoft eliminado completo (PR #19)
- [x] Login unificado con portal selector (Agency vs Client)
- [x] Copy "You already pay a fee — no need to pay for the ATS" en lado cliente
- [x] Industry + company size obligatorios en signup
- [x] Welcome email automático al registrarse
- [x] Sacar "Free forever" (5-day trial)
- [x] Nombre de empresa en header
- [~] Stages estándar (no personalizados) — decisión + migración hecha
- [ ] **Email verification al registrarse** (hoy auto-login sin verificar)
- [ ] **Phone prefix por geo-IP** (AR → +54, US → +1)
- [ ] **Google OAuth en client portal** (hoy solo invite)
- [ ] Revisar/rehacer copy + CTA del Welcome email
- [ ] **Apollo: trackear logins + onboarding events** → push a sequences (cero rastro hoy)
- [ ] Loom onboarding autoplay — **diferido**

## 🟣 Client portal

- [x] "Back to home" desde client portal
- [x] Sacar "Assigned Recruiter"
- [x] Rename "Candidates in Assigned Firms" → "Rejected"
- [x] List view de candidatos
- [x] Chat dual interno / con agencia (`CLIENT_INTERNAL` + `CLIENT_VISIBLE`)
- [x] File download arreglado (PR #26)
- [x] "Mora" matchea "Morabits" en autocomplete de firmas (PR #26)
- [ ] **"Firms engaged" widget interactivo** — stat existe, no clickeable
- [ ] **Cliente solo VE status, no modifica** — ⏸️ ON HOLD. Auditoría inicial (#92) dijo que estaba bien (clientStage editable por cliente, stageId interno blindado server-side), pero quiero revisar la lógica de las dos stages en más detalle antes de cerrarlo. Pendiente: walkthrough del flow con el usuario.
- [ ] **Invitar member: chequear si email ya es contacto del cliente** y sugerir "agregar existente"
- [ ] **Per-JO member access** (hoy el team es global; al crear JO elegir quién accede)
- [ ] **Deshacer / cancelar invites** — hoy quedan en historial para siempre
- [ ] Share JD pidiendo **solo email** (no empresa) — enriquecer al primer login
- [x] **Sacar el calendar del client portal** — no había route ni componente; el cliente nunca tuvo calendar. Confirmado en auditoría.
- [ ] Bugs diferidos PR #26 (sin repro):
  - Candidato linkeado a búsqueda no aparece en solapa
  - Click sobre job en /candidates rompe la página

## ⚠️ Decisiones pendientes

- [x] Trial: con/sin credit card → **con CC**, 5 días
- [x] Stages: estándar (no personalizados, decisión con Ari)
- [ ] Qué métricas mostrar primero en reporting
- [ ] Definición completa de qué campos cambian entre Staff Aug y Recruiting (para el dropdown)
- [ ] **¿Cobrar a las hiring companies también?** → si sí, habilitar Billing tab en client portal
- [ ] Referral scheme: qué incentivo damos (crédito sub / cash / otro)

---

## ⏳ Diferido (al final, sin prioridad MVP)

### 🟤 Landing (queda último, no le damos bola ahora)

- [x] Sacar "Free forever"
- [x] Sacar SOC 2 del forgot-password
- [ ] Sacar testimonio Sarah Mitchell del panel de login
- [ ] Sacar testimonios inventados (Jessica Torres, David Chen) si quedan
- [ ] Sacar métricas en cero ("0 recruiting firms served") si quedan
- [ ] Reemplazar color naranja de validación de email por paleta ATS
- [ ] Mejorar copy de landing (sin mentiras)
- [ ] Destacar sección "Math"

### 🔭 Futuro (P1 / P2)

- [ ] Stripe checkout end-to-end ($15 Solo / $19 Team) + customer portal + webhooks + dunning
- [ ] Seat management + comisiones parametrizables por recruiter
- [~] **Currency con API real-time de tipo de cambio** — `/placements` Revenue card ya normaliza a USD via open.er-api.com (free, no-auth, 24h cache en localStorage). Pendiente: mover el fetch a server-side y cachear en DB para no spammear desde cada browser.
- [ ] Tirarle 50 CVs al parser y medir accuracy; si <85% cambiar modelo
- [ ] Verificar drag-and-drop pipeline persiste en DB (no solo state) + undo
- [ ] Verificar RBAC: cliente solo ve su shortlist
- [ ] **Reporting serio**: revenue esperado, placements timeline, cashflow, comisiones, performance
- [ ] **Chrome extension para LinkedIn** (1-click add candidate)
- [ ] Import desde LinkedIn, Indeed, otros portales
- [ ] Gmail / Outlook sync real
- [ ] Copilot alerts: "Búsqueda X sin candidatos hace Y días" (ambos lados)
- [ ] Shareable public link a shortlist (cliente read-only sin cuenta)
- [ ] **Microsoft Teams integration** — ⏸️ ON HOLD esperando tenant Microsoft propio

### 🧹 Housekeeping

- [ ] `sitemap.xml` + `robots.txt`
- [ ] Meta descriptions decentes
- [ ] Sentry para errores
- [ ] PostHog o Plausible para analytics
- [ ] Tests automáticos mínimos (smoke)
- [ ] Issue/PR templates GitHub
- [ ] Decidir `app.recruitingats.com` subdominio vs `/app/*`

---

## Cómo trabajamos esta hoja

1. Cada item que cae se mueve a `[~]` (implementado, falta tu verificación) o `[x]` (confirmado).
2. Cuando vos testeás y confirmás, pasa de `[~]` a `[x]`.
3. Items nuevos van al bloque que corresponda. Si requiere decisión de producto, va a "Decisiones pendientes".
4. Landing y marketing quedan al final hasta que vos digas lo contrario.
