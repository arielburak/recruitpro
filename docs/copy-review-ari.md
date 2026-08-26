# Copy review con Ari — 2026-06-24

Versión corta del audit (`docs/copy-audit.md`) pensada para ir punto por punto en pantalla.

**Cómo leerlo:** cada fila tiene la situación, el copy actual, y una columna **Decisión** vacía para marcar `OK` / `Cambiar a "..."` / `Discutir`. Lo del final de cada sección es lo "feo" — bugs reales o cosas que probablemente quieras tocar.

---

## A. Bugs de copy (arreglar sí o sí)

| # | Qué pasa | Dónde se ve | Decisión |
|---|----------|-------------|----------|
| A1 | **Todos los toasts salen rojos**, incluso los de éxito (`"Invitation sent!"`, `"Profile updated"`, `"Invite resent."`). Ningún caller pasa `"success"`. | Toda la app | |
| A2 | Email de feedback sin rating ni comentario: subject `"{reviewer} left viewed on {candidate}"` (ungrammatical). | Email 1.18 | |
| A3 | Error de upload muestra "Enable Vercel Blob storage in the project settings" al usuario final. | Subir documento en job/interview/cliente | |
| A4 | Tooltip de KPI en dashboard dice `"...linked via OrganizationClient"` (nombre interno del modelo). | `/dashboard` KPI Clients | |
| A5 | Error de seats dice `"Stripe subscription has no item. Contact support."` (filtra modelo Stripe). | Cambiar seats | |
| A6 | Error de seats hardcodea `"Reach out to contact@alphabridgepartners.com"` adentro del mensaje. | Subir seats >100 | |
| A7 | `client-portal/my-team` **no** pide confirmación al **Remove** ni al **Cancel invite** — los otros lugares sí. Click único = acción destructiva. | Client portal → My Team | |
| A8 | Landing FAQ dice "you retain read-only access through your billing period end" al cancelar, pero `SubscriptionGate` bloquea la UI entera. Promesa que no cumple. | Landing FAQ vs canceled state | |
| A9 | Privacy + Terms tienen `Last updated: April 16, 2026` hardcodeado (anterior a hoy). | `/privacy`, `/terms` | |

---

## B. Inconsistencias de marca / voz

| # | Qué pasa | Ejemplo | Decisión |
|---|----------|---------|----------|
| B1 | **3 emails de soporte distintos** en uso: `support@recruitingats.com` (forgot password), `contact@alphabridgepartners.com` (landing + reply-to default + error de seats), `nicolas@alphabridgepartners.com` (privacy + terms). | Varios | |
| B2 | Placeholder `María López` aparece en 6+ inputs (register, invite, onboarding, complete-profile, team invite agency, team invite client). Memoria dice "UI en inglés". | Register `Your Name`, etc. | |
| B3 | Mix de **Title Case vs sentence case** en botones equivalentes: `Add Member` vs `Add candidate`, `Post a Job` vs `Invite teammate`. | Agency vs Client portal | |
| B4 | Para el mismo estado "se acabó el trial" hay dos títulos: `"Trial expired"` (billing) y `"Your free trial has ended"` (overlay). | Billing page vs SubscriptionGate | |
| B5 | Comprar seats: `Buy more seats →` (Team) vs `Buy seat & invite` (dialog). Mismo verbo distinto. | Team page vs dialog | |
| B6 | Mismo concepto, 3 labels: `Recruiting Firms` / `Firms Engaged` / `Firms engaged`. Y para rechazo: `Rejected` (jobs) vs `Declined` (engagements). | Cliente portal | |
| B7 | "Search" vs "Job" — flip-flop en toda la app. H1 de la lista dice `Jobs / Searches`. | Toda la app | |
| B8 | Errores de toast: `"Failed to save"` vs `"Couldn't delete the candidate"` vs `"Failed to remove client."` — verbos y puntuación inconsistente. | Varios | |
| B9 | Único emoji 🎉 en todo el inventario de emails: subject de "invite accepted". | Email 1.7 | |
| B10 | Único `"!"` en heading de éxito: `"Password reset!"` en client portal reset. | Client portal reset | |
| B11 | `HH` / `OS` abreviaturas sin glosario inline en toda la pantalla de Placements. | Placements page | |
| B12 | Mezcla EN+ES + contexto fiscal AR en placement: `"grossed up from neto"`, `"÷ 0.83"`. | Placement dialog | |

---

## C. Emails transaccionales — lo que verá el usuario

Resumen del subject (lo que más decide si abren). Body completo en `copy-audit.md` §1.

| # | Cuándo | Subject actual | Decisión |
|---|--------|----------------|----------|
| C1 | Verificación email post-signup | `Verify your email — Recruiting ATS` | |
| C2 | Welcome owner post-signup | `Welcome to Recruiting ATS` | |
| C3 | Getting started (T+1h) | `Getting started on Recruiting ATS` | |
| C4 | Reset password | `Reset your Recruiting ATS password` | |
| C5 | Invitación a teammate | `{inviter} invited you to {org}` | |
| C6 | Teammate welcome post-accept | `Your Recruiting ATS account is ready — {org}` | |
| C7 | Invite aceptada (al inviter) | `{newMember} joined {org}` + 🎉 en body | |
| C8 | Job assigned | `{assigner} added you to {jobTitle}` | |
| C9 | Client portal share (1ra vez) | `{firm} shared candidates with you for {jobTitle}` | |
| C10 | Set password client portal | `Set up your Recruiting ATS client portal account` | |
| C11 | Client team invite | `{inviter} invited you to {company}'s hiring team` | |
| C12 | Client portal welcome | `Your Recruiting ATS client portal account is ready` | |
| C13 | Client job access granted | `{inviter} added you to {jobTitle}` | |
| C14 | Engagement aceptado | `{firm} accepted {jobTitle}` | |
| C15 | New candidate shared | `New candidate shared: {candidate} for {jobTitle}` | |
| C16 | New chat message | `New message on {candidate} — {jobTitle}` | |
| C17 | @ mention | `{mentioned} mentioned you — {candidate}` | |
| C18 | Feedback de cliente | `{reviewer} left {5★ feedback \| new feedback \| viewed} on {candidate}` ⚠️ "viewed" rompe | |
| C19 | Invitación a interview (candidato) | `Interview Invitation: {jobTitle} @ {clientName}` | |
| C20 | Interview scheduled (cliente) | `Interview Scheduled: {candidate} for {jobTitle} @ {clientName}` | |
| C21 | Subscription activated | `Subscription active — welcome to Recruiting ATS` | |
| C22 | Subscription canceled | `Subscription canceled — access until {date}` | |
| C23 | Subscription ended | `Your Recruiting ATS subscription has ended` | |
| C24 | Subscription reactivated | `Subscription reactivated — welcome back` | |
| C25 | Payment failed | `Action required: payment failed for Recruiting ATS` | |

---

## D. Confirmation dialogs destructivos (lo que cliquea el usuario)

Patrón estándar: `Yes, {verbo}`. Lo que vale revisar es la descripción (lo que le decimos al usuario antes de borrar).

| # | Acción | Descripción actual | Decisión |
|---|--------|--------------------|----------|
| D1 | Delete candidate | "...permanently remove this candidate from the database." + lista de consecuencias | |
| D2 | Stop sharing con client | "{client} will lose access to this submission for "{job}" immediately..." | |
| D3 | Remove de un job | "The submission and any per-job notes / activity tied to it will be removed..." | |
| D4 | Move out of Placed | "This candidate has a placement on "{job}". Moving out of "Placed" will permanently delete the placement (salary, fee, payment terms)." | |
| D5 | Delete job (terminal status FILLED) | "The search closes. Active candidates stay in the pipeline (history preserved), but the kanban freezes..." | |
| D6 | Remove client del workspace | "This will detach {client} from your firm. Their jobs and shared data stay on file..." | |
| D7 | Deactivate teammate | Dialog grande con lista de trabajo activo + 3 opciones para interviews + nota de seat pool | |
| D8 | Cancel invite pendiente | "The invite for {email} will be revoked..." | |
| D9 | Promote/demote admin | "Admins can manage billing, invite and remove teammates..." | |
| D10 | Re-parse JD | "We'll replace the description, and update Location / Work Arrangement if found in the new file." | |

---

## E. Empty states y headers — primera impresión

Lo que ve un usuario nuevo en cada sección. Mismo formato.

| # | Pantalla | Copy actual | Decisión |
|---|----------|-------------|----------|
| E1 | Dashboard nuevo user | "Welcome to Recruiting ATS! Your workspace is ready. Follow these steps to get started." + quick-start de 3 pasos | |
| E2 | Migration banner (día 0) | "Coming from another ATS? ...CSV or TSV from **Bullhorn, JobAdder, Loxo, Crelate**, or wherever you live today." | |
| E3 | Jobs vacío (sin assignments) | "You haven't been assigned to any jobs yet. Job visibility is strictly assignment-based. Ask an admin..." | |
| E4 | Candidates vacío | "No candidates yet — start building your pipeline." | |
| E5 | Clients vacío | "No clients yet — add the first company you work with." | |
| E6 | Placements vacío | "No placements yet. Placements are created when candidates are placed on jobs." | |
| E7 | Calendar vacío | "Nothing on the schedule for the next 7 days" | |
| E8 | Engagements vacío | "No engagement requests yet. When hiring companies invite your firm to work on their searches, they'll appear here." | |
| E9 | Client portal welcome | "Get started with your first job posting. Post a job description and invite recruiting firms..." | |
| E10 | Client portal candidates vacío | "No candidates shared with you yet. Your recruiting firms will share candidates here as they find them." | |

---

## F. Landing page — lo que decide signup

Esta sección la haría como pasada aparte porque es la más importante para conversion.

| # | Bloque | Copy actual | Decisión |
|---|--------|-------------|----------|
| F1 | Pill hero | "The ATS built for boutique recruiting firms" | |
| F2 | H1 hero | "Your candidates deserve a better pipeline" | |
| F3 | Subhead hero | "Stop losing placements to spreadsheets and scattered emails. Recruiting ATS gives your firm a visual pipeline and everything you need to place faster, from $20/seat/month." | |
| F4 | CTA principal | "Start 7-Day Trial" / "7-day trial · Cancel anytime" | |
| F5 | Trust bar | "Built by recruiters for recruiters" | |
| F6 | Section Pain header | "The recruiting firm struggle is real" + 3 pains | |
| F7 | Section Solution header | "There's a better way" + 3 solutions | |
| F8 | Pricing card | "From $20/seat/month" | |
| F9 | Comparison table | Compara contra **Bullhorn ($99+/user/mo)** y **Loxo ($119+/user/mo)** con "You save $79–$99/mo" | |
| F10 | The Math | "One placement covers 20 years of Recruiting ATS" + cálculo $25k fee / $100 mo / 250 meses | |
| F11 | FAQ trial | "...$20/seat/month. Cancel any time before the trial ends and you won't be billed." | |
| F12 | FAQ data security | "All data is encrypted in transit (TLS) and at rest. We run on managed Postgres (Neon)... We're not SOC 2 certified yet, but that's on the roadmap" | |
| F13 | FAQ cancel | ⚠️ Promete read-only post-cancel — **falso**, ver A8 | |
| F14 | Final CTA H2 | "Ready to close more placements, faster?" | |
| F15 | Footer contact | "Have a specific question? Get in touch." + `contact@alphabridgepartners.com` | |

---

## G. SubscriptionGate (cuando se bloquea la app)

Cada estado tiene su propio overlay. Es lo último que ven antes de pagar — el copy define la sensación.

| Estado | Título | Subtítulo | Decisión |
|--------|--------|-----------|----------|
| Trial vencido | "Your free trial has ended" | "Subscribe to keep your team working. Your candidates, jobs and pipeline are safe — pick up exactly where you left off." | |
| Sin sub | "Subscription required" | "Subscribe to start using Recruiting ATS." | |
| Cancelado | "Your subscription has ended" | "Subscribe again to regain access. Your candidates, jobs and pipeline come back instantly." | |
| Past due | "Payment past due" | "We couldn't process your last payment. Update your billing details to restore access." | |
| Unpaid | "Subscription unpaid" | "Your subscription has unpaid invoices. Settle them to keep using Recruiting ATS." | |
| Non-admin | (variable) | "Only your workspace admin can subscribe. Reach out to them to restore access." | |

---

## H. Trial countdown popup

Lo que ve el user los últimos días del trial — clave para conversion.

| Días | Título | Subtítulo | Decisión |
|------|--------|-----------|----------|
| 0 | "Your trial ends today" | "Add a payment method now to keep your team working without interruption." | |
| 1–2 | "{N} day(s) left in your trial" | (igual que arriba) | |
| 3–6 | "{N} days left in your trial" | "Subscribe now to keep your team working. $20/seat per month. Cancel anytime." | |
| 7+ | "{N} days left in your free trial" | "Enjoying the ATS? Subscribe any time. $20/seat per month. Cancel anytime." | |

---

## Cómo seguir

1. Pasada con Ari sobre las **secciones A y B** primero — son bugs y trade-offs que conviene cerrar antes de tocar voice.
2. Después **F (landing)** + **G (gate)** + **H (countdown)** — esos 3 deciden conversion.
3. Por último **C (emails) + D (dialogs) + E (empty states)** — pasada más larga, podemos hacerla en otra sesión si la primera ya es densa.
4. Inventario completo (con file paths y line numbers para implementar después): `docs/copy-audit.md`.
