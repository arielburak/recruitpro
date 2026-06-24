# Copys de emails — Recruiting ATS

> Listado plano de todos los emails transaccionales que manda el ATS.
> Variables entre `{llaves}` se reemplazan en tiempo de envío.
> **Todos estos están live en producción ahora mismo.**
>
> Para revisar y cambiar con Ari. Cuando definan los nuevos copys,
> los cambio en `lib/email.ts` en un solo PR.

---

## 🔐 Auth & onboarding

### 1. Verify email
- **Cuándo:** signup con password (no Google). Inmediato.
- **Subject:** `Verify your email — Recruiting ATS`
- **Body:**
  > Hi {firstName},
  > Thanks for signing up. Click the button to confirm this is your email.
  > This link expires in 24 hours.
  > [Button: Verify Email]

### 2. Welcome
- **Cuándo:** signup completado (post-verify para password, instant para Google OAuth). Inmediato.
- **Subject:** `Welcome to Recruiting ATS`
- **Body:**
  > You're in, {firstName}
  > {orgName} is live on Recruiting ATS. Take a look around — we'll send you a short getting-started note in a bit.
  > Your free trial runs until {date}. We won't charge until it ends — cancel any time before then and you won't be billed.
  > Reply to this email if anything's confusing or missing — we read every message.
  > [Button: Open Dashboard]

### 3. Getting started (drip)
- **Cuándo:** 1 hora después del signup.
- **Subject:** `Getting started on Recruiting ATS`
- **Body:**
  > {firstName}, here's the fastest path to your first placement
  > Now that you've had a chance to look around {orgName}, three things worth doing this week:
  > 1. Add your first client — set fee structure + payment terms once, reuse for every search.
  > 2. Post your first job — upload the JD and the parser fills the form for you.
  > 3. Invite a teammate — collaborate on the same pipeline + share notes.
  > Reply to this email if anything's confusing or missing — we read every message and ship fast.
  > [Button: Open Dashboard]

### 4. Password reset
- **Cuándo:** user pide reset desde /forgot-password.
- **Subject:** `Reset your Recruiting ATS password`
- **Body:**
  > Hi {firstName},
  > We received a request to reset your Recruiting ATS password. Click the button below to choose a new one. This link expires in 1 hour.
  > If you didn't request this, ignore — your password stays unchanged.
  > [Button: Reset Password]

---

## 👥 Team (agency)

### 5. Team invite
- **Cuándo:** admin invita a un teammate.
- **Subject:** `{inviterName} invited you to {orgName}`
- **Body:**
  > You've been invited to join {orgName}
  > Hi {firstName},
  > **{inviterName}** invited you to collaborate on Recruiting ATS.
  > Recruiting ATS is where {orgName} runs their searches — accept to join the team there.
  > This link expires in 7 days.
  > [Button: Accept Invitation]

### 6. Staffing member welcome (después de aceptar invite)
- **Cuándo:** teammate acepta invite y setea password.
- **Subject:** `Your Recruiting ATS account is ready — {orgName}`
- **Body:**
  > Welcome to {orgName} on Recruiting ATS
  > Hi {firstName},
  > Your Recruiting ATS account at **{orgName}** is now active and your email has been confirmed. You can sign in any time at the link below.
  > From the dashboard you'll see the searches you're assigned to, candidates in flight, and your team's recent activity.
  > [Button: Open Dashboard]

### 7. Invite accepted (al inviter)
- **Cuándo:** un teammate acepta el invite que mandaste.
- **Subject:** `{newMemberName} joined {orgName}`
- **Body:**
  > 🎉 {newMemberName} accepted your invite
  > Hi {firstName},
  > **{newMemberName}** ({email}) just joined **{orgName}** on Recruiting ATS.
  > They can now see the searches they're assigned to and collaborate with you on candidates and clients.
  > Want to keep growing the team? Send another invite from My Team.
  > [Button: Open My Team]

### 8. Job assigned
- **Cuándo:** admin asigna un recruiter a una búsqueda.
- **Subject:** `{assignerName} added you to {jobTitle}`
- **Body:**
  > You're now collaborating on {jobTitle}
  > Hi {firstName},
  > {assignerName} just added you to the search for **{jobTitle}** ({role} · {clientName}). Open the job to see the pipeline and start sourcing.
  > [Button: Open Job]

---

## 🏢 Cliente (hiring company) — invitations

### 9. Client set-password (primer login)
- **Cuándo:** un firm comparte candidatos con un cliente nuevo.
- **Subject:** `Set up your Recruiting ATS client portal account`
- **Body:**
  > Set up your client portal account
  > Hi {clientName},
  > **{firmName}** has shared candidates with you on Recruiting ATS. To review them, you'll need to set a password for your account.
  > Click below to set your password and access your portal.
  > [Button: Set Password & Sign In]

### 10. Client team invite (admin del cliente invita teammates)
- **Cuándo:** admin del client portal invita a otro miembro de su equipo.
- **Subject:** `{inviterName} invited you to {companyName}'s hiring team`
- **Body:**
  > You've been added to {companyName}'s hiring team
  > Hi {memberName},
  > **{inviterName}** has invited you to join **{companyName}**'s hiring team on Recruiting ATS.
  > Role: **{title}**
  > With your account, you can:
  > - View and post job openings
  > - Track recruiting firm activity
  > - Review shared candidates
  > - Manage your team's hiring pipeline
  > Click below to set your password and get started.
  > [Button: Set Password & Get Started]

### 11. Client portal welcome (después de set-password)
- **Cuándo:** cliente termina set-password.
- **Subject:** `Your Recruiting ATS client portal account is ready`
- **Body:**
  > Welcome to Recruiting ATS
  > Hi {firstName},
  > Your client portal account for {clientName} is now active. Your email has been confirmed and you can sign in any time at the link below.
  > Use the portal to review candidates shared by your recruiter, leave feedback, and track the searches you're hiring on.
  > [Button: Open Portal]

### 12. Client job access granted (sumar miembro a job específico)
- **Cuándo:** un admin del client portal le da acceso a un job a otro teammate que ya tiene cuenta.
- **Subject:** `{inviterName} added you to {jobTitle}`
- **Body:**
  > Hi {memberName},
  > **{inviterName}** just gave you access to **{jobTitle}** on {companyName}'s portal.
  > You can now review shared candidates, post notes for the team, and follow the pipeline.
  > [Button: Open Search]

---

## 📨 Engagement (firm ↔ client)

### 13. Engagement accepted (al cliente)
- **Cuándo:** el firm acepta una invitación a colaborar en una búsqueda.
- **Subject:** `{firmName} accepted {jobTitle}`
- **Body:**
  > Hi {inviterName},
  > **{firmName}** just accepted your invitation to work on **{jobTitle}**. They can now start sharing candidates and chatting with your team.
  > [Button: Open Search]

### 14. Client portal share (al cliente cuando se comparte shortlist)
- **Cuándo:** el firm comparte candidatos con un cliente. Solo si el cliente ya tiene portal account.
- **Subject:** `{firmName} shared candidates with you for {jobTitle}`
- **Body:**
  > Hi {clientName},
  > **{recruiterName}** from **{firmName}** has shared a candidate shortlist with you on Recruiting ATS.
  > {jobTitle}
  > {N} candidates have been shared for your review.
  > Sign in to your client portal to review profiles, rate candidates, and leave feedback.
  > [Button: Review Candidates]

### 15. Candidate shared (al cliente, cada vez que se comparte un candidato individual)
- **Cuándo:** el firm comparte un candidato puntual con el cliente.
- **Subject:** `New candidate shared: {candidateName} for {jobTitle}`
- **Body:**
  > New candidate for {jobTitle}
  > Hi {firstName},
  > **{recruiterName}** from **{firmName}** just shared a new candidate with **{clientName}**:
  > **{candidateName}** for {jobTitle}
  > {Optional note from recruiter}
  > Sign in to the client portal to view the full profile, download their resume, and leave feedback.
  > [Button: View Candidate]

### 16. Candidate feedback (al recruiter, cuando el cliente deja review)
- **Cuándo:** cliente puntúa o comenta un candidato.
- **Subject:** `{reviewerName} left {N}★ feedback on {candidateName}` (o "new feedback" / "viewed")
- **Body:**
  > New feedback on {candidateName}
  > Hi {recruiterName},
  > **{reviewerName}** at **{clientCompanyName}** just left feedback on **{candidateName}** for {jobTitle}.
  > Rating: ★★★★☆ (4/5)
  > {Optional comment}
  > [Button: View Candidate]

---

## 💬 Chat & menciones

### 17. New message (chat)
- **Cuándo:** alguien manda un mensaje en el chat (interno o cliente). Solo a los que NO están @-mencionados; los @-mencionados van por la mention email (#18).
- **Subject:** `New message on {candidateName} — {jobTitle}`
- **Body:**
  > New message about {candidateName}
  > Hi {firstName},
  > **{fromName}** ({a recruiter | the client | your team}) left a new message in {your internal channel | the shared chat} for **{candidateName}** ({jobTitle}):
  > > {preview del mensaje}
  > [Button: View Conversation]

### 18. Mention
- **Cuándo:** alguien te @-menciona en un chat.
- **Subject:** `{mentionedBy} mentioned you — {candidateName}`
- **Body:**
  > {mentionedBy} mentioned you
  > Hi {firstName},
  > **{mentionedBy}** mentioned you in a message about **{candidateName}** ({jobTitle}):
  > > {preview del mensaje}
  > [Button: View Conversation]

---

## 📅 Interviews

### 19. Interview invite (al candidato)
- **Cuándo:** el recruiter programa una interview y marca "Save & send invite".
- **Subject:** `Interview Invitation: {jobTitle} @ {clientName}`
- **Body:**
  > Interview Invitation
  > Hi {candidateName},
  > You've been scheduled for an interview. Here are the details:
  > {tabla con job/client/date/time/timezone/type/location/notes}
  > If you need to reschedule or have any questions, please contact **{recruiterName}**.
  > Good luck!
  > [Button: Join Meeting] (si hay meeting link)

### 20. Interview invite (al cliente)
- **Cuándo:** misma interview pero notificación al hiring contact.
- **Subject:** `Interview Scheduled: {candidateName} for {jobTitle} @ {clientName}`
- **Body:**
  > Interview Scheduled
  > Hi {contactName},
  > **{recruiterName}** from **{firmName}** has scheduled an interview for your review:
  > {tabla con candidate/job/client/date/time/type/notes}
  > Thanks for taking the time — let us know if you need to reschedule.
  > [Button: Join Meeting] (si hay link)

---

## 💳 Billing

### 21. Subscription activated
- **Cuándo:** completaste checkout en Stripe.
- **Subject:** `Subscription active — welcome to Recruiting ATS`
- **Body:**
  > {firstName}, you're all set
  > Your subscription to **Recruiting ATS** is now active. Thanks for trusting us with **{orgName}**'s recruiting workflow.
  > Plan: {N} seats · $${monthly}/month
  > Billing: Monthly, auto-renewed
  > You can manage billing — update your payment method, download invoices, or cancel — any time from your settings. Stripe will email you a receipt for every payment.
  > If you add or remove teammates the bill adjusts automatically on your next invoice.
  > Reply to this email if anything's confusing or you'd like to chat — we read every message.
  > [Button: Open Dashboard]

### 22. Subscription canceled (scheduled)
- **Cuándo:** cancelás desde Customer Portal. Sub sigue activa hasta el final del periodo.
- **Subject:** `Subscription canceled — access until {date}`
- **Body:**
  > {firstName}, we got your cancellation
  > Your **Recruiting ATS** subscription for **{orgName}** is scheduled to cancel.
  > Access until: {date}
  > After that: You'll lose access to create new data. Your existing candidates, jobs and clients stay in our DB.
  > Changed your mind? Reactivate before {date} and keep everything as it is — no new charge until your normal billing cycle.
  > If we can do something to keep you on board, just reply — we read every email.
  > [Button: Reactivate subscription]

### 23. Subscription ended
- **Cuándo:** termina el periodo después de cancel. Acceso revocado.
- **Subject:** `Your Recruiting ATS subscription has ended`
- **Body:**
  > {firstName}, your subscription has ended
  > Your **Recruiting ATS** subscription for **{orgName}** ended today.
  > Your data is safe — we keep it in our DB so you can pick up where you left off. To regain access:
  > - Resubscribe — same price, your candidates and pipeline come back instantly.
  > - Reply to this email if you'd like to chat about your experience or ask for a custom plan.
  > Thanks for using Recruiting ATS, whatever you decide.
  > [Button: Resubscribe]

### 24. Subscription reactivated
- **Cuándo:** después de cancelar, el user reactiva antes de que termine el periodo.
- **Subject:** `Subscription reactivated — welcome back`
- **Body:**
  > {firstName}, glad to have you back
  > Your **Recruiting ATS** subscription for **{orgName}** is back on track. No cancellation pending.
  > Next billing date: **{date}**. Same plan, same seats — billing continues uninterrupted.
  > If you reactivated by accident, you can cancel again from Settings → Billing.
  > [Button: Open Dashboard]

### 25. Payment failed
- **Cuándo:** Stripe no pudo cobrar la tarjeta (decline, expirada, etc).
- **Subject:** `Action required: payment failed for Recruiting ATS`
- **Body:**
  > {firstName}, your payment didn't go through
  > We tried to charge your card for **Recruiting ATS** — **{orgName}** — and the bank declined it.
  > To avoid losing access, update your payment method:
  > [Button: Update payment method]

---

## Notas para Ari & Nicolás

- **Tono actual:** medio Slack-y, primera persona ("we read every message"), un poco de personalidad. Si quieren más formal, lo bajamos.
- **Firma:** ninguno tiene firma explícita. Mandan desde `noreply@recruitingats.com`, reply-to a `contact@alphabridgepartners.com`.
- **Emojis:** uno solo en producción (🎉 en "Invite accepted"). Si lo quieren sacar, decirme.
- **Empty states:** algunos copys mencionan "we read every message" / "reply to this email" — depende de si Ari quiere realmente leerlos o sacarlos.
- **Frases recurrentes a revisar:**
  - "Recruiting ATS" como nombre — ¿definitivo o cambia a otra cosa pre-launch?
  - "Reply to this email" aparece varias veces — está bien si lo van a leer realmente
  - El branding `🎉` está en el invite-accepted — quitarlo o mantenerlo

Cuando me pasen los textos nuevos, los cambio en un PR y queda live en staging en 5 min.
