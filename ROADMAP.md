# RecruitingATS — Roadmap

> Hoja madre de los puntos que faltan. Se actualiza acá cuando (a) tildamos algo que hicimos o (b) sumamos un item nuevo que se nos ocurre.

**Convenciones**
- `- [ ]` pendiente · `- [x]` hecho
- Solo se tilda cuando el usuario da el OK que funciona. Sin notas extra, solo el tick.
- Prioridades: **P0** = pre-launch · **P1** = primer dólar · **P2** = retención · 🧹 = housekeeping
- Si una decisión de producto falta tomarse, vive en **Decisiones pendientes** al final
- Acceso rápido: `/roadmap` desde Claude Code

**Última actualización**: 2026-04-21

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
- [ ] Email verification en `/register`
- [ ] Integrar Resend o Postmark para email transaccional
- [ ] Templates de email: welcome, reset password, verification, client invite, feedback notification
- [ ] Welcome email automático al registrarse + capturar a base de marketing

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

---

## 🟢 P2 — Retención y diferenciación (30-60 días post-launch)

- [ ] **Reporting serio**: revenue esperado, placements timeline, cashflow, comisiones, performance por recruiter
- [ ] Currency con API real-time de tipo de cambio (para reporting más útil)
- [ ] **Chrome extension para LinkedIn** (1-click add candidate) — killer feature vs Bullhorn/Loxo
- [ ] Import desde LinkedIn, Indeed, otros portales
- [ ] Gmail / Outlook sync real de threads con candidates
- [ ] **Microsoft Teams integration** — código shipped (connect/disconnect + auto-create meeting en calendar). Bloqueado esperando tenant Microsoft propio (applied al M365 Dev Program, esperando aprobación). Cuando llegue tenant → 10 min de config en Azure + env vars en Vercel.
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
