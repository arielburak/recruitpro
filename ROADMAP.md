# RecruitingATS — Roadmap

> Hoja madre de los puntos que faltan. Se actualiza acá cuando (a) tildamos algo que hicimos o (b) sumamos un item nuevo que se nos ocurre.

**Convenciones**
- `- [ ]` pendiente · `- [x]` hecho
- Solo se tilda cuando el usuario da el OK que funciona. Sin notas extra, solo el tick.
- Prioridades: **P0** = pre-launch · **P1** = primer dólar · **P2** = retención · 🧹 = housekeeping
- Si una decisión de producto falta tomarse, vive en **Decisiones pendientes** al final
- Acceso rápido: `/roadmap` desde Claude Code

**Última actualización**: 2026-04-22

---

## 🔴 P0 — Pre-launch (antes de abrir trials públicos)

### Credibilidad de landing
- [ ] Sacar testimonios inventados (Jessica Torres, David Chen). Dejar sección vacía o "Early access"
- [ ] Sacar claim SOC 2 del forgot-password y copy
- [ ] Sacar métricas en cero ("0 recruiting firms served")
- [x] ~~Sacar "Free forever" y rebalancear pricing con trial + plan pago~~
- [ ] Reemplazar color naranja de validación de email por paleta del ATS
- [ ] Mejorar copy de landing (textos más honestos, sin mentiras)
- [ ] Destacar la sección de "Math" en la landing

### Auth & email transaccional
- [ ] **Microsoft OAuth**: configurar App Registration en Azure Entra ID y cargar `AZURE_AD_CLIENT_ID` + `AZURE_AD_CLIENT_SECRET` en `.env` + Vercel (Prod + Preview)
- [ ] Email verification en `/register` (obligatoria apenas se loguea)
- [ ] Integrar Resend o Postmark para email transaccional
- [ ] Templates de email: welcome, reset password, verification, client invite, feedback notification
- [ ] Welcome email automático al registrarse + capturar a base de marketing
- [ ] Revisar/rehacer el mail de Welcome (copy + CTA + tracking)
- [ ] **Un solo login unificado** — mismo `/login` sirve Client Portal y Agency Workspace (detecta tenant del user)
- [ ] En `/signin` y `/signup (Start Free Trial)` mostrar selector "Agency Workspace" vs "Client Portal", con copy en el lado cliente tipo *"You already pay a fee — no need to pay for the ATS"*
- [ ] Sacar "Sign in with Microsoft" del Free Trial (dejar Google + email/password)

### Onboarding — primera experiencia
- [ ] Signup obligatorio: **industry** + **company size** (dropdowns)
- [ ] Prefijo de teléfono default por geo-IP (AR → +54, US → +1, etc.) — override manual siempre disponible
- [ ] Volver a mostrar el **nombre de la empresa** debajo del logo "Recruiting ATS" en el header
- [ ] Banner destacado durante la **primera semana** (solo agencia) promoviendo "Migrar desde tu ATS actual" → CTA a flow de import
- [ ] Apollo: trackear logins + eventos clave del onboarding y pushearlos a sequences de mail (seguimiento automatizado al usuario)
- [ ] ~~Loom de onboarding autoplay al primer login~~ → **DIFERIDO** al final (junto con Calendly-like y landing polish)

### Workflows core
- [ ] **Client → Firm invite**: cuando cliente invita una recruiting firm, obligarla a loguearse/registrarse
- [ ] **Dropdown Staff Augmentation vs Recruiting** al crear cliente
  - [ ] Si es Staff Aug → no fee type (depende de cada búsqueda)
  - [ ] Si es Recruiting → terms completos (fee + garantía + fechas de cobro)
- [ ] **Alerta de candidato duplicado** (por cliente, match nombre+apellido, con opción "crear igual")
- [ ] **Alerta de job order duplicado** (por cliente, con opción override)
- [x] ~~Stages estándar — NO personalizados~~ (decisión tomada con Ari)

### Onboarding + trial
- [ ] Wizard de onboarding 3 pasos: crear primer job + primer candidato + invitar primer cliente
- [ ] Downgrade automático al vencer trial (sin esto usan gratis para siempre)

### Agency workspace — UX core (sesión 21/4)

**Clients / contactos**
- [ ] Sacar el campo "Main contact" del formulario de creación de cliente; elegir el main contact después, desde la lista de contactos del cliente (botón "Set as main")
- [ ] Sacar "contact" + "email" + cualquier referencia a main contact de la **view de client** y del **intake form**
- [ ] Eliminar la tab "Client Portal Users" — invitar al portal se hace desde **Contacts** (más limpio y directo)
- [ ] Edición inline **solo con el ícono lápiz** — click en el medio del campo no entra a editar (ej: email de contacto)
- [ ] Eliminar el apartado **Deals**
- [ ] Al crear cliente, sumar sección **Attachments**
- [ ] "Auto-filled document" NO aparece de antemano; recién aparece cuando efectivamente subo un documento

**Jobs / búsquedas**
- [ ] Diferenciar **acceso al portal** vs **acceso a la búsqueda**: tres contactos pueden estar en el portal pero yo solo invito a uno a la búsqueda
- [ ] Al crear una búsqueda para un cliente con contactos ya en el portal → **sugerir** (no auto-invitar) a quiénes sumar
- [ ] Flow "Invite Contact" en búsqueda: lista de contactos ya en el portal + opción "crear uno nuevo". Crear uno nuevo por esta vía lo deja persistido en los contactos del cliente + le manda invite al portal + a la búsqueda
- [ ] Persistir **JD + Additional Documents** en el ATS (hoy parsea pero no deja archivo descargable ni registro accesible)

**Pipeline / candidatos**
- [ ] Rename stage **Contacted → Internal Review**
- [ ] Refuerzo del share workflow: candidato agregado a una JD NO se comparte con el cliente automáticamente
- [ ] Share habilitado solo al arrastrar a **Submitted** o al apretar share desde Internal Review → Submitted; botón llamado **"Share with Client"**
- [ ] Confirm modal al compartir (*"Are you sure you want to send this profile to the client?"*)
- [ ] Cambiar stage de un candidato **desde la lista de Jobs** sin entrar a la búsqueda (dropdown rápido, refleja el pipeline)
- [ ] **List view** (tipo Notion) además del pipeline; en list view el cambio de stage es un dropdown, el pipeline queda como vista visual
- [ ] Desde la info del candidato, mostrar las **búsquedas activas** en las que está y permitir cambiar el stage desde ahí
- [ ] **Notas del candidato**: independientes del job (notas internas del candidato) + notas específicas por búsqueda
- [ ] **Chat por búsqueda**: general interno + con el cliente
- [ ] **Chat por candidato**: interno + con el cliente (misma lógica dual)

**Placements**
- [ ] Al marcar un candidato como **Placed** saltar modal "Congratulations! 🎉 As a next step, please complete the placement info" con botones `Skip / Complete later` y `Fill form`
- [ ] Form de placement pre-llenado: agreed salary (del job/candidate), estimated start date, payment terms (del cliente), fecha de cobro calculada, todo editable
- [ ] Permitir crear placement **manual** desde `/placements`

**Interviews**
- [ ] Al mover un candidato a **Interview** (desde pipeline, list view o info del candidato) saltar modal "Crear evento en calendar" con el mismo form del create manual
- [ ] Vista agregada de interviews: lista de todas las entrevistas del job (internas + con cliente) + vista calendario

**Scheduling (último del bloque, investigar antes)**
- [ ] Calendly-like: permitir al candidato elegir slot del calendar del recruiter. Investigar feasibility; la parte cliente se complica, por ahora solo candidato

**Import**
- [ ] UI de **mapeo de columnas** al importar cualquier cosa
- [ ] Soportar CSV (`.csv`), Excel (`.xlsx`, `.xls`), TSV (`.tsv`) — los tres imprescindibles
- [ ] Sacar "LinkedIn Import"
- [ ] Sacar referencias a Bullhorn y competencia en el flow de import

### Client portal — UX core (sesión 21/4)

**Dashboard / navegación**
- [ ] "Firms engaged" **interactivo**: click → detalle de las firmas o navegación a lista
- [ ] **Sacar "Assigned Recruiter"** — el cliente no tiene que saber quién labura la búsqueda (ya tiene un POC)
- [ ] **Back to home** desde el client portal (breadcrumb / botón claro)

**Team / accesos**
- [ ] Al invitar member, si el email ya existe como contacto del cliente → sugerir *"¿Agregar al usuario existente?"*; si no, permitir crearlo
- [ ] "Your Team" queda general, pero al crear una JO elegir **cuáles de esos members tienen acceso a esta búsqueda**
- [ ] **Deshacer invites**: hoy queda en historial para siempre, hace falta cancelar
- [ ] Al compartir una descripción, pedir **solo el email** — no obligar a buscar por empresa. Cuando el invitee se loguea la primera vez, ahí se le pide el nombre de la empresa (enriquecimiento)

**Jobs / candidatos**
- [ ] Renombrar "Candidates in Assigned Firms" → **Rejected** (para cuando la agencia rechaza el invite que compartió el cliente)
- [ ] Cliente solo **ve** el status del candidato, no lo puede modificar
- [ ] **List view** además del pipeline
- [ ] Chat por búsqueda (interno + con la agencia) y chat por candidato (interno + con la agencia) — replicar estructura de la agencia
- [ ] **Sacar el calendar** del client portal (replica del lado agencia, por ahora no aplica)

**Bugs / polish**
- [ ] Archivos: upload funciona, **download no** → fixear
- [ ] Candidato linkeado a una búsqueda **no aparece** en la solapa de esa búsqueda — arreglar la sincronización
- [ ] En Candidates, click sobre un job rompe la página → fixear navegación
- [ ] Autocomplete de firmas: buscar "Mora" no matchea "Morabits" (ya aceptada) — arreglar partial match

---

## 🟡 P1 — Primer dólar cobrado

### Billing
- [ ] Stripe checkout end-to-end ($15 Solo / $19 Team)
- [ ] Customer portal (cambiar plan, seats, invoices)
- [ ] Webhooks Stripe (cambiar plan en DB al pagar/cancelar/fallar)
- [ ] Dunning (email de reintento si falla el pago)
- [ ] Seat management (admin invita team, roles admin/recruiter/viewer, sync con Stripe)
- [ ] Cálculo de comisiones para el equipo (parametrizable por recruiter)
- [ ] Billing tab en client portal **(depende de: decisión "¿cobrar a hiring companies?")**

### Terms comerciales + reporting base
- [ ] Payment terms + guarantee en Recruiting clients (días de cobro desde fecha de comienzo, garantía)
- [ ] Fechas de cobro + first day + garantía visibles juntos en job/placement
- [ ] Currency con dropdown tipo phone prefix (pesos / USD mínimo)

### QA de features ya implementadas
- [ ] Tirarle 50 CVs reales al parser y medir accuracy; si <85%, evaluar cambiar modelo
- [ ] Verificar que drag-and-drop del pipeline persiste en DB (no solo state) + undo
- [ ] Verificar RBAC: cliente ve SOLO su shortlist, no toda la DB

### Calendar completo
- [ ] Click en día → desglose: interviews + first days + fechas de cobro de placements
- [ ] Upload de archivos a meetings (como Outlook invites)
- [ ] Color-coded meetings: candidato vs cliente; internal vs external en client portal (verificar lo que ya quedó)

### Migración
- [ ] CSV import masivo de candidatos (columnas: name, email, phone, company, title, notes)
- [ ] Sumar soporte Excel (`.xlsx`, `.xls`) y TSV (`.tsv`) al flow de import (ver mapeo de columnas en P0)

---

## 🟢 P2 — Retención y diferenciación (30-60 días post-launch)

- [ ] **Reporting serio**: revenue esperado, placements timeline, cashflow, comisiones, performance por recruiter
- [ ] Currency con API real-time de tipo de cambio (para reporting más útil)
- [ ] **Chrome extension para LinkedIn** (1-click add candidate) — killer feature vs Bullhorn/Loxo
- [ ] Import desde LinkedIn, Indeed, otros portales
- [ ] Gmail / Outlook sync real de threads con candidates
- [ ] **Microsoft Teams integration** — ⏸️ ON HOLD. Código shipped (connect/disconnect + auto-create meeting en calendar). Bloqueado esperando tenant Microsoft propio. Plan acordado: arrancar M365 Business Basic trial ($0 por 30 días, cancelar auto-renewal apenas entres al admin center), verificar `recruitingats.com` en el tenant (con TXT en GoDaddy), App Registration + 4 redirect URIs + secret + Graph permissions, pegar env vars en Vercel. ~30 min de trabajo. Company name del tenant = "Alphabridge Partners", subdomain = `recruitingats.onmicrosoft.com`.
- [ ] Tracking específico para Outsourcing / Staff Aug (métricas propias del modelo)
- [ ] Copilot alerts: "Búsqueda X sin candidatos hace Y días", ambos lados
- [ ] Referral scheme (ambos lados: recruiter→recruiter, cliente→cliente)
- [ ] Shareable public link a shortlist (cliente read-only sin cuenta)
- [ ] Filtro de salary range por moneda
- [ ] Revisar y pulir chat client ↔ staffing (polish)
- [ ] Nombre corto/abreviado de la empresa en header además del logo

---

## 🧹 Housekeeping

- [ ] `sitemap.xml` + `robots.txt` (hoy 404)
- [ ] Meta descriptions decentes por ruta
- [ ] Status page público (Better Stack / Upptime)
- [ ] Página `/changelog` o `/whats-new`
- [ ] Sentry para error tracking
- [ ] PostHog o Plausible para analytics (eventos: signup, onboarding_complete, first_job_created, first_candidate_added, first_client_invited, checkout_started, checkout_completed, churn)
- [ ] Tests automáticos mínimos (smoke: signup → create job → add candidate → assign stage → create placement)
- [ ] Issue/PR templates en GitHub
- [ ] Decidir: `app.recruitingats.com` subdominio aparte o quedarse con `/app/*`

---

## ⚠️ Decisiones pendientes (bloquean dev hasta que las tomemos)

- [x] ~~Trial: con o sin credit card?~~ → **con CC**, 5 días (commit `eeeb661`) (doc recomienda sin CC para MVP)
- [ ] Qué métricas mostrar primero en reporting?
- [ ] Referral scheme: qué incentivo damos? (crédito en suscripción / cash / otro)
- [ ] Definición completa de qué campos cambian entre Staff Aug y Recruiting (necesario para el dropdown de cliente)
- [ ] Logo abbreviation: qué mostramos cuando la empresa no cargó logo? (iniciales / placeholder / nada)
- [ ] Responder las 5 preguntas técnicas que Ari dejó abiertas en el doc (trial/Stripe %, parser model+cost, drag-drop persistencia, RBAC, tests)
- [ ] **¿Cobrar a las hiring companies también?** (aún no decidido). Si sí → habilitar tab Billing en el client portal + definir pricing model separado. Si no → el client portal queda gratis.

---

## ✅ Hecho esta semana (2026-04-13 → 2026-04-17)

Marcado para referencia. Está todo en `git log origin/staging --since="2026-04-13"`.

- [x] ~~Password toggle (ver password al escribir)~~ · ✅ 2026-04-13
- [x] ~~JD upload + documentos adicionales al job~~ · ✅ 2026-04-14
- [x] ~~Client portal con misma lógica de parsing/calendar/work mode que staffing~~ · ✅ 2026-04-15
- [x] ~~JD parse sobreescribe siempre title / location / work arrangement~~ · ✅ 2026-04-17
- [x] ~~Fee type locks format (% / $)~~ · ✅ 2026-04-17
- [x] ~~Phone prefix con dropdown de país~~ · ✅ 2026-04-14
- [x] ~~R wordmark + favicon + logo upload por empresa~~ · ✅ 2026-04-17
- [x] ~~Workspace badge con logo + nombre en ambos portales~~ · ✅ 2026-04-17
- [x] ~~Invite / remove portal users desde client detail~~ · ✅ 2026-04-13
- [x] ~~Main contact aparece en /contacts~~ · ✅ 2026-04-16
- [x] ~~Google OAuth funcionando~~ · ✅ semana previa
- [x] ~~Privacy + Terms pages~~ · ✅ 2026-04-16
- [x] ~~Currency picker searchable~~ · ✅ 2026-04-17
- [x] ~~Calendar con purpose selector (candidate vs client)~~ · ✅ 2026-04-15
- [x] ~~Notificaciones in-app bidireccionales + email Slack-style~~ · ✅ 2026-04-16
- [x] ~~Chat bidireccional (internal + shared tabs) con notificaciones~~ · ✅ 2026-04-16
- [x] ~~Client-owned candidate pipeline + share workflow~~ · ✅ 2026-04-16
- [x] ~~Greenhouse-style candidates view en client portal~~ · ✅ 2026-04-16
- [x] ~~Roles Admin/User simplificados (antes había recruiter/manager)~~ · ✅ 2026-04-16
- [x] ~~Notion-style multi-select filters en Jobs y Candidates~~ · ✅ 2026-04-15
- [x] ~~Add Candidate inline create mode (modal de job detail)~~ · ✅ 2026-04-17
- [x] ~~Client portal OAuth (Google + Microsoft botones) con contexto vía cookie~~
- [x] ~~Settings unificado con tabs (Profile + Integrations + Team + Organization + Billing) en ambos portales~~
- [x] ~~Pricing two-tier: Solo $15/seat, Team $19/seat (2–10)~~
- [x] ~~Pipeline stages unificados (9 stages canónicos en firm + client portal)~~
- [x] ~~OAuth sign-ups fuerzan a ingresar company name real~~
- [x] ~~Stage filter en firm portal candidates~~ · ✅ 2026-04-17

---

## Cómo trabajamos esta hoja

1. Cuando terminamos algo, lo movemos a "Hecho" con fecha.
2. Cuando se te ocurre algo nuevo, lo agregás en el bloque de prioridad que te parezca (o en "Decisiones pendientes" si hay que decidir algo primero).
3. Si una decisión de producto bloquea una tarea, la linkeo con `(depende de: decisión X)`.
4. Cada sesión, al empezar, reviso qué cambió en `git log` desde la última actualización y si detecto algo de la lista que se resolvió, lo tildo solo y te aviso.
