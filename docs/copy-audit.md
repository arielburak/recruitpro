# ATS Copy Audit — 2026-06-24

Comprehensive review of every user-facing string in the ATS. Each entry has:
- **Situation**: when/why the user sees it
- **Copy**: the exact text (template vars left as `${var}` / `{name}` so it's obvious what's interpolated)
- **Where**: file path and line number
- **Trigger**: the action/endpoint that fires it

Mark anything for Ari to review with `[REVIEW]` at the start of the line. Mark anything that's clearly placeholder/stale with `[STALE?]`. Default to no marker.

> Heads-up before reading: this is a literal inventory, not a rewrite proposal. Skim the cross-cutting findings at the bottom first if you want the patterns to look for.

---

## 1. Transactional emails

All emails live in `lib/email.ts`. The shared template (`wrapTemplate`) wraps every body in: a small "RECRUITING ATS" eyebrow, a card with cream background, headline + body + CTA button + plain-text link fallback, and footer "You're receiving this because of activity on your Recruiting ATS account. If this wasn't you, you can safely ignore this email."

From address: `Recruiting ATS <noreply@recruitingats.com>` (env-configurable). Reply-to defaults to `contact@alphabridgepartners.com` unless a contextual one is passed (recruiter, sender, etc).

### 1.1 Email verification (after signup)
**Situation**: Right after a new agency user signs up, before they can use the dashboard.
**Trigger**: `lib/email.ts:sendEmailVerificationEmail` — called from `app/api/auth/register/route.ts` and the resend endpoint.
**Subject**: `Verify your email — Recruiting ATS`
**Body**:
> Hi {firstName},
>
> Thanks for signing up. Click the button to confirm this is your email.
>
> This link expires in 24 hours.
>
> CTA: **Verify Email**

### 1.2 Welcome — agency owner (signup)
**Situation**: Sent right after signup completes (in parallel with verification email). Confirms the workspace exists and points them at the dashboard.
**Trigger**: `lib/email.ts:sendWelcomeEmail` from `app/api/auth/register/route.ts`.
**Subject**: `Welcome to Recruiting ATS`
**Body**:
> You're in, {firstName}
>
> **{organizationName}** is live on Recruiting ATS. Take a look around — we'll send you a short getting-started note in a bit.
>
> Your free trial runs until **{trialEndsAt}**. We won't charge until it ends — cancel any time before then and you won't be billed.
>
> Reply to this email if anything's confusing or missing — we read every message.
>
> CTA: **Open Dashboard**

### 1.3 Getting started — agency owner (T+1h drip)
**Situation**: Scheduled ~1h after signup via Resend `scheduledAt`. The "what to do first" guide once the user has had a chance to poke around.
**Trigger**: `lib/email.ts:sendGettingStartedEmail` queued from `app/api/auth/register/route.ts`.
**Subject**: `Getting started on Recruiting ATS`
**Body**:
> {firstName}, here's the fastest path to your first placement
>
> Now that you've had a chance to look around **{organizationName}**, three things worth doing this week:
> 1. **Add your first client** — set fee structure + payment terms once, reuse for every search.
> 2. **Post your first job** — upload the JD and the parser fills the form for you.
> 3. **Invite a teammate** — collaborate on the same pipeline + share notes.
>
> Reply to this email if anything's confusing or missing — we read every message and ship fast.
>
> CTA: **Open Dashboard**

### 1.4 Password reset
**Situation**: User clicked "Forgot password" on staffing login.
**Trigger**: `lib/email.ts:sendPasswordResetEmail` from `app/api/auth/forgot-password/route.ts`.
**Subject**: `Reset your Recruiting ATS password`
**Body**:
> Reset your password
>
> Hi {firstName},
>
> We received a request to reset your Recruiting ATS password. Click the button below to choose a new one. This link expires in 1 hour.
>
> If you didn't request this, ignore — your password stays unchanged.
>
> CTA: **Reset Password**

### 1.5 Team invite (agency teammate)
**Situation**: Admin invited a new teammate into the workspace. They click the link to set a password.
**Trigger**: `lib/email.ts:sendTeamInviteEmail` from `app/api/admin/invites/route.ts` (POST) and `app/api/admin/invites/[id]/resend/route.ts`.
**Subject**: `${inviterName} invited you to ${organizationName}`
**Body**:
> You've been invited to join {organizationName}
>
> Hi {firstName},
>
> **{inviterName}** invited you to collaborate on Recruiting ATS.
>
> Recruiting ATS is where {organizationName} runs their searches — accept to join the team there.
>
> This link expires in 7 days.
>
> CTA: **Accept Invitation**

### 1.6 Staffing teammate welcome (after invite accepted)
**Situation**: Sent right after an invited teammate finishes set-password (or OAuth invite accept). Closes the loop with "your account is live."
**Trigger**: `lib/email.ts:sendStaffingMemberWelcomeEmail` from `app/api/invite/[token]/route.ts:190` and `lib/oauth-accept-staffing-invite.ts`.
**Subject**: `Your Recruiting ATS account is ready — ${organizationName}`
**Body**:
> Welcome to {organizationName} on Recruiting ATS
>
> Hi {firstName},
>
> Your Recruiting ATS account at **{organizationName}** is now active and your email has been confirmed. You can sign in any time at the link below.
>
> From the dashboard you'll see the searches you're assigned to, candidates in flight, and your team's recent activity.
>
> CTA: **Open Dashboard**

### 1.7 Invite accepted (heads-up to inviter)
**Situation**: Sent to the admin who originally invited a teammate, the moment that teammate accepts. Growth loop nudge.
**Trigger**: `lib/email.ts:sendInviteAcceptedEmail` from `app/api/invite/[token]/route.ts` and the OAuth invite-accept path.
**Subject**: `${newMemberName} joined ${organizationName}`
**Body**:
> 🎉 {newMemberName} accepted your invite
>
> Hi {firstName},
>
> **{newMemberName}** ({newMemberEmail}) just joined **{organizationName}** on Recruiting ATS.
>
> They can now see the searches they're assigned to and collaborate with you on candidates and clients.
>
> Want to keep growing the team? Send another invite from [My Team]({teamUrl}).
>
> CTA: **Open My Team**

[REVIEW] This is the only email in the whole inventory that starts with an emoji 🎉. Decide if that's a feature or an outlier.

### 1.8 Job assigned (recruiter added to a search)
**Situation**: Admin/teammate added a recruiter to a Job via the Assignments panel.
**Trigger**: `lib/email.ts:sendJobAssignedEmail` from `app/api/jobs/[id]/assignments/route.ts`.
**Subject**: `${assignerName} added you to ${jobTitle}`
**Body**:
> You're now collaborating on {jobTitle}
>
> Hi {firstName},
>
> {assignerName} just added you to the search for **{jobTitle}** ({role} · {clientName}). Open the job to see the pipeline and start sourcing.
>
> CTA: **Open Job**

### 1.9 Client portal share (first invite to a client contact)
**Situation**: Agency clicks "Invite Client to Portal" for a Job. The client gets the share email + set-password link.
**Trigger**: `lib/email.ts:sendClientPortalShareEmail` from `app/api/client-portal/tokens/route.ts`.
**Subject**: `${firmName} shared candidates with you for ${jobTitle}` (or `${firmName} shared candidates with you` if no job).
**Body**:
> {firmName} shared candidates with you
>
> Hi {clientName},
>
> **{recruiterName}** from **{firmName}** has shared a candidate shortlist with you on Recruiting ATS.
>
> {jobTitle (bold)}
> {candidateCount} candidates have been shared for your review.
>
> Sign in to your client portal to review profiles, rate candidates, and leave feedback.
>
> CTA: **Review Candidates**

### 1.10 Client portal — set password (first share, new contact)
**Situation**: Client contact who's never been in the portal. The share email above plus this one tell them to create an account.
**Trigger**: `lib/email.ts:sendClientSetPasswordEmail` (sent alongside 1.9 when a new ClientUser was provisioned).
**Subject**: `Set up your Recruiting ATS client portal account`
**Body**:
> Set up your client portal account
>
> Hi {clientName},
>
> **{firmName}** has shared candidates with you on Recruiting ATS. To review them, you'll need to set a password for your account.
>
> Click below to set your password and access your portal.
>
> CTA: **Set Password & Sign In**

### 1.11 Client team invite (existing client adds a colleague)
**Situation**: A client admin invites a colleague at the same company to the portal.
**Trigger**: `lib/email.ts:sendClientTeamInviteEmail` from `app/api/client-portal/team/route.ts`.
**Subject**: `${inviterName} invited you to ${companyName}'s hiring team`
**Body**:
> You've been added to {companyName}'s hiring team
>
> Hi {memberName},
>
> **{inviterName}** has invited you to join **{companyName}**'s hiring team on Recruiting ATS.
>
> Role: **{title}**
>
> With your account, you can:
> - View and post job openings
> - Track recruiting firm activity
> - Review shared candidates
> - Manage your team's hiring pipeline
>
> Click below to set your password and get started.
>
> CTA: **Set Password & Get Started**

### 1.12 Client portal welcome (after set-password)
**Situation**: Confirmation mail after a hiring contact finishes set-password. Mirrors 1.6 for the agency side.
**Trigger**: `lib/email.ts:sendClientPortalWelcomeEmail` from `app/api/client-portal/set-password/route.ts`.
**Subject**: `Your Recruiting ATS client portal account is ready`
**Body**:
> Welcome to Recruiting ATS
>
> Hi {firstName},
>
> Your client portal account for {clientName} is now active. Your email has been confirmed and you can sign in any time at the link below.
>
> Use the portal to review candidates shared by your recruiter, leave feedback, and track the searches you're hiring on.
>
> CTA: **Open Portal**

### 1.13 Client job access granted (existing client teammate added to a Job)
**Situation**: Differentiated from 1.10 — this is for a client teammate who already has a portal account; they just got pulled onto a specific job.
**Trigger**: `lib/email.ts:sendClientJobAccessGrantedEmail` from `app/api/jobs/[id]/client-portal-access/route.ts` and the client portal `add-member` route.
**Subject**: `${inviterName} added you to ${jobTitle}`
**Body**:
> {inviterName} added you to {jobTitle}
>
> Hi {memberName},
>
> **{inviterName}** just gave you access to **{jobTitle}** on {companyName}'s portal.
>
> You can now review shared candidates, post notes for the team, and follow the pipeline.
>
> CTA: **Open Search**

### 1.14 Engagement accepted (firm accepts client invite)
**Situation**: A client invited a firm to a search; this fires when the firm clicks Accept.
**Trigger**: `lib/email.ts:sendEngagementAcceptedEmail` from `app/api/engagements/[id]/route.ts`.
**Subject**: `${firmName} accepted ${jobTitle}`
**Body**:
> {firmName} accepted {jobTitle}
>
> Hi {firstName},
>
> **{firmName}** just accepted your invitation to work on **{jobTitle}**. They can now start sharing candidates and chatting with your team.
>
> CTA: **Open Search**

### 1.15 New candidate shared
**Situation**: Recruiter marks a submission as shared with the client. Email goes to each ClientJobMember.
**Trigger**: `lib/email.ts:sendCandidateSharedEmail` from `app/api/submissions/[id]/route.ts`.
**Subject**: `New candidate shared: ${candidateName} for ${jobTitle}`
**Body**:
> New candidate for {jobTitle}
>
> Hi {firstName},
>
> **{recruiterName}** from **{firmName}** just shared a new candidate with **{clientName}**:
>
> **{candidateName}**
> for **{jobTitle}**
>
> [Optional quote block — "Note from {recruiterName}: {note}"]
>
> Sign in to the client portal to view the full profile, download their resume, and leave feedback.
>
> CTA: **View Candidate**

### 1.16 New chat message
**Situation**: A new message lands on a shared candidate's thread (internal or shared) for someone who isn't currently looking.
**Trigger**: `lib/email.ts:sendNewMessageEmail` from `lib/chat-notifications.ts`.
**Subject**: `New message on ${candidateName} — ${jobTitle}`
**Body**:
> New message about {candidateName}
>
> Hi {firstName},
>
> **{fromName}** ({a recruiter | the client | your team}) left a new message in {the shared chat | your internal channel} for **{candidateName}** (*{jobTitle}*):
>
> > [quoted preview, truncated to 240 chars]
>
> CTA: **View Conversation**

### 1.17 You were @mentioned
**Situation**: Someone @-mentioned the recipient in a comment.
**Trigger**: `lib/email.ts:sendMentionEmail` from `lib/chat-notifications.ts`.
**Subject**: `${mentionedBy} mentioned you — ${candidateName}`
**Body**:
> {mentionedBy} mentioned you
>
> Hi {firstName},
>
> **{mentionedBy}** mentioned you in a message about **{candidateName}** (*{jobTitle}*):
>
> > [quoted preview]
>
> CTA: **View Conversation**

### 1.18 Candidate feedback (rating/comment from client)
**Situation**: Client left a star rating or comment on a shared candidate.
**Trigger**: `lib/email.ts:sendCandidateFeedbackEmail` from `app/api/client-portal/candidates/[submissionId]/feedback/route.ts`.
**Subject**: `${reviewerName} left ${5★ feedback | new feedback | viewed} on ${candidateName}`
**Body**:
> New feedback on {candidateName}
>
> Hi {firstName},
>
> **{reviewerName}** at **{clientCompanyName}** just left feedback on **{candidateName}** for *{jobTitle}*.
>
> Rating: ★★★★☆ (4/5)
>
> > [comment quote, if any]
>
> [If no rating + no comment]: They opened the profile but didn't leave a comment or rating yet.
>
> CTA: **View Candidate**

[REVIEW] The "viewed-only" subject `"${reviewerName} left viewed on ${candidateName}"` reads ungrammatical. Worth a copy pass.

### 1.19 Interview invitation — to candidate
**Situation**: Recruiter schedules an interview and ticks "email the candidate".
**Trigger**: `lib/email.ts:sendInterviewInviteEmail` from `app/api/interviews/route.ts`.
**Subject**: `Interview Invitation: ${jobTitle} @ ${clientName}`
**Body**:
> Interview Invitation
>
> Hi {firstName},
>
> You've been scheduled for an interview. Here are the details:
>
> | Job | {jobTitle} |
> | Client | {clientName} |
> | When | {date} · {time}–{endTime} ({timezone}) |
> | Type | Video Call / Phone Call / In Person |
> | Where | {location} |
> | Notes | {notes} |
>
> If you need to reschedule or have any questions, please contact **{recruiterName}**.
>
> Good luck!
>
> CTA: **Join Meeting** (if meetingLink)

### 1.20 Interview scheduled — to client contact
**Situation**: Same scheduling action, parallel email to the client contacts attached to the interview.
**Trigger**: `lib/email.ts:sendInterviewInviteToClientContact`.
**Subject**: `Interview Scheduled: ${candidateName} for ${jobTitle} @ ${clientName}`
**Body**:
> Interview Scheduled
>
> Hi {firstName},
>
> **{recruiterName}** from **{firmName}** has scheduled an interview for your review:
>
> | Candidate | {candidateName} |
> | Job | {jobTitle} |
> | Client | {clientName} |
> | When | {date} · {time}–{endTime} ({timezone}) |
> | Type | Video Call / Phone Call / In Person |
> | Where | {location} |
> | Notes | {notes} |
>
> Thanks for taking the time — let us know if you need to reschedule.
>
> CTA: **Join Meeting** (if meetingLink)

### 1.21 Subscription activated
**Situation**: First successful Stripe checkout completes for a paid plan.
**Trigger**: `lib/email.ts:sendSubscriptionActivatedEmail` from the Stripe webhook handler.
**Subject**: `Subscription active — welcome to Recruiting ATS`
**Body**:
> {firstName}, you're all set
>
> Your subscription to **Recruiting ATS** is now active. Thanks for trusting us with **{organizationName}**'s recruiting workflow.
>
> | Plan | {N} seats · ${monthlyTotal}/month |
> | Billing | Monthly, auto-renewed |
>
> You can [manage billing](...) — update your payment method, download invoices, or cancel — any time from your settings. Stripe will email you a receipt for every payment.
>
> If you add or remove teammates the bill adjusts automatically on your next invoice.
>
> Reply to this email if anything's confusing or you'd like to chat — we read every message.
>
> CTA: **Open Dashboard**

### 1.22 Subscription canceled (scheduled)
**Situation**: Admin cancels via Stripe Customer Portal — sub stays ACTIVE until `cancelAt`.
**Trigger**: `lib/email.ts:sendSubscriptionCanceledEmail` from the Stripe webhook.
**Subject**: `Subscription canceled — access until ${cancelStr}`
**Body**:
> {firstName}, we got your cancellation
>
> Your **Recruiting ATS** subscription for **{organizationName}** is scheduled to cancel.
>
> | Access until | {cancelStr} |
> | After that | You'll lose access to create new data. Your existing candidates, jobs and clients stay in our DB. |
>
> Changed your mind? [Reactivate]({reactivateUrl}) before {cancelStr} and keep everything as it is — no new charge until your normal billing cycle.
>
> If we can do something to keep you on board, just reply — we read every email.
>
> CTA: **Reactivate subscription**

### 1.23 Subscription ended
**Situation**: The `cancelAt` date arrives and Stripe deletes the subscription.
**Trigger**: `lib/email.ts:sendSubscriptionEndedEmail` from the webhook.
**Subject**: `Your Recruiting ATS subscription has ended`
**Body**:
> {firstName}, your subscription has ended
>
> Your **Recruiting ATS** subscription for **{organizationName}** ended today.
>
> Your data is safe — we keep it in our DB so you can pick up where you left off. To regain access:
> - [Resubscribe]({resubscribeUrl}) — same price, your candidates and pipeline come back instantly.
> - Reply to this email if you'd like to chat about your experience or ask for a custom plan.
>
> Thanks for using Recruiting ATS, whatever you decide.
>
> CTA: **Resubscribe**

### 1.24 Subscription reactivated
**Situation**: Admin clicked "Don't cancel after all" in Stripe Portal before the cancelAt date.
**Trigger**: `lib/email.ts:sendSubscriptionReactivatedEmail` from the webhook.
**Subject**: `Subscription reactivated — welcome back`
**Body**:
> {firstName}, glad to have you back
>
> Your **Recruiting ATS** subscription for **{organizationName}** is back on track. No cancellation pending.
>
> Next billing date: **{dateStr}**. Same plan, same seats — billing continues uninterrupted.
>
> If you reactivated by accident, you can cancel again from [Settings → Billing](...).
>
> CTA: **Open Dashboard**

### 1.25 Payment failed
**Situation**: Stripe `invoice.payment_failed` fires. Sub will move to past_due if not resolved.
**Trigger**: `lib/email.ts:sendPaymentFailedEmail` from the webhook.
**Subject**: `Action required: payment failed for Recruiting ATS`
**Body**:
> {firstName}, your payment didn't go through
>
> We tried to charge your card for **Recruiting ATS** — **{organizationName}** — and the bank declined it.
>
> To avoid losing access, update your payment method:
>
> CTA: **Update payment method**

---

## 2. In-app notifications

The bell icon in topbar shows `UserNotification` rows (agency side) and `ClientNotification` rows (client portal side). Wrapper helpers live in `lib/notify-user.ts`, `lib/chat-notifications.ts`, and `lib/job-status-notifications.ts`.

### 2.1 You were @mentioned (submission thread)
**Situation**: Someone @-mentioned the recipient in a comment on a candidate submission.
**Trigger**: `lib/chat-notifications.ts:91` from `POST /api/comments`.
**Title**: `${authorName} mentioned you`
**Body**: `[truncate of comment, 140 chars]`
**Link**: `/candidates/${candidateId}?submissionId=${submissionId}`

### 2.2 New comment on shared submission (audience)
**Situation**: A client posts a CLIENT_VISIBLE reply on a shared submission → every assigned recruiter sees a notification.
**Trigger**: `lib/chat-notifications.ts:239` from `POST /api/comments`.
**Title**: `New comment on ${candidateName} — ${jobTitle}` (jobTitle is `"Title"` or `"Title @ ClientName"`)
**Body**: `${authorName} (client): ${truncate(preview, 120)}`
**Link**: `/candidates/${candidateId}?submissionId=${submissionId}`

### 2.3 Candidate-level note (mention or owner ping)
**Situation**: Any staffing user posts on a candidate's general notes (no submissionId).
**Trigger**: `lib/chat-notifications.ts:317`.
**Title (mention)**: `${authorName} mentioned you`
**Title (owner)**: `${authorName} commented on ${candidateName}`
**Body**: `[truncate, 140]`
**Link**: `/candidates/${candidateId}`

### 2.4 Job-level note (Notes tab)
**Situation**: A staffing user posts in the Notes tab of a Job.
**Trigger**: `lib/chat-notifications.ts:403`.
**Title (mention)**: `${authorName} mentioned you in ${jobLabel}`
**Title (assignee)**: `${authorName} commented on ${jobLabel}`
**Body**: `[truncate, 140]`
**Link**: `/jobs/${jobId}`

### 2.5 Client invited you to a search (recruiter side)
**Situation**: A client clicked "Invite firm" with the email of a registered recruiter.
**Trigger**: `app/api/client-portal/invite-firm/route.ts:194` and `lib/process-pending-invites.ts:58` (for invites that arrived before the recruiter had an account).
**Title**: `${client.name} invited you to work on ${jobTitle}`
**Body**: `[message from the inviter — free-form text]`
**Link**: `/engagements`

### 2.6 Teammate joined your team
**Situation**: An invited teammate just accepted the invite (manual or OAuth path).
**Trigger**: `app/api/invite/[token]/route.ts:236` and `lib/oauth-accept-staffing-invite.ts:209`.
**Title**: `${name} joined your team`
**Body**: `${email} accepted your invitation to ${organizationName}.`
**Link**: `/settings/team`

### 2.7 You've been assigned to a job
**Situation**: An admin/teammate assigned you to a Job.
**Trigger**: `app/api/jobs/[id]/assignments/route.ts:107` via `notifyUserIfActive`.
**Title**: `${assignerName} added you to ${jobTitle}`
**Body**: `${role} · ${clientName}` (whichever is set)
**Link**: `/jobs/${id}`

### 2.8 (Client side) You were @mentioned on a submission
**Trigger**: `lib/chat-notifications.ts:128`.
**Title**: `${authorName} mentioned you`
**Body**: `[truncate, 140]`
**Link**: `/client-portal/candidates/${submissionId}`

### 2.9 (Client side) New comment from your recruiter
**Trigger**: `lib/chat-notifications.ts:204`.
**Title**: `New comment on ${candidateName} — ${jobTitle}`
**Body**: `${authorName} (recruiter): ${truncate(preview, 120)}`
**Link**: `/client-portal/candidates/${submissionId}`

### 2.10 (Client side) You were @mentioned in a Job's Notes tab
**Trigger**: `lib/chat-notifications.ts:476`.
**Title**: `${authorName} mentioned you in ${jobTitle}`
**Body**: `[truncate, 140]`
**Link**: `/client-portal/jobs/${jobId}`

### 2.11 (Client side) Job paused
**Situation**: The agency moved the Job's status to ON_HOLD. Only ClientJobMembers are notified. FILLED / CANCELLED / LOST are intentionally not notified.
**Trigger**: `lib/job-status-notifications.ts:63`.
**Title**: `${firmName} paused the search for ${jobTitle}`
**Body**: `The search is on hold. Check in with your recruiter to find out what's next.`
**Link**: `/client-portal/jobs/${clientJobId}`

### 2.12 (Client side) New candidate shared
**Trigger**: `app/api/submissions/[id]/route.ts:304`.
**Title**: `New candidate for ${jobTitle}`
**Body**: `${candidateName} was shared by ${recruiterName}. Note attached.` (the ". Note attached." suffix only when a share-note was added)
**Link**: `/client-portal/candidates/${submissionId}`

### 2.13 (Client side) You've been added to a job (agency-managed)
**Trigger**: `app/api/jobs/[id]/client-portal-access/route.ts:114`.
**Title**: `${inviterName} added you to ${jobTitle}`
**Body**: `Open the search to review shared candidates.`
**Link**: `/client-portal/jobs/${mirrorId}`

### 2.14 (Client side) Firm accepted your search
**Situation**: A recruiter accepted the client's invitation.
**Trigger**: `app/api/engagements/[id]/route.ts:223` (named inviter) and `:237` (orphan fallback — broadcasts to the whole client team).
**Title**: `${firmName} accepted ${jobTitle}`
**Body**: `They can start sharing candidates now.`
**Link**: `/client-portal/jobs/${clientJobId}`

### 2.15 (Client side) Portal share — agency invited you
**Situation**: First-time portal share or a generic "share with client" invite from the agency side.
**Trigger**: `app/api/client-portal/tokens/route.ts:383`.
**Title**: `${firmName} shared ${jobTitle} with you` (or `${firmName} invited you to the client portal` if no job)
**Body**: `${candidateCount} candidates shared. Open the portal to review.` (or null if no job)
**Link**: `/client-portal/jobs/${mirroredClientJobId}` (fallback `/client-portal/dashboard`)

### 2.16 (Client side) Teammate added you to a search
**Trigger**: `app/api/client-portal/jobs/[id]/members/route.ts:170` and `add-member/route.ts:129`.
**Title**: `${inviterName} added you to ${jobTitle}` (inviterName = `"A teammate"` if missing)
**Body**: `Open the search to review shared candidates.`
**Link**: `/client-portal/jobs/${id}`

---

## 3. Confirmation dialogs

The codebase has two shared confirmation primitives:
- `<DeleteConfirmDialog>` in `components/ui/delete-confirm-dialog.tsx`. Default title `Delete {itemLabel}?`, default description `"This action cannot be undone and will permanently remove this {itemKind} from the database."`, default confirm `"Yes, delete"`, cancel `"Cancel"`. Has an optional "consequences" list (`"This will also be deleted:"`) and optional billing-impact block.
- `confirmDialog()` (imperative) in `components/ui/confirm-dialog.tsx`. Mounted via `<ConfirmDialogHost>` in the root layout. Default confirm label `"Yes, continue"`.

### 3.1 Delete candidate (single)
**Gates**: `DELETE /api/candidates/${id}`.
**Where**: `app/(dashboard)/candidates/[id]/page.tsx:422`.
- Title: `Delete ${firstName} ${lastName}?`
- Description (default).
- Consequences (conditional): `${N} job submission(s)`, `${N} logged interview(s)`, `${N} attached document(s)`.
- Extra toggle: `Also remove their historical metrics` — `"Checked: their history events (interviews, stage transitions, etc.) are removed too and past dashboard metrics drop. Unchecked: the candidate is removed but their past activity still counts in reporting."`
- Confirm: `Yes, delete`.

### 3.2 Bulk delete candidates
**Gates**: `DELETE /api/candidates` (batch).
**Where**: `app/(dashboard)/candidates/page.tsx:789`.
- Title: `Delete ${N} candidate(s)?`
- Consequences: `Their job submissions`, `Their interview history`, `All their activity and notes`.
- Confirm: `Yes, delete`.

### 3.3 Stop sharing submission with client
**Where**: `app/(dashboard)/candidates/[id]/page.tsx:456`.
- Title: `Stop sharing ${candidateName} with ${clientName}?`
- Description: `${clientName} will lose access to this submission for "${jobTitle}" immediately. You can re-share later, but any client-side feedback or stage tracking on this submission won't be visible to them until you do.`
- Confirm: `Yes, stop sharing`.

### 3.4 Remove candidate from a job
**Where**: `app/(dashboard)/candidates/[id]/page.tsx:479`.
- Title: `Remove this candidate from "${jobTitle}"?`
- Description: `The submission and any per-job notes / activity tied to it will be removed. The candidate stays on file and on every other job they're assigned to.`
- Confirm: `Yes, remove`.

### 3.5 Delete attached document (candidate)
**Where**: `app/(dashboard)/candidates/[id]/page.tsx:497`.
- Title: `Delete ${docName}?`
- Confirm: `Yes, delete`.

### 3.6 Move candidate out of "Placed" stage
**Where**: `app/(dashboard)/candidates/[id]/page.tsx:250` (`confirmDialog()`).
- Title: `Move out of "Placed"?`
- Description: `This candidate has a placement on "${jobTitle}". Moving out of "Placed" will permanently delete the placement (salary, fee, payment terms).`
- Confirm: `Yes, move out`.

### 3.7 Stop sharing from kanban / list view
**Where**: `components/pipeline/kanban-card.tsx:240` and `components/pipeline/submissions-list-view.tsx:316`.
- Title: `Stop sharing ${firstName} ${lastName}?`
- Description: `${clientName} will lose access to this candidate's profile, documents and chat. Internal history is preserved.`
- Confirm: `Yes, stop sharing`.

### 3.8 Delete saved view (jobs)
**Where**: `app/(dashboard)/jobs/page.tsx:324`.
- Title: `Delete ${viewName}?`
- Confirm: `Yes, delete view`.

### 3.9 Delete job (single or bulk, list page)
**Where**: `app/(dashboard)/jobs/page.tsx:1022` and `:1036`.
- Title: `Delete ${N} job(s)?`
- Consequences: `The full candidate pipeline`, `Submissions, interviews and history`, `Linked documents`.
- Confirm: `Yes, delete`.

### 3.10 Change job to terminal status
**Where**: `app/(dashboard)/jobs/page.tsx:1056`.
- Title: `Mark "${jobTitle}" as ${statusLabel}?`
- Description (FILLED): `The search closes. Active candidates stay in the pipeline (history preserved), but the kanban freezes and the job stops accepting new submissions.`
- Description (other terminal): `The search closes. You'll still see the history but it stops accepting new submissions and disappears from the active list.`
- Confirm: `Yes, change status`.

### 3.11 Delete job from detail page
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:2651`.
- Same shape as 3.9 plus dynamic consequences: `${N} pipeline submission(s)`, `${N} interview(s) and their placements`, `${N} linked document(s)`.

### 3.12 Remove submission (job detail)
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:2672`.
- Default title, confirm `Yes, remove from pipeline`.

### 3.13 Remove team assignment from job
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:2683`.
- Default title, confirm `Yes, remove from job`.

### 3.14 Delete job document
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:2696`.
- Default title, kind `document`, confirm `Yes, delete`.

### 3.15 Cancel client-portal invite (from a Job)
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:212`.
- Title: `Cancel invite for ${label}?`
- Description: `They'll lose access to this search.`
- Confirm: `Yes, cancel`.

### 3.16 Move out of Placed (kanban)
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:639`.
- Title: `Move out of "Placed"?`
- Description: `This candidate has a placement record. Moving out of "Placed" will permanently delete the placement (salary, fee, payment terms).`
- Confirm: `Yes, move out`.

### 3.17 Re-parse JD
**Where**: `app/(dashboard)/jobs/[id]/page.tsx:2198`.
- Title: `Re-parse this JD?`
- Description: `We'll replace the description, and update Location / Work Arrangement if found in the new file.`
- Confirm: `Yes, re-parse`.

### 3.18 Remove client (single or bulk)
**Where**: `app/(dashboard)/clients/page.tsx:335,358` and `app/(dashboard)/clients/[id]/page.tsx:800`.
- Title (single): `Remove ${client.name} from your client list?`
- Description: `This will detach ${client.name} from your firm. Their jobs and shared data stay on file — you can re-engage with them later by accepting a new invite. The client portal side is not affected.`
- Confirm: `Yes, remove`.

### 3.19 Delete contact (on a client / contacts tab)
**Where**: `app/(dashboard)/clients/[id]/page.tsx:824`, `contacts/page.tsx:474`, and `app/(dashboard)/contacts/page.tsx:613`.
- Default title, kind `contact`, confirm `Yes, delete`.

### 3.20 Deactivate teammate
**Where**: `components/settings/deactivate-user-dialog.tsx` (instantiated in `app/(dashboard)/settings/team/page.tsx:715`).
- Title: `Deactivate ${userName}`
- Body: `They'll lose access immediately. All history (comments, past work, assignments) stays intact so you can reactivate later without losing anything.`
- Section "Active work today" lists: `Assigned to ${N} job(s)`, `Owner of ${N} candidate(s)`, `${N} active submission(s) in pipeline`, `${N} interview(s) scheduled upcoming`.
- Interview prompt: `Before deactivating, what should happen to the upcoming interviews?` with three options:
  - `Cancel them` — `Marks interviews as cancelled in the ATS. You'll still need to email candidates and clients manually to let them know.`
  - `Reassign to another teammate` — `Transfers ownership and interviewer slot to whoever you pick. They'll see the interviews on their calendar.`
  - `Keep them as-is` — `Don't touch the interviews. You'll handle them manually.`
- Seat-pool note (for paying orgs): `1 seat returns to your pool — your monthly bill won't change. You can assign it to a new teammate or remove it from your subscription anytime in Settings → Billing → Manage seats.`
- Expander: `View list of upcoming interviews (${N})`
- Confirm: `Deactivate` (red, loading `Deactivating…`).

### 3.21 Confirm-add-seat (invite or reactivate path)
**Where**: `components/billing/confirm-add-seat-dialog.tsx`.
- Title (invite): `Confirm invite` / (reactivate): `Confirm reactivation`
- Body lead (invite, named): `Inviting **${name}** will give them access to the ATS` + one of:
  - Pool full: ` once you have an available seat.`
  - Trial: ` — no charge during your trial.`
  - Active+pool has space: ` with a seat from your pool.`
- Body lead (reactivate): identical shape with "Reactivating".
- Body fallback (no name): `Inviting/Reactivating this teammate will give them ATS access.`
- Seat usage block: heading `Seat usage`; rows `Currently in use`, `After this {invite|reactivate}`.
- Pool-full warning: `All seats are in use. Buying 1 more seat adds $20/mo to your subscription and {invites|reactivates} ${name} automatically.`
- Trial note: `You're in trial — invite as many teammates as you want. When you subscribe, you'll choose how many seats to keep.`
- Confirm (default): `Confirm and invite` / `Confirm and reactivate` (loading: `Sending invite…` / `Reactivating…`).
- Confirm (pool full): `Buy seat & invite` / `Buy seat & reactivate` (loading: `Buying seat…`).
- Cancel: `Cancel`.

### 3.22 Manage seats
**Where**: `components/billing/manage-seats-dialog.tsx`.
- Title: `Manage seats`.
- Body: `Buy the number of seats your team needs and assign them by inviting teammates. You currently have **${N}** active teammate(s).`
- Section `Seats` with − / + buttons; rows `Per seat` ($20/mo), `${N} seat(s)` ($X/mo), `Change` (+/− $X/mo).
- Trial note: `You're in trial — no charge yet. When the trial ends, you'll start paying for **${X}/mo**.`
- Increase note: `Available immediately. New seats can be assigned from the Team page. The new amount applies to your next invoice (no mid-cycle proration charges).`
- Decrease note: `Lower charge from next cycle. Your next invoice will be ${X}/mo. Deactivated members keep their freed seat available for future invites.`
- Validations: `Must be at least 1 seat.` / `You have ${N} active teammates. Deactivate ${M} from Team first.` / `Above 100 requires manual setup — contact support.`
- Confirm: `Buy seats` (up) / `Reduce seats` (down) / `No change` (disabled); loading `Updating…`.

### 3.23 Subscribe (checkout flow dialog)
**Where**: `components/billing/subscribe-options-dialog.tsx`.
- Title: `Subscribe`.
- Body (multi-teammate): `You have **${N} active teammates** using the ATS. Pick how many seats to keep and who they belong to.`
- Body (single-user): `Pick how many seats you want. You can add or remove seats any time from billing settings.`
- Selector subtitle: `${X}/mo · $20/seat`.
- Teammate picker header: `Choose who keeps access` — `${N} / ${max} selected` — `You take 1 seat as admin. Pick ${N} more teammate(s) who'll keep access. The others will be deactivated and can be reactivated later.`
- Deactivation warning: `**${N} teammate(s) will lose access.** Their data stays intact — reactivate them later by buying more seats.`
- Reassurance: `Your card won't be charged today. You have ${N} day(s) of free trial left — billing of **${X}/mo** starts on **${trialEndStr}**. Cancel anytime before then.`
- Confirm: `Continue to checkout` (loading `Opening Stripe…`).
- Footer: `$20/seat per month · Cancel anytime`.

### 3.24 Cancel pending invite (settings/team)
**Where**: `app/(dashboard)/settings/team/page.tsx:785`.
- Title: `Cancel this invitation?`
- Description: `The invite for ${email} will be revoked. They won't be able to use the original link anymore — you'll need to send a new invite if you change your mind.` (fallback: `The invite will be revoked.`)
- Confirm: `Yes, cancel invite`.

### 3.25 Promote / demote role
**Where**: `app/(dashboard)/settings/team/page.tsx:809`.
- Title: `Promote ${name} to admin?` OR `Demote ${name} to user?`
- Description (promote): `Admins can manage billing, invite and remove teammates, change roles, and access every job in the workspace.`
- Description (demote): `They'll lose admin powers (billing, member management, full job access). Their job assignments stay intact.`
- Confirm: `Yes, promote` / `Yes, demote`.

### 3.26 Delete placement
**Where**: `components/placements/placement-dialog.tsx:1559`.
- Default title; kind `placement`.
- Consequences: `The candidate returns to the previous pipeline stage`, `The commission record and related metrics will be removed`.
- Confirm: `Yes, delete placement`.

### 3.27 Delete interview (from dialog or calendar)
**Where**: `components/interviews/interview-dialog.tsx:512` and `app/(dashboard)/calendar/page.tsx:1890`.
- Default title; kind `interview`.
- Consequences: `Linked feedback and notes`, `Any linked calendar events`.
- Confirm: `Yes, delete`.

### 3.28 Delete interview attachment
**Where**: `components/interviews/interview-attachments.tsx:149`.
- Kind `attachment`; default copy; confirm `Yes, delete`.

### 3.29 Delete generic calendar event
**Where**: `app/(dashboard)/calendar/page.tsx:1905`.
- Kind `event`; default copy; confirm `Yes, delete`.

### 3.30 Bulk delete contacts
**Where**: `app/(dashboard)/contacts/page.tsx:613`.
- Title: `Delete ${N} contact(s)?`; confirm `Yes, delete`.

### 3.31 Remove company logo
**Where**: `components/logo-uploader.tsx:186`.
- Title: `Remove company logo?`
- Description: `The logo disappears from the sidebar and any client-facing pages immediately. You can upload a new one anytime.`
- Confirm: `Yes, remove`.

### 3.32 Disconnect Google
**Where**: `app/(dashboard)/settings/profile/page.tsx:49`.
- Title: `Disconnect Google?`
- Description: `You'll need to reconnect to create Meet links.`
- Confirm: `Yes, disconnect`.

### 3.33 (Client portal) Delete job
**Where**: `app/client-portal/jobs/page.tsx:530`.
- Kind `job`; consequences `Firm invitations (engagements)`, `Linked documents and candidates`; confirm `Yes, delete`.

### 3.34 (Client portal) Delete job document
**Where**: `app/client-portal/jobs/[id]/page.tsx:2362`. Kind `document`; default; confirm `Yes, delete`.

### 3.35 (Client portal) Withdraw firm engagement
**Where**: `app/client-portal/jobs/[id]/page.tsx:2374`.
- itemLabel: `the invitation to ${firmLabel}`. Confirm: `Yes, withdraw`.

### 3.36 (Client portal) Cancel pending firm invite
**Where**: `app/client-portal/jobs/[id]/page.tsx:2385`.
- itemLabel: `the invitation to ${email}`. Confirm: `Yes, cancel`.

### 3.37 (Client portal) Cancel teammate per-job invite
**Where**: `app/client-portal/jobs/[id]/page.tsx:2400`.
- Title: `Cancel the invite for ${label}?`
- Description: `They'll lose access to this search immediately. You can re-invite them later if needed.`
- Confirm: `Yes, cancel invite`.

### 3.38 (Client portal) Remove team member / cancel team invitation
**Where**: `app/client-portal/my-team/page.tsx:560` and `:571`.
- itemLabel: member name or `the invitation to ${email}`. Confirm: `Yes, remove from team` / `Yes, cancel invitation`.

[REVIEW] Same flows on `app/client-portal/settings/page.tsx:241,257` use plain `confirmDialog()` with shorter copy (`Remove team member?` / `This cannot be undone.`) — and `client-portal/my-team/page.tsx` DOES NOT gate `Remove`/`Cancel invite` with a confirm at all on some code paths (see Toast section). Recommend unifying so the destructive confirm is consistent.

### 3.39 (Client portal) Remove team member (dashboard inline)
**Where**: `app/client-portal/dashboard/page.tsx:949`.
- Default; confirm `Yes, remove from team`.

---

## 4. Toast messages

Toasts surface via `showToast(message, type = "error")`. Default variant is **error (red)**. Several "success" toasts pass no second arg → they still render red. Flagged inline.

### Agency dashboard — candidates
- `app/(dashboard)/candidates/[id]/page.tsx:226` — `"Couldn't delete the candidate"` — DELETE candidate failed after dialog confirm.
- `app/(dashboard)/candidates/[id]/page.tsx:304,309` — `"Failed to change stage"` — inline stage select on Jobs tab.

### Agency dashboard — clients
- `app/(dashboard)/clients/[id]/page.tsx:124,131` — `"Failed to save"` — Client edit form (`PUT /api/clients`).
- `app/(dashboard)/clients/[id]/page.tsx:264,267` — `"Failed to remove client."` — Remove client.

### Agency dashboard — jobs
- `app/(dashboard)/jobs/page.tsx:560` — `"Couldn't delete the job. Please try again."` — bulk/single delete.
- `app/(dashboard)/jobs/page.tsx:605` — `"Couldn't update status. Try again."` — optimistic kanban status flip rollback.
- `app/(dashboard)/jobs/[id]/page.tsx:369,375` — `"Failed to save"` — job edit form.
- `app/(dashboard)/jobs/[id]/page.tsx:860,886` — `"Upload failed"` — document upload.
- `app/(dashboard)/jobs/[id]/page.tsx:867` — `` `Document uploaded but text extraction failed: ${parseError}` `` — parse failure post-upload.
- `app/(dashboard)/jobs/[id]/page.tsx:869` — `"Document uploaded but no text could be extracted from the file."` — parse returned nothing.
- `app/(dashboard)/jobs/[id]/page.tsx:461` — `"Resume parsed — review the fields below."` — success (still red).
- `app/(dashboard)/jobs/[id]/page.tsx:1373` — `"Failed to parse resume. Try a .txt file for best results."`
- `app/(dashboard)/jobs/[id]/page.tsx:1146` — `` `Invite sent to ${email}! They'll be asked to sign up or log in to view candidates.` ``

### Agency dashboard — settings/team
- `app/(dashboard)/settings/team/page.tsx:167` — `"All seats are in use."`
- `app/(dashboard)/settings/team/page.tsx:170` — `"Failed to send invite"`
- `app/(dashboard)/settings/team/page.tsx:179` — `"Invitation sent!"`
- `:220` — `` `${userName} reactivated` ``
- `:225` — `"Failed to update user"`
- `:241` — `"User promoted to admin"` / `"Admin demoted to user"`
- `:246` — `"Failed to change role"`
- `:284` — `"Invite resent!"`
- `:732` — `` `${userName} deactivated ${suffix}` `` (suffix: `(${N} interview(s) cancelled|reassigned)`)

### Agency dashboard — profile
- `app/(dashboard)/settings/profile/page.tsx:117` — `"Profile updated"`
- `:121` — `"Failed to update"`
- `:124,156` — `"Something went wrong"`
- `:135` — `"Passwords do not match"`
- `:146` — `"Password changed successfully"`
- `:153` — `"Failed to change password"`

### Agency dashboard — billing
- `app/(dashboard)/settings/billing/page.tsx:69` — `"We couldn't load your billing info. Please try again or contact support."`
- `:77` — `"We couldn't reach our servers. Check your connection and try again."`
- `:128` — `"Couldn't reach Stripe to start checkout. Please try again in a moment."`
- `:132,153,184` — `"Network error. Please try again."`
- `:149` — `"Couldn't open the billing portal. Please try again or contact support."`
- `:180` — `"Couldn't open the billing portal to reactivate. Please try again."`
- `components/billing/manage-seats-dialog.tsx:109` — `"Couldn't update seats. Please try again."`
- `components/billing/confirm-add-seat-dialog.tsx:110,120` — `"Couldn't buy seat. Try again."`
- `components/billing/subscribe-options-dialog.tsx:162` — `"Couldn't start checkout. Please try again."`

### Agency dashboard — integrations
- `app/(dashboard)/settings/integrations/page.tsx:87` — `"Google Calendar connected. Interviews will auto-generate Meet links."`
- `:93` — `"Connection cancelled. You can try again anytime."`
- `:99` — `"Failed to connect Google Calendar."`
- `:105` — `"Microsoft Teams connected. Interviews will auto-generate Teams meetings."`
- `:111` — `"Microsoft connection cancelled. You can try again anytime."`
- `:117` — `"Failed to connect Microsoft Teams."`

### Client portal — settings
- `app/client-portal/settings/page.tsx:148` — `"Profile updated"`
- `:151` — `"Failed to update"`
- `:154,187,225,283` — `"Something went wrong"`
- `:166` — `"Passwords do not match"`
- `:177` — `"Password changed successfully"`
- `:184` — `"Failed to change password"`
- `:210` — `"Failed to invite"`
- `:214` — `"Team member reactivated!"` / `"Invitation created!"`
- `:250` — `"Failed to remove"` — after confirm.
- `:265` — `"Failed to cancel invite"`.
- `:278` — `"Failed to resend invite"`.
- `:280` — `"Invite resent."` OR `"Invite link refreshed (email delivery failed — copy the link manually)."` — [REVIEW] both render red.
- `:297` — `"Failed to change role"`.

### Client portal — my-team
- `app/client-portal/my-team/page.tsx:142` — `"Failed to invite"`.
- `:146` — `"Team member reactivated."` / `"Invitation sent."`.
- `:157,209` — `"Something went wrong"`.
- `:176` — `"Failed to remove"` — [REVIEW] no confirm before this destructive action; settings page DOES gate it.
- `:185` — `"Failed to cancel invite"` — same comment.
- `:200` — `"Failed to resend invite"`.
- `:204-205` — `"Invite resent."` / `"Invite link refreshed (email delivery failed — copy the link manually)."`.
- `:223` — `"Failed to change role"`.

### Client portal — jobs
- `app/client-portal/jobs/[id]/page.tsx:463,472` — `"Upload failed"`.
- `:552` — `"Member invited and added to this job."`.
- `:554` — `"Added to this job. We let them know by email."`.
- `:556` — `"Already on this search."`.
- `:549` — `"Failed to add"`.
- `:569` — `"Something went wrong"`.
- `:636` — `"Signup email sent — they'll join and see this job on first login."`.
- `:638` — `"Invitation sent by email and in-app. Waiting for their response."`.
- `:641` — `` `${okCount} invitations sent${ (some include signup links)}.` ``.
- `:646` — `` `${okCount} sent, ${failed.length} failed: ${emails}` ``.
- `:651` — `"Failed to invite"`.
- `:676` — `"Could not withdraw invitation"`.
- `:688` — `"Could not cancel invitation"`.

### Client portal — dashboard
- `app/client-portal/dashboard/page.tsx:177` — `"Failed to invite"`.
- `:181` — `"Team member reactivated!"` / `"Invitation created!"`.
- `:191,1001` — `"Something went wrong"`.
- `:995` — `"Could not save"` — onboarding stub form.

### Client portal — feedback (public token view)
- `app/client-portal/[token]/page.tsx:937` — `"Feedback submitted successfully!"`.

[REVIEW] **All toasts render red because no consumer passes the variant arg.** Several success messages above ("Invitation sent!", "Profile updated", "Invite resent.") are styled as errors. This is a real bug.

[REVIEW] Copy style across error toasts is inconsistent: `"Failed to save"` vs `"Couldn't delete the candidate"` vs `"Failed to remove client."` (trailing period inconsistent, "Couldn't" / "Failed to" inconsistent, retry CTA only in some).

---

## 5. API error messages (user-facing)

Grouped by feature area. Status codes and triggers included where known. Generic `"Failed"` / `"Not found"` / `"Unauthorized"` boilerplate omitted.

### 5.1 Auth / invites / verification

- `POST /api/auth/register:23` (400) — `"Email already registered"`.
- `POST /api/auth/onboarding:37` (404) — `"Organization not found"`.
- `POST /api/auth/verify-email:42` (400) — `"Invalid or expired verification link"`.
- `POST /api/auth/verify-email:56` (400) — `"Verification link expired. Request a new one from the dashboard."`
- `POST /api/auth/forgot-password:18` (400) — `"Email is required"`.
- `POST /api/auth/reset-password:14` (400) — `"Password must be at least 8 characters"`.
- `POST /api/auth/reset-password:25` (400) — `"This reset link is invalid or has expired"`.
- `POST /api/auth/client-reset-password:25` (400) — `"This reset link is invalid or has expired"`.
- `GET /api/invite/[token]:28` (404) — `"Invitation not found"`.
- `GET /api/invite/[token]:53` (400) — `"This invitation has expired"`.
- `POST /api/invite/[token]:83` (400) — `"Name and password required"`.
- `POST /api/invite/[token]:101` (400) — `"Invalid or expired invitation"`.
- `POST /api/invite/[token]:115` (402) — `"All seats are in use right now. Ask the admin to add a seat before accepting."` — closes admin-reduced-seats-between-invite-and-accept hole.
- `POST /api/invite/[token]:134` (400) — `"A user with this email already exists. Please sign in instead."`.
- `POST /api/profile:144` (400) — `"Current and new password required"`.
- `POST /api/profile:147` (400) — `"New password must be at least 8 characters"`.
- `POST /api/profile:158,172` (400) — `"No password set"`.
- `POST /api/profile:160,174` (400) — `"Current password is incorrect"`.

### 5.2 Billing / subscription / seats

- `POST /api/admin/billing/checkout:55` (400) — `"Select exactly ${expectedKeepCount} teammate${s} to keep before subscribing with fewer seats."`
- `POST /api/admin/billing/checkout:71` (400) — `"Invalid teammate selection. Please retry."`
- `POST /api/admin/billing/checkout:108` (400) — `"Self-serve plans top out at ${TEAM_MAX_SEATS} seats — contact us for more."`
- `POST /api/admin/billing/portal:19` (400) — `"No active billing"`.
- `POST /api/admin/billing/update-seats:36` (403) — `"Only workspace admins can manage seats."`
- `:47` (400) — `"Seats must be at least 1."`
- `:53` (400) — `"Seats must be a whole number."`
- [REVIEW] `:60` (400) — `"Seats above ${SEAT_HARD_CAP} require manual setup. Reach out to contact@alphabridgepartners.com."` — hardcoded email in error string.
- `:79` (404) — `"No subscription found for this workspace."`
- `:86` (400) — `"Complimentary accounts don't manage seats manually."`
- `:111` (400) — `"You have ${activeUsersCount} active teammates. Deactivate ${activeUsersCount - requestedSeats} from Team settings before reducing seats below ${activeUsersCount}."`
- `:140` (400) — `"Subscription is canceled. Resubscribe before purchasing more seats."`
- [REVIEW] `:154` (500) — `"Stripe subscription has no item. Contact support."` — internal Stripe term leaked to user.
- `lib/seat-availability.ts:47` (402) — `"No subscription configured for this workspace."`
- `:71` (402) — `"Subscription is canceled. Resubscribe to invite teammates."`
- `:88` (402) — `"You're using ${currentActiveUsers} of ${subscription.seats} seats. Buy ${missing} more seat${s} to invite this teammate."`

### 5.3 Team / members / users

- `POST /api/admin/users:48` (400) — `"Email already in use"`.
- `PATCH /api/admin/users:99` (400) — `"You cannot deactivate yourself"`.
- `:102` (400) — `"You cannot demote yourself"`.
- `:119` (400) — `"There must be at least one admin"`.
- `POST /api/admin/users/[id]/deactivate:46` (404) — `"User not found or already inactive"`.
- `:166` (400) — `"There must be at least one admin"`.
- `:175` (400) — `"reassignToUserId is required when reassigning interviews"`.
- `:189` (400) — `"Selected teammate is not active in this organization"`.
- `POST /api/admin/invites:51` (400) — `"User already exists in your organization"`.
- `:62` (400) — `"An invite is already pending for this email"`.
- `POST /api/admin/invites/[id]/resend:50` (400) — `"This invite was already accepted"`.

### 5.4 Jobs

- `POST /api/jobs:88` (400) — `"Client not found"`.
- `GET /api/jobs/[id]:152` (404) — `"pending_engagement"` (code) — paired with engagementId for the engagement-redirect.
- `PATCH /api/jobs/[id]:383,396,401` (400) — `"Invalid status"`, `"Invalid notes"`, `"Nothing to update"`.
- `POST /api/jobs/[id]/documents:72` (500) — `"File uploads are not configured. Enable Vercel Blob storage in the project settings."` [REVIEW] dev-leak.
- `:114` (400) — `"File exceeds 10MB limit"`.
- `:117` (400) — `"Unsupported file type: ${file.type}"`.
- `POST /api/jobs/[id]/client-portal-access:60` (400) — `"This job isn't shared with the client portal yet. Use Invite Client to share it first."`
- `POST /api/jobs/[id]/submissions:37` (400) — `"No pipeline stages"`.
- `:53` (400) — `"Candidate already in this pipeline"`.
- `POST /api/jobs/[id]/assignments:83` (404) — `"User not found or inactive"`.
- `:134` (409) — `"User is already assigned to this job"`.

### 5.5 Candidates

- `POST /api/candidates/[id]/assign:76` (400) — `"No jobs selected"`.
- `:139` (403) — `"You don't have access to any of the selected jobs."`

### 5.6 Clients / contacts / engagements

- `POST /api/clients:103` (409) — code `duplicate_name` / message `"An existing client looks like the same company. Use it instead, or confirm to create anyway."`
- `POST /api/contacts:103` (400) — `"firstName, lastName, and clientId are required"`.
- `POST /api/contacts/[id]/invite-portal:59` (400) — `"This contact doesn't have a valid email yet — add one first."`
- `:80` (409) — `"Email already used at ${existing.client.name}"`.
- `:91` (409) — `"Already has portal access"`.
- `PATCH /api/engagements/[id]:41` (400) — `"Already responded"`.
- `:55` (403) — `"Only the invited recruiter can respond to this invitation"`.
- `:68` (402) — `e.message` (SubscriptionError) with code `subscription_required`.

### 5.7 Client portal

- `PATCH /api/client-portal/candidates/[submissionId]/stage:13` (403) — `"Pipeline stages are managed by your recruiting firm. Ask them to move the candidate forward."`
- `GET /api/client-portal/candidates/[submissionId]:75` (404) — `"Candidate not found or not shared"`.
- `POST /api/client-portal/candidates/[submissionId]/feedback:105` (400) — `"Provide at least a rating or a comment"`.
- `POST /api/client-portal/invite-firm:95` (400) — `"That email belongs to your own team. Recruiter invites go to people at the firm you want to engage, not to your colleagues."`
- `:112` (400) — `"That recruiter has already been invited to this job"`.
- `:118` (400) — `"A pending invitation is already out to that email"`.
- `GET /api/client-portal/[token]:15` (403) — `"Invalid or expired link"`.
- `POST /api/client-portal/register:11` (403) — `"The client portal is invite-only. Ask your recruiting partner to invite you."`
- `POST /api/client-portal/verify-email:50` (400) — `"Verification link expired. Request a new one from the sign-in page."`
- `PATCH /api/client-portal/jobs/[id]:37` (403) — `"This search was set up by your recruiting firm. Ask them to edit the search itself."`
- `:102` (403) — `"This search was set up by your recruiting firm. Ask them to close it."`
- `POST /api/client-portal/jobs/[id]/add-member:73` (403) — `"You can only add teammates at @${inviterDomain}. Ask an admin to add an external contact."`
- `POST /api/client-portal/set-password:101` (400) — `"This link has expired. Please ask your recruiter to resend."`
- `POST /api/client-portal/engagements/[id]:32` (400) — `"Only pending invitations can be withdrawn"`.
- `POST /api/client-portal/tokens:47` (404) — `"This client isn't in your firm's engagements. If you're sure it's the right company, open it from /clients first to re-engage."`
- `:65` (409) — `"This email is already in use by another client (${existing.client.name}). Use a different work or personal address for ${client.name}."`
- `POST /api/client-portal/team:79` (403) — `"You can only invite teammates at @${inviterDomain}. To invite someone with a different email domain, ask an admin."`
- `:102` (409) — `"A team member with this email already exists"`.
- `PATCH /api/client-portal/team/[id]:14` (403) — `"Only admins can modify team members"`.
- `:30` (400) — `"You cannot deactivate yourself"`.
- `:33` (400) — `"You cannot demote yourself"`.
- `:42` (400) — `"There must be at least one admin"`.
- `:70` (403) — `"Only admins can remove team members"`.
- `:84` (400) — `"You cannot remove yourself"`.
- `:93` (400) — `"Cannot remove the last admin"`.
- `POST /api/client-portal/jobs/[id]/comments:96` (400) — `"Selected firm isn't engaged on this job"`.
- `:112` (400) — `"Multiple firms engaged — specify targetAgencyJobId to pick which one this message is for."`
- `POST /api/client-portal/jobs/[id]/documents:99` (403) — `"Files on this search are managed by your recruiting firm. Ask them to upload or replace the document."`
- `:223` (403) — `"Files on this search are managed by your recruiting firm."`
- `POST /api/client-portal/jobs/[id]/members:90` (403) — `"Only people already on this job can manage access."`

### 5.8 Comments

- `POST /api/comments:23` (400) — `"Staffing can only post INTERNAL or CLIENT_VISIBLE comments"`.
- `:52` (via `lib/comment-access.ts:91`) (403) — `"Share this candidate with the client before posting a client-visible note."`

### 5.9 Placements

- `POST /api/placements:154` (409) — `"A placement already exists for this submission"`.
- `:171` (400) — `"Either submissionId, or jobId + clientId, is required"`.
- `:183` (400) — `"Job does not belong to the given client"`.
- `:225` (400) — `"Job has no pipeline stages — can't place this candidate."`
- `:246` (409) — `"This candidate already has a placement on this job."`

### 5.10 Documents / file uploads

[REVIEW] Two strings: clean (`"File uploads are not configured."` in logo endpoints) vs dev-leak (`"File uploads are not configured. Enable Vercel Blob storage in the project settings."` in document/interview/job/client endpoints). Standardize.

- All upload endpoints: `"File is empty"`, `"File exceeds 10MB limit"` (or `"Logo exceeds 2MB limit"`), `"Unsupported file type: ${file.type}"`.

### 5.11 Other

- `POST /api/notifications:65` (400) — `"Nothing to mark"`.
- `POST /api/client-portal/notifications:78` (400) — `"Nothing to mark"`.
- `POST /api/import/bulk:133` (400) — `"Required field(s) not mapped: ${missing.join(', ')}"`.


---

## 6. Empty states + page headers (agency dashboard)

### 6.1 Dashboard home (`/dashboard`)
**Where**: `app/(dashboard)/dashboard/page.tsx`.
- L347 — Page H1: `Dashboard`
- L349 — Greeting: `Welcome back, {name}`
- L377 — Pending engagements banner: `{N} new engagement request(s)` / `Hiring companies want to work with you`
- L398 — Welcome banner (new users): `Welcome to Recruiting ATS!` / `Your workspace is ready. Follow these steps to get started.`
- L314-332 — Quick-start steps: `Add your first client` / `Set up a hiring company you recruit for` / `Create a job order` / `Open a search with a customizable pipeline` / `Add candidates` / `Start building your talent database`
- L442 — Migration banner (day 0): `Coming from another ATS?` / `Bring your candidates, clients, and open searches over in one shot — CSV or TSV from Bullhorn, JobAdder, Loxo, Crelate, or wherever you live today. The mapping wizard handles renamed columns.` / `Start importing` / `Your first day — 7 days left`
  - [REVIEW] Names specific competitors — confirm Bullhorn / JobAdder / Loxo / Crelate are still target migration sources.
- L481 — First-week invite banner: `Want backup on this? Add a teammate.` / `Welcome to the team — bring more people in.` / `Split searches, share notes on candidates, and chat with clients together. Free during your trial.`
- L262 — KPI tooltips: `Jobs in OPEN or ACTIVE status that you're assigned to. Searches the rest of the firm owns but didn't share with you don't count here.` / `Every candidate row in your firm's database. The trend chip compares the last 30 days of new candidates vs the prior 30.` / `Submissions that reached the Placed stage. The trend chip compares Placed transitions in the last 30 days vs the prior 30.` / `Hiring companies your firm is engaged with (linked via OrganizationClient). The global Client pool isn't counted — only the ones you're working with.`
  - [REVIEW] KPI tooltip mentions internal model name (`OrganizationClient`) — leak.
- L571-635 — Cards + empty states: `Activity (Last 14 Days)` / `Daily team activity across all actions` / `Recent Submissions` / `No submissions yet` / `Recent Activity` / `No activity yet`

### 6.2 Jobs list (`/jobs`)
- `app/(dashboard)/jobs/page.tsx:703` — Page H1: `Jobs / Searches` [REVIEW] dual naming used throughout the product.
- `:724` — Search placeholder: `Search by title or client...`
- `:859` — Empty states: `No jobs match your filters` / `You haven't been assigned to any jobs yet` / `Job visibility is strictly assignment-based. Ask an admin of your workspace to add you to a job so you can start working on it.` / `No jobs yet — create your first search.` / `Create job`
- `:1093` — Save view modal: `Save current view` / `Give your filter combination a name so you can apply it again later.` / `View name`

### 6.3 Job detail (`/jobs/[id]`)
- `app/(dashboard)/jobs/[id]/page.tsx:921` — 404: `Job not found.`
- `:1065` — Invite client dialog: `Invite Client to Portal` / `Enter the client contact's email. They'll receive an invite to sign up (or log in) to the client portal where they can review shared candidates for {jobTitle}.` / `client@company.com — start typing to find existing contacts` / `Existing contacts` / `Email already belongs to {clientName}. One email can only be at one client; use a different address for this share.` / `Invite sent to {email}! They'll be asked to sign up or log in to view candidates.`
- `:1191` — Add candidate dialog: `Add Candidate to Pipeline` / `Search existing` / `Create new` / `Search candidates by name...` / `No matches for "{query}".` / `Create new →` / `Already in pipeline` / `Upload resume to auto-fill` / `Parsing...`
- `:1709` — Empty: `Add a candidate to this job first.`
- `:1827` — Empty: `Nobody assigned yet. Use Manage to add teammates.`
- `:1905` — Portal access section: `No one from {clientName} has portal access to this search yet. Use Invite Client above to share it.` / `Search is mirrored on the client portal but nobody is registered yet.` / `No explicit members — everyone on the client team can see this search.`
- `:2266` — Upload helpers: `Upload Job Description` / `PDF, DOC, DOCX, TXT (max 10MB) — text will be extracted automatically` / `Upload Document` / `PDF, DOC, DOCX, TXT, PNG, JPG (max 10MB)`
- `:2384` — Manage portal access dialog: `Manage client portal access` / `Tick the people who should see this search on the client portal. Unchecking everyone reverts to the legacy "visible to the whole team" state.` / `Nobody on {clientName} has a portal account yet. Invite one below to get started.` / `Invite a new contact to the portal`
- `:2513` — Assign team dialog: `Assign Team Members` / `Currently Assigned` / `Add Team Member` / `No matching team members found` / `Add {N} member(s)`

### 6.4 New job (`/jobs/new`)
- `app/(dashboard)/jobs/new/page.tsx:503` — Clone banner: `Cloning from {title} ({status})` / `All fields pre-filled — edit anything before creating.`
- `:578` — Inline marker: `Auto-filled from document`
- `:640` — Client picker: `No clients yet — add one below.` / `Create "{query}" as a new client` / `Add a new client` / `Checking for duplicates…` / `This client already has a job with this title`
- `:794` — Fee terms callouts: `Fee terms pre-filled from client defaults — edit any to override` / `{clientName} is a Staff Augmentation client — set the fee terms for this specific search below.`
- `:876` — Duplicate-job dialog: `This client already has a job with this title` / `Open the existing job to reuse its pipeline, or create a new one anyway if this is a separate search.` / `Create anyway`
- `:946` — Quick-create client dialog: `Quick-create client` / `Add the company and (for Recruiting) the default fee terms. Website, contacts and other details live on the client page.` / `Default fee terms` / `Pre-fill every Job and Placement at this client. Override per-job as needed.` / `Days from start date to invoice due (Net 30 = 30).` / `Replacement window after the candidate starts.`

### 6.5 Candidates list / detail / new
- `app/(dashboard)/candidates/page.tsx:487` — Placeholder: `Search by name, email, title, company...`
- `:589` — Bulk select: `Selecting…` / `Select all {N} matching`
- `:622` — Empty: `No candidates match your filters` / `No candidates yet — start building your pipeline.` / `Add candidate` / `Import from CSV`
- `app/(dashboard)/candidates/[id]/page.tsx:372` — 404: `Candidate not found.`
- `:721` — Tabs: `Not submitted to any jobs yet.` / `Shared on {date} — click to stop sharing` / `Client sees: {stage}`
- `:981` — Notes intro: `Candidate notes` / `General · applies to every job` / `Assign this candidate to a job to start adding per-job notes.` / `Per-job notes` / `Tied to a specific submission · Internal + Client-visible tabs`
- `:783` — View-only tooltip: `You don't have access to this job — view only`
- `app/(dashboard)/candidates/[id]/edit/page.tsx:208` — `Recruiter that owns this candidate going forward. Past placements keep their own recruiter, so reporting on historical deals stays accurate.`
- `app/(dashboard)/candidates/new/page.tsx:390` — Sections: `Quick Add from Resume` / `Drop resume here or click to upload` / `Parse & Fill` / `Candidate Information`
- `:269` — Resume parse feedback: `Parsed successfully - filled {N} fields from resume.` / `Failed to parse resume. Try a .txt file for best results.`
- `:780` — Duplicate dialog: `This candidate is already in your database` / `Open the existing record to pick up where you left off, or create a new one anyway.`

### 6.6 Clients / new / detail
- `app/(dashboard)/clients/page.tsx:150` — `{N} companies` / `Search by name, industry, contact...` / `Remove from workspace` / `No clients yet — add the first company you work with.`
- `:181` — Filter options: `All types (N)` / `Headhunting / Recruiting (N)` / `Staff Aug / Outsourcing (N)`
- `app/(dashboard)/clients/new/page.tsx:258` — Return-to banner: `You're creating this client as part of a Job. Once you save, you'll be sent back to the Job form with this client selected and its fee defaults applied.`
- `:287` — Engagement type tabs: `Headhunting / Recruiting` / `Traditional contingent/retained search. You set default fee terms for this client and every search picks them up.` / `Staff Augmentation / Outsourcing` / `Every search negotiates its own economics. No defaults saved at the client level — you'll set fee + terms per search.`
- `:434` — Fee terms section: `These terms will auto-fill when creating a Job Order or Placement for this client.` / `No fee defaults on Staff Augmentation clients` / `You'll set the fee terms directly on each search when you create it. This keeps client-level terms blank when they don't apply across the whole relationship.`
- `:508` — Attachments: `MSA, fee schedule, NDAs, anything you want to pin on this client. Max 10MB each.` / `PDF, DOCX, XLSX, CSV, TXT, images`
- `:577` — Duplicate dialog: `This client may already exist` / `Open the existing record to avoid duplicating your pipeline, or create a new one anyway.`
- `app/(dashboard)/clients/[id]/page.tsx:272` — `Client not found.` / `Create Job for {clientName}` / `Remove Client` / `Engagement type` / `Staff Augmentation — per-search economics` / `Headhunting / Recruiting — defaults auto-fill per search`
- `:489` — Tabs: `Internal notes about this client...` / `Jobs / Searches` / `No jobs yet for this client.` / `Add Inline` / `Full Form` / `New contact` / `Primary contact` / `No contacts yet for this client.`
- `:732` — Portal status pills: `Primary` / `In portal` / `Pending` / `Inviting…` / `Add an email to invite`

### 6.7 Contacts page (`/contacts`)
- `app/(dashboard)/contacts/page.tsx:281` — `Contacts` / `{N} people across {M} clients` / `Active portal` / `Pending invite` / `No portal access` / `Search by name, email, company…` / `All clients` / `All statuses` / `No contacts yet` / `Add hiring managers and other client contacts from each client's page. You can invite them to the portal later, or right away.` / `Go to clients` / `No contacts match your filters.` / `Portal users have their own removal flow on the client page`

### 6.8 Engagements
- `app/(dashboard)/engagements/page.tsx:154` — `Engagements` / `No engagement requests yet.` / `{N} client(s) working across {M} job(s).`
- `:170` — Subscription banner: `You need an active subscription to accept engagement requests.` / `Go to Billing`
- `:188` — Stat tiles: `Clients engaged` / `Submitted` / `Offers` / `Placements`
- `:360` — Empty: `No engagement requests yet` / `When hiring companies invite your firm to work on their searches, they'll appear here.`
- `app/(dashboard)/engagements/[clientId]/page.tsx:108` — `You're not engaged with this client (yet).` / `Back to Engagements`

### 6.9 Calendar / interviews
- `app/(dashboard)/calendar/page.tsx:690` — Header: `Calendar` / `Interviews, follow-ups and reminders` / `{N} interview(s) scheduled this week` / `Event` / `Schedule Interview`
- `:313` — Milestone labels: `First day` / `Payment due` / `Guarantee expires`
- `:992` — Day-detail sidebar: `No events scheduled` / `Add event on this day` / `Schedule interview on this day` / `Click + to schedule an interview or the bell to add an event.`
- `:1359` — Internal-only banner: `Internal only — no invite was sent` / `The candidate wasn't emailed about this meeting.` / `Join Meeting`
- `:1384` — Sections: `Interviewers` / `Client Contacts` / `Scheduled by` / `Mark Completed` / `No Show` / `Feedback` / `Internal` / `Client`
- `:1629` — Upcoming sidebar: `Upcoming (7 days)` / `Nothing on the schedule for the next 7 days`
- `:1782` — Create chooser: `What do you want to create?` / `Event — Follow-up, reminder, personal block` / `Interview — Candidate / client meeting with optional invite`
- `components/interviews/interviews-list.tsx:74` — `No interviews scheduled yet.` / `{n} upcoming · {n} past hidden` / `Hide past` / `Show past ({n})` / `No upcoming interviews. All interviews for this row are completed or cancelled.`
- `components/interviews/interview-dialog.tsx:256` — `Edit interview` / `Schedule interview` / `Office address` / `Internal context, interviewers, prep notes...` / `Also email a calendar invite to the candidate` / `Off by default. Leave unchecked if the candidate already got the invite somewhere else.` / `Save & send invite`

### 6.10 Placements
- `app/(dashboard)/placements/page.tsx:321` — Header: `Placements` / `{N} placement(s)` / `New Placement` / `Failed to load placements`
- `:441` — HH/OS revenue cards: `Headhunting (HH)` / `Staff Aug (OS) · recurring · MRR` / `Revenue / fees in period` / `Placements / closed in period` / `Active MRR / today` / `Engagements / active now` / `Projected / {periodLabel}`
  - [REVIEW] `HH` / `OS` abbreviations everywhere with no inline glossary.
- `:526` — Empty: `No placements yet. Placements are created when candidates are placed on jobs.`
- `:621` — Aging markers: `(overdue)` / `(soon)` / `(expiring soon)` / `(expired)`
- `components/placements/placement-dialog.tsx:854` — `Congratulations!` / `Placement details` / `Edit placement` / `New placement` / `{candidateName} placed on {jobTitle} at {clientName}.` / `As a next step, please complete the placement info — agreed salary, start date, payment terms — so the placement record matches the deal. You can fill it in now or later.` / `Skip / Complete later` / `Fill placement form`
- `:1119` — Form helpers (selected): `Engagement kind` / `HH · one-time fee` / `OS · recurring MRR` / `Salary and fee are monthly while the engagement is active.` / `Grossed up for the fee math` / `Take-home — fee uses gross (÷ 0.83)` / `Gross — fee uses this figure directly` / `Fee = {amount} ({pct}% of {gross} annual · {monthly} × 12 · grossed up from neto)` / `Losing {amount}/mo of recurring revenue once this ends.` / `Off = engagement is ongoing — that's what counts as Active MRR.` / `Overriding the candidate's owner — reporting will credit the picked recruiter instead.`
  - [REVIEW] `grossed up from neto` mixes EN + ES. The take-home / gross / 0.83 split is AR-tax-specific.
- `components/placements/operations-strip.tsx:50` — `Payments overdue` / `{$total} outstanding` / `HH invoices past due` / `Guarantees expiring` / `Within 60 days` / `Starting in 60 days` / `First days · HH + OS` / `MRR at risk` / `{$amount}/mo at stake` / `OS endings · next 60 days` / `Nothing here. Good job.`

### 6.11 Import (`/import`)
- `app/(dashboard)/import/page.tsx:355` — Header: `Import Data` / `Import candidates, clients, and jobs from a spreadsheet or export` / `Bulk Import`
- `:392` — Drop zone: `Click to upload an export from your ATS` / `CSV · TSV · Excel · JSON · ZIP (max 25MB)` / `One type or many — we'll detect candidates, clients, and jobs from your file.`
- `:447` — Multi-sheet banner: `Found {N} sections in this file. Each will import as the type below — change it if we got something wrong.`
- `:592` — Mapping table: `Map your columns to ATS fields` / `We auto-matched what we could. Adjust anything that looks off.` / `— Skip this field —`
- `:749` — Result banners: `Import failed. Please check your file format.` / `Import complete! {imported} of {total} records imported.` / `{N} already in your workspace — skipped to avoid duplicates.` / `{N} look like duplicates of records already in your workspace. Imported anyway — review them if any were unintended.`
- `:787` — Templates: `Need a template?` / `Candidates CSV` / `Clients CSV` / `Jobs CSV`

### 6.12 Settings — profile / team / org / integrations
- `app/(dashboard)/settings/profile/page.tsx:179` — Cards: `Personal Information` / `e.g. Senior Recruiter` / `Your role at the company (displayed under your name)` / `You can manage the team and billing. Only other admins can change your role.` / `Password` / `Keep your account secure. Change your password regularly.`
- `:290` — Integrations card: `Integrations` / `Connect your own calendar and meeting tools. Each teammate connects their own accounts.` / `Google Calendar + Meet` / `Auto-create Meet links and calendar events when scheduling interviews.` / `Switch account` / `Connect Google`
- `:422` — Team sidebar: `Your Team` / `Manage` / `No team members` / `+{N} more`
- `app/(dashboard)/settings/team/page.tsx:316` — Header + pool: `Seats` / `All seats in use` / `{N} available to assign` / `Manage seats →` / `{N} active user(s) · ${X}/mo` / `Invite Team Member` / `Buy more seats →` / `Dismiss`
- `:397` — Invite dialog: `Invite Team Member` / `An email invitation will be sent. They can create their own account using the link.` / `e.g. María López` / `colleague@company.com` / `Send Invitation`
  - [REVIEW] `María López` placeholder leaks Spanish into 6+ files. Memory rule says UI strings in English.
- `:484` — Growth CTA banner: `Add another seat — your team gets stronger with each search you split.` / `Keep growing your team.` / `Anyone you add joins this workspace and starts seeing the searches you assign them to. More hands means more candidates moving and faster placements.` / `Invite teammates`
- `:541` — Member rows: `(deactivated)` / `You can't remove your own seat` / `Click to deactivate (frees seat)` / `Click to reactivate (uses 1 seat)`
- `app/(dashboard)/settings/organization/page.tsx:19` — `Organization settings are only visible to admins.` / `Contact support to change your organization name.` / `Organization Logo` / `Optional. Shown next to your firm's name in the sidebar. PNG, JPG, WEBP or SVG, max 2 MB.`
- `app/(dashboard)/settings/integrations/page.tsx:127` — `Calendar` / `Link your personal calendar so interviews you schedule land directly on it with the right video link.` / `Google Calendar + Meet` / `When you schedule an interview with Google Meet, a calendar event is created on your Google Calendar with a Meet link and invites go to all participants.` / `Connect Microsoft Teams`

### 6.13 Sidebar / topbar / notifications
- `components/layout/sidebar.tsx:28` — Nav: `Dashboard` / `Candidates` / `Jobs` / `Clients` / `Contacts` / `Placements` / `Calendar` / `Import` / `Engagements` / `My Team` / `Recruiting ATS` / `View profile`
- `components/layout/staffing-notification-bell.tsx:148` — `Notifications` / `Mark all read` / `No notifications yet.`

### 6.14 Pipeline / share / chat / mentions / export / logo
- `components/pipeline/kanban-column.tsx:53` — `Drop candidates here`
- `components/pipeline/kanban-card.tsx:101` — `Remove from pipeline` / `Client:` / `Open chat for this submission` / `Shared` / `Share with Client` / `Manage shared docs` / `Stop sharing`
- `components/pipeline/submissions-list-view.tsx:79` — `No candidates in this pipeline yet.` / `Candidate` / `Contact` / `Stage` / `Visible to client` / `Activity` / `Shared on {date}` / `Shared · {time} ago` / `Share with client` / `Stop sharing` / `Client's stage`
- `components/pipeline/share-candidate-dialog.tsx:197` — `Manage shared documents` / `Submit candidate to client` / `Documents to share ({n} of {total})` / `No documents uploaded for this candidate yet. The client will see the submission without attachments.` / `Note for the client (optional)` / `Why this candidate is a great fit...` / `Send email notification to client contacts on this job` / `Update documents` / `Send submission`
- `components/assign-jobs-dialog.tsx:101` — `Assign to Jobs` / `Select jobs for {candidateName}` / `Search jobs or clients...` / `No available jobs to assign. This candidate may already be submitted to all open jobs.` / `Assign to {n} Job(s)`
- `components/chat-notes.tsx:396` — `Internal candidate notes` / `Internal Team` / `Shared with {clientLabel}` / `No internal notes yet. Start the conversation.` / `No client discussion yet. Share notes visible to clients.` / `Share this candidate to start the conversation with {clientLabel}.` / `Use the Share with Client button on the candidate to unlock this chat.` / `Internal note... @ to mention` / `Note to {clientLabel}... @ to mention` / `Visible to {clientLabel}` / `Internal only` / `Enter to send · Shift+Enter for newline`
- `components/mention-input.tsx:23` — `Add a note... Use @ to mention someone` / `Visible to client` / `Internal only` / `Add Note`
- `components/export-csv-button.tsx:67` — `Exporting…` / `Export CSV` / `Download the selected {type} as CSV` / `Download every {type-singular} in your workspace as CSV`
- `components/logo-uploader.tsx:21` — `Company Logo` / `Optional. Shown next to your name in the portal. PNG, JPG, WEBP or SVG, max 2 MB.` / `Admin only` / `Current logo` / `Visible next to your name in the portal.` / `Upload a logo` / `PNG, JPG, WEBP or SVG (max 2 MB)` / `No logo uploaded yet. Contact an admin to add one.`

### 6.15 Dashboard charts / recruiter performance
- `components/dashboard-charts.tsx:34` — `No pipeline data yet` / `No activity data yet` / `No source data yet` / `No jobs yet` / `No recruiter data yet`
- `components/dashboard/pipeline-distribution.tsx:67` — `Pipeline Distribution` / `{total} submission(s) active in {range}`
- `components/dashboard/recruiter-performance.tsx:196` — `Recruiter performance` / `All recruiters` / `No recruiters` / `Candidates the recruiter put in front of a client in this period (counted at submission creation, attributed to the candidate's owner).` / `Distinct candidate-job submissions that entered the Interviewing stage in this period — counted once per submission, even if multiple interview events were scheduled.` / `Distinct candidate-job submissions that reached the Offered stage during this period — including ones that later became Placements or were rejected.` / `Placements created in this period. The placement's explicit Recruiter override takes precedence; otherwise it falls back to the candidate's owner.` / `No activity in this period for the picked recruiters.` / `Placement %`
- `:537` — Delta micro-copy: `No change vs prior` / `vs prior` / `See the underlying rows`


---

## 7. Empty states + page headers (client portal)

### 7.1 Layout (`client-portal/layout.tsx`)
- L50 — Brand: `Client Portal`
- L54 — Workspace subtitle: `{clientName}`
- L58 — Fallback subtitle: `Manage your hiring pipeline`
- L74 — Nav: `Dashboard` / `Jobs` / `Candidates` / `My Team` / `Recruiting Firms` / `Post a Job`
- L119 — Settings tooltip: `Profile & Settings`
- L127 — Sign-out: `Sign out` / `Sign Out`
- L135 — Footer: `Powered by` / `Recruiting ATS` / `Back to Home`

### 7.2 Login (`client-portal/login`)
- L41 — Forgot-password sent: `Check your email` / `If an account with that email exists, we've sent a password reset link.` / `Back to sign in`
- L65 — Reset form: `Reset your password` / `Enter your email and we'll send you a reset link.` / `Send Reset Link`
- L115 — Login errors:
  - `That email isn't registered. Ask your recruiting partner to invite you to the portal.`
  - `We couldn't find an invite for that Google account. The client portal is invite-only — ask your recruiting partner to add you.`
  - `We detected your email is registered as a client portal user. Please sign in here (not from the staffing portal) to access your account.`
  - `Your access has been revoked. Please contact your recruiting team to restore access.`
  - `Invalid email or password. If you were recently invited and haven't set up your password yet, check your inbox for the setup link.`
- L255 — Marketing panel: `Recruiting ATS` / `Hire smarter with top recruiting firms` / `Post jobs, invite recruiters, and track your hiring pipeline — all in one place. Free for hiring companies.` / `Post job descriptions and requirements` / `Invite multiple recruiting firms to work your searches` / `Review candidates and give real-time feedback` / `Track progress across all your open roles`
- L305 — Cross-portal warning: `Currently in staffing as {email}` / `Go there →`
- L346 — Form: `Sign in to your client portal` / `Access is by invitation from your recruiting partner.` / `Continue with Google` / `or sign in with email`
- L386 — Verify-email panel: `Verify your email to sign in` / `We sent a confirmation link to {email}. Click it to activate your account.` / `A new link is on its way. Check your inbox.` / `Resend verification email`

### 7.3 Set password / reset / verify / complete profile (client portal)
- `app/client-portal/set-password/page.tsx:159` — `Invalid or missing link. Please check the email you received.` / `Set up your account` / `Add your company name and pick a password to access your client portal.` / `Choose a password to access your client portal` / `e.g. Hiring Manager, Head of Engineering` / `Min. 8 characters` / `Re-enter password` / `Set Password & Sign In`
- `app/client-portal/reset-password/page.tsx:62` — `Invalid or missing reset link.` / `Password reset!` / `Reset your password` / `Enter your new password below` / `Your password has been reset. You can now sign in.` / `Reset Password`
  - [REVIEW] "Password reset!" with exclamation is the only exclamation success-message of its kind.
- `app/client-portal/verify-email/page.tsx:97` — `Verifying your email…` / `Email verified` / `Your account is ready. Sign in to access your portal.` / `Already verified` / `Your email is already confirmed.` / `Link expired` / `Verification links are good for 24 hours. Send yourself a new one.` / `New link sent. Check your inbox.` / `Send a new verification email` / `Link no longer valid` / `This verification link has already been used or replaced by a newer one. If you've already verified your email, just sign in.` / `Couldn't verify`
- `app/client-portal/complete-profile/page.tsx:74` — `Welcome` / `Quick step before you get started — confirm how your name shows up and your role at the company.` / `e.g. Sarah Johnson` / `e.g. Head of Talent`

### 7.4 Client portal dashboard
- `app/client-portal/dashboard/page.tsx:263` — KPIs: `Open Positions` / `Candidates Shared` / `Recruiting Firms` / `Total Jobs`
- `:347` — Header: `{industry} · Hiring pipeline, shared searches and candidates from your recruiting firms` / `Post a Job`
- `:371` — Pending banner: `{N} recruiting firm(s) waiting to respond` / `Check your job postings to see firm status`
- `:431` — Empty / jobs: `Get started with your first job posting` / `Post a job description and invite recruiting firms on the platform to source candidates for you. It's free to post and manage.` / `Jobs` / `{N} total · {N} posted by you · {N} from your recruiters` / `all posted by you`
- `:516` — Source badges: `via {firmName}` / `via your recruiter` / `Posted by you` / `{N} active` / `{N} pending` / `{N} firm(s) invited`
- `:600` — Team section: `Team Members` / `Add Member` / `Invite a Team Member` / `{name} is already a contact on file ({title}).` / `We pre-filled their info. Submitting will give them portal access too.` / `e.g. María López` / `e.g. VP of Engineering`
- `:740` — Team actions / empty: `Deactivate` / `Reactivate` / `Remove` / `Inactive` / `No team members yet. Click "Add Member" to invite your colleagues.`
- `:787` — Insights cards: `Hiring Progress` / `Overview of your recruitment activity` / `Jobs Posted` / `Firms Engaged` / `Candidates Shared` / `Tips to Hire Faster` / `Invite more firms` / `Each job can have multiple recruiting firms competing to find the best talent.` / `Review candidates quickly` / `Recruiters are more responsive when you rate and provide feedback promptly.` / `Keep job descriptions detailed` / `The more context you provide, the better candidates your firms will source.`
- `:903` — Firms drawer: `Recruiting firms engaged` / `Firms actively sourcing for your open jobs. Counts include every job and candidate they've worked with you on.` / `No firms engaged yet.`
- `:1013` — Onboarding stub: `Tell us about your company` / `We bootstrapped your workspace from your email domain. Confirm or update the details below so your recruiters see the right company name.` / `Acme Inc.` / `e.g. Technology`

### 7.5 Client portal jobs (list / new / detail)
- `app/client-portal/jobs/page.tsx:246` — `Has active firms` / `Has pending firms` / `No firms yet` / `Your Jobs` / `Post a Job` / `Search by title or location...` / `No jobs match your filters` / `No jobs yet. Post your first job to get started.` / `No firms`
- `app/client-portal/jobs/new/page.tsx:175` — `Post a Job` / `Describe the role and invite recruiters to help fill it` / `Upload Job Description` / `PDF, DOCX, TXT (max 10MB) — text will be extracted and fill the description` / `Auto-filled from document` / `Describe the role, responsibilities, team structure...` / `Required skills, experience, qualifications...` / `Team access` / `By default everyone on your team can see this job. Restrict it if you want only specific people involved.` / `Restrict access` / `You'll always have access — we add the creator automatically. Anyone not picked here won't see this job, even other admins.` / `You can invite recruiting firms after posting`
- `app/client-portal/jobs/[id]/page.tsx:871` — Pipeline: `Pipeline · {N}` / `View all →` / `No candidates shared yet.` / `Your recruiting firms will share candidates here as they find them.`
- `:1033` — Details + docs: `No description added yet` / `Add Details` / `Job Description File` / `No JD shared yet. Your recruiting firm will upload it on their side.` / `Additional Documents` / `No additional documents`
- `:1234` — Job access: `Job access` / `Invite teammate` / `From your team` / `Or invite someone new` / `Everyone on your team can see this job. Click Manage to restrict it to specific people, or Invite to add someone new.` / `(owner)` / `pending` / `Cancel invite` / `Manage` / `Tick the people who should see this job. Unchecking everyone reverts to the legacy "visible to the whole team" state — useful if you accidentally restricted it.` / `Always a member — the job's creator can't be removed.` / `creator`
- `:1543` — Assigned firms: `Assigned Firms` / `Active` / `Pending` / `Rejected` / `No recruiters invited yet. Click Invite to get started.` / `Waiting for response (N recruiters)...` / `No specific recruiter on record` / `pending sign-up` / `firm-level`
- `:1851` — Withdraw / invite dialog: `Withdraw` / `Email sent {date} · not registered yet` / `awaiting signup` / `Cancel invitation` / `Send invitations` / `Invite by email. Each invitation reaches only that specific person — not their whole firm — so you can pick exact contacts. Add as many as you need before sending.`
- `:2125` — Suggestion pills: `Checking…` / `Already on this job` / `On Recruiting ATS` / `New — we'll send a signup link` / `On this job` / `Already engaged`
- `:2286` — Smart invite button: `Add a short note — sent with every invitation in this batch.` / `Send invitations` / `Invite {firstName}` / `Send invitation` / `Send signup invite` / `Send {N} invitations`

### 7.6 Client portal candidates
- `app/client-portal/candidates/page.tsx:181` — `Candidates` / `{N} candidate(s) shared with you`
- `:198` — Filters: `Search name, title, company...` / `All Jobs` / `All Stages` / `All Firms`
- `:257` — Empty: `No candidates shared with you yet.` / `Your recruiting firms will share candidates here as they find them. You'll be able to review, rate and give feedback.` / `View your jobs` / `No candidates match your filters.`
- `:333` — Legend: `Current pipeline stage. Moves happen on your recruiting firm's side.`
- `app/client-portal/candidates/[submissionId]/page.tsx:154` — `Candidate not found or not shared with you.` / `Pipeline stage` / `About` / `Skills` / `Documents` / `No documents attached.`

### 7.7 Client portal engagements / my-team / settings
- `app/client-portal/engagements/page.tsx:133` — `Recruiting Firms` / `No recruiting firms engaged yet.` / `{N} firm(s) working across {N} job(s).` / `Firms engaged` / `Submitted` / `Offers` / `Placements` / `Pending ({N})` / `Awaiting response` / `Invited {N}d ago` / `Active firms ({N})` / `Declined` / `No recruiting firms yet` / `Invite a recruiting firm from any of your Jobs to start collaborating. They'll show up here once they accept.`
- `app/client-portal/engagements/[firmId]/page.tsx:108` — `This firm isn't engaged with you (yet).` / `Back to Recruiting Firms` / `Working on {N} job(s) for you · Last activity {date}` / `Contacts at {firmName} ({N})` / `Jobs with {firmName}`
- `app/client-portal/my-team/page.tsx:245` — `My Team` / `Everyone with access to your client portal workspace.` / `Team Members` / `Members added here get portal access only — share specific jobs with them from each Job's access panel.` / `Only admins can grant the Admin role` / `No team members yet. Click "Add Member" to invite a teammate at your email domain.`
- `app/client-portal/settings/page.tsx:324` — `Settings` / `Manage your profile, your team and your company in one place.` / `Personal Information` / `· Can manage team` / `· Contact an admin to change` / `Password` / `Keep your account secure. Change your password regularly.` / `Company Logo` / `Optional. Shown next to your company name in the portal header. PNG, JPG, WEBP or SVG, max 2 MB.`

### 7.8 Client portal components
- `components/client-portal/notification-bell.tsx:137` — `Notifications` / `Mark all read` / `No notifications yet.`
- `components/client-portal/read-only-pipeline.tsx:88` — `Pipeline stages haven't been set up yet.` / `No candidates here yet.` / `via {firmName}`
- `components/client-portal/candidate-chat.tsx:266` — `Internal (Our Team)` / `Shared with {firmName}` / `Only your team can see these messages. The recruiter is NOT notified.` / `Visible to your team and {firmName}.` / `No internal messages yet.` / `No messages with the recruiter yet.` / `Be the first to post below.` / `Recruiter` / `Team` / `Agency` / `Client team` / `Internal note for your team... use @ to mention` / `Message {firmName}... use @ to mention` / `Mention someone`
- `components/client-portal/client-job-chat.tsx:288` — `Internal team` / `Shared with {organizationName}` / `No notes yet. Start the conversation with your team.` / `Note for your team — type @ to mention someone with access to this job` / `Message to {agencyName} — type @ to mention a teammate or recruiter` / `Internal only` / `Visible to {agencyName}` / `Enter to send · Shift+Enter for newline`

### 7.9 Legacy public token view (`/client-portal/[token]`)
**Where**: `app/client-portal/[token]/page.tsx`. Unauthenticated link path — older flow, still referenced.
- L231 — `Invalid or expired link`
- L355 — `Access Denied`
- L369 — `No Candidates Yet` / `No candidates have been shared for review yet. Check back soon.`
- L512 — `Welcome, {client.name}` / `{N} candidate(s) shared for your review across {N} position(s)` / `Notes from your recruiter` / `No additional profile information available.` / `No documents have been uploaded for this candidate.`
- L840 — Feedback: `Quick feedback:` / `Interested` / `Not a fit` / `No feedback yet. Be the first to share your thoughts.` / `Leave Feedback` / `Share your thoughts about this candidate...` / `Feedback submitted successfully!` / `Select a candidate to view their profile`

---

## 8. Landing / marketing / auth pages

### 8.1 Landing page (`/`)
**Where**: `app/(marketing)/page.tsx`.

**Navbar**:
- Brand: `Recruiting ATS`
- Links: `Features` / `How It Works` / `The Math` / `Privacy` / `Terms`
- CTAs: `Sign In` / `Start Free Trial`

**Hero**:
- Pill: `The ATS built for boutique recruiting firms`
- H1: `Your candidates deserve a better pipeline`
- Subhead: `Stop losing placements to spreadsheets and scattered emails. Recruiting ATS gives your firm a visual pipeline and everything you need to place faster, from $20/seat/month.`
- Primary CTA: `Start 7-Day Trial` / fine print: `7-day trial · Cancel anytime`

**Pipeline mockup**:
- Fake URL: `app.recruitingats.com/pipeline`
- Mock title: `Acme Corp: Senior Engineer Search` / `31 candidates in pipeline`
- Stages: `Sourced` / `Contacted` / `Submitted` / `Interview` / `Offer` / `Placed`
- Cards: `John Doe / Sr. Engineer`, `Sarah Kim / PM Lead`, `Mike Ross / VP Sales`, `Amy Lee / Data Scientist`, `Tom Park / CTO`, `Cara B. / Designer`

**TrustBar**: `Built by recruiters for recruiters`

**PainSolution**:
- Eyebrow: `Sound Familiar?`
- H2: `The recruiting firm struggle is real`
- Pain 1: `Candidates fall through the cracks` / `No one remembers who was submitted where. Follow-ups get missed. Placements slip away.`
- Pain 2: `Clients have zero visibility` / `They email asking for updates. You scramble to compile a list. They feel out of the loop.`
- Pain 3: `Your data lives in 5 different places` / `Spreadsheets, email, LinkedIn, your brain, sticky notes. Nothing is connected.`
- Pill: `There's a better way`
- Solution 1: `Every candidate, tracked visually` / `Drag-and-drop pipeline per job. See exactly where every candidate stands. Never lose track again.`
- Solution 2: `Clients collaborate in real time` / `Share a branded portal. Clients rate candidates, leave feedback, request interviews, without a single email.`
- Solution 3: `One system for everything` / `Candidates, clients, jobs, fees, documents, notes, all in one place. Import from any ATS in minutes.`

**Features tabs**:
- Eyebrow: `Features` / H2: `Everything you need to place more candidates` / Subhead: `Stop juggling spreadsheets and email. Every tool your firm needs in one platform.`
- **Tab Pipeline** — `Drag-and-drop Kanban pipeline` / `Every search gets its own visual board. Drag candidates between stages, add notes, share with clients, all in one view. Customize stages per job.` / Bullets: `Custom stages per job`, `Drag-and-drop reordering`, `Bulk actions & filters`, `One-click client sharing`
- **Tab Client Portal** — `Interactive client collaboration portal` / `Generate a secure link. Your client reviews candidate profiles, rates them 1-5, leaves detailed feedback, and requests interviews, all without you being in the middle.` / Bullets: `Branded, white-label experience`, `Star ratings & written feedback`, `Salary info auto-redacted`, `Real-time notifications` / Mock card: `James Chen / VP Engineering · 12 years exp.` / Mock comment: `Acme Corp / 2 min ago / Great background. Let's move to a technical interview this week.` / Mock actions: `Shortlist` / `Comment`
- **Tab Smart Parsing** — `Smart resume parsing` / `Upload a resume (PDF, DOCX, TXT) and watch the form auto-fill. Name, email, phone, skills, experience, extracted in seconds using pattern matching.` / Bullets: `PDF, DOCX, TXT support`, `Skills & experience extraction`, `Auto-redact for client shares`, `Bulk import from any ATS` / Mock fields: `Name / James Chen`, `Title / VP Engineering`, `Email / james@email.com`, `Location / San Francisco, CA`, `Skills / React, Node.js, AWS, Python`
- **Tab Client Requests** — `Searches come straight to you` / `When a client opens a new search in their portal, you get a notification with the full brief. Accept with one click and a pipeline is auto-created, no re-keying.` / Bullets: `Incoming search notifications`, `Job + salary + requirements pre-filled`, `One-click engagement accept`, `Auto-creates pipeline & client record` / Mock badge: `New Engagement Request` / Mock job: `Senior Data Engineer / TechCorp Inc. · Remote · $160K-$200K` / Buttons: `Accept & Create Pipeline` / `Pass`
- Tabs CTA: `Try it free`

**TwoSides**:
- Eyebrow: `Everything in one place` / H2: `Built for recruiting firms` / Subhead: `Run your pipeline, collaborate with your team, and keep your hiring clients in the loop, all from one workspace.`
- Card: `For Recruiting Firms` / Price: `From $20` / `/seat/month`
- Features: `Drag-and-drop Kanban pipeline` / `Full candidate database with search` / `Client & deal management CRM` / `Shareable candidate shortlists` / `Placement & fee tracking` / `Smart resume parsing & bulk import` / `Incoming job requests from clients` / `Dashboard with charts & insights`
- CTA: `Start Free Trial`

**HowItWorks**:
- Eyebrow: `How It Works` / H2: `Up and running in minutes, not weeks` / Subhead: `No implementation calls. No consultants. Just sign up and go.`
- Step 01: `Sign up in 2 minutes` / `Create your firm, invite your team, set up your default pipeline stages.`
- Step 02: `Add your data` / `Import candidates from CSV, auto-fill from resume uploads, or add manually. Set up clients and open searches.`
- Step 03: `Work your pipeline` / `Drag candidates through stages. Share shortlists with clients. Collect real-time feedback.`
- Step 04: `Close placements` / `Track fees, record placements, and grow revenue. Analytics show you what's working.`

**Comparison**:
- Eyebrow: `Comparison` / H2: `10x the value at 1/10th the price` / Subhead: `All the features of enterprise ATS platforms. None of the bloat.`
- Feature rows: `Visual Kanban pipeline`, `Client collaboration portal`, `Smart resume parsing`, `Client marketplace (incoming jobs)`, `Placement & fee tracking`, `Team roles & permissions`, `Bulk import (CSV/JSON)`, `Shareable candidate links`, `@mention notes system`, `Mobile responsive`
- Columns + prices: `Recruiting ATS` `$20/seat/mo` / `Bullhorn` `$99+/user/mo` / `Loxo` `$119+/user/mo`
- Savings row: `You save per seat` — `-` / `$79/mo` / `$99/mo`
- [REVIEW] Verify Ari is comfortable with the named competitors and the savings claim.

**TheMath**:
- Badge: `The Math`
- H2: `One placement covers 20 years of Recruiting ATS`
- Subhead: `One placement. Two decades. The math isn't hard.`
- Stat 1: `Avg. placement fee` / `$25,000` / `Industry average`
- Stat 2: `Your cost` / `$100` / `/ month, 5 seats`
- Stat 3: `Months covered` / `250` / `= 20+ years`
- Card body: `If Recruiting ATS helps you close one extra placement (ever) the ROI pays for the whole team. For years.`
- CTA: `Start your 7-day trial`

**FAQ**:
- Eyebrow: `FAQ` / H2: `Common questions`
- Q: `How does the free trial work?` / A: `You get 7 days of full access to try Recruiting ATS, no credit card required. Pricing is $20/seat/month. Cancel any time before the trial ends and you won't be billed.`
- Q: `Can I import data from my current ATS?` / A: `Yes. We support CSV, TSV, Excel, and JSON imports for candidates, clients, and jobs. Most ATSs export to one of these, so drop the file in and we'll map the columns.`
- Q: `How does the client portal work?` / A: `The client portal is included with every Recruiting ATS plan. You invite each hiring client by email. They see the candidates you share, rate them, leave comments, chat with you, and track progress, all without ever touching your internal pipeline. Salary info is auto-redacted. Your clients don't pay a cent and don't need an account until you invite them.`
- Q: `Is my data secure?` / A: `Yes. All data is encrypted in transit (TLS) and at rest. We run on managed Postgres (Neon) with per-organization isolation. We're not SOC 2 certified yet, but that's on the roadmap, and we'll be transparent about it when we are.`
- Q: `What happens when I cancel?` / A: `You can export all your data anytime. When you cancel, you retain read-only access through your billing period end. We never hold your data hostage.`
  - [REVIEW] "Read-only access through billing period end" — verify against `subscription-gate.tsx`, which actually blocks the whole UI when canceled.

**FinalCTA**:
- Pill: `Built by recruiters for recruiters`
- H2: `Ready to close more placements, faster?`
- Subhead: `Start your 7-day trial today. Cancel any time before it ends and you won't be charged.`
- CTA: `Start Free Trial`

**Footer**:
- Contact heading: `Have a specific question? Get in touch.`
- Contact email: `contact@alphabridgepartners.com`
- Brand: `Recruiting ATS`
- Copyright: `© {year} Recruiting ATS. All rights reserved.`
- Links: `Sign In` / `Register` / `Privacy` / `Terms`

### 8.2 Agency login (`/login`)
**Where**: `app/(auth)/login/page.tsx`.

- Left panel: `Recruiting ATS` / `The ATS built for recruiting firms` / `Streamline your hiring pipeline from sourcing to placement.` / `Manage candidates, jobs & clients in one place` / `Automated pipeline tracking & analytics` / `Team collaboration with role-based access`
- Back link: `Back to home`
- Client-session banner: `Currently in client portal as {email}` / `Go there →`

**Step "select"**:
- H2: `Sign in` / Subhead: `Which portal are you signing in to?`
- Card 1: `Agency Workspace` / `I work at a recruiting firm managing searches and candidates.`
- Card 2: `Client Portal` / `I'm a hiring company reviewing candidates my recruiters shared.` / `You already pay a fee — no need to pay for the ATS.`
- Footer: `Don't have an account?` / `Start free trial`

**Step "agency"**:
- Back link: `Back to portal selection`
- H2: `Welcome back` / Subhead: `Sign in to your agency workspace.`
- Banner (just registered): `Account created! Please sign in.`
- Banner (invite already used): `Looks like you've already accepted that invitation. Sign in below to continue.`
- Banner (deactivated): `Your account has been deactivated. Please contact your workspace admin to regain access.`
- Verify panel: `Verify your email first` / `We need to confirm {email} before you can sign in. Check your inbox for the link we sent — or send a new one below.`
- Sent: `Sent. Check your inbox (and spam).`
- Resend button: `Sending…` / `Resend verification email`
- Google CTA: `Continue with Google`
- Divider: `or sign in with email`
- Fields: `Email` (placeholder `john@acmerecruiting.com`) / `Password`
- Inline link: `Forgot your password?`
- Submit: `Signing in...` / `Sign In`
- Footer: `Don't have an account?` / `Start free trial`

**Error strings**:
- `Your account has been deactivated. Please contact your workspace admin to regain access.`
- `Invalid email or password`
- `Sign in timed out. Please try again.`
- `Something went wrong. Please try again.`

### 8.3 Agency register (`/register`)
**Where**: `app/(auth)/register/page.tsx`.

- Left panel: `Recruiting ATS` / `A modern ATS for boutique firms` / `Everything you need to run a recruiting operation — without the enterprise bloat.` / `Unlimited candidates & job postings` / `Built-in client portal` / `Team collaboration & permissions` / `7-day trial — no credit card required` / `You're joining early. That means direct access to the team, weekly shipping, and early-adopter pricing that stays grandfathered.`
- Firm-invite banner: `You've been invited as a recruiter` / `Set up your recruiting firm to accept the engagement. The invite will land in your dashboard as soon as you finish signing up.`
- H2 (dynamic): `Set up your firm` (invite) / `Start your free trial` (default)
- Subhead: `7 days free. No credit card required. Cancel anytime before the trial ends.`
- Google CTA: `Sign up with Google` / Divider: `or register with email`
- Fields: `Company / Firm Name` (`Acme Recruiting`) / `Industry` (`Select or type…`) / `Team Size` (`Select…`) / `Your Name` (`e.g. María López`) / `Job Title` (`e.g. Senior Recruiter`) / `Work Email` (`john@acmerecruiting.com`) / `Password` (`Min. 8 characters`) / `Confirm password` (`Re-enter the same password`)
- Submit: `Creating your workspace...` / `Start Free Trial`
- Trust list: `Unlimited candidates & jobs` / `Client portal included` / `Set up in 2 minutes`
- Footer: `Already have an account?` / `Sign in`
- Errors: `Passwords don't match` / `Registration failed` / `Something went wrong`

### 8.4 Agency forgot / reset password
- Forgot panel: `Your account is safe with us` / `We take security seriously. Reset your password in seconds.` / `Encrypted in transit and at rest` / `Per-organization data isolation` / `Secure token-based reset links` / `Need help? Contact us at support@recruitingats.com`
  - [REVIEW] Third support email address (`support@recruitingats.com`) on top of `contact@alphabridgepartners.com` and `nicolas@alphabridgepartners.com`.
- Forgot form: `Reset your password` / `Enter your email and we'll send you a reset link.` / `Sending...` / `Send Reset Link` / Sent: `Check your email` / `If an account with that email exists, we've sent password reset instructions.` / `Back to sign in`
- Reset panel: `Almost there!` / `Choose a strong password and you'll be back to recruiting in no time.` / `Use at least 8 characters` / `Mix letters, numbers & symbols` / `Avoid reusing old passwords`
- Reset form: `Choose a new password` / `Enter and confirm your new password below.` / `New password` / `Confirm password` / `Updating...` / `Update password` / Missing token: `This reset link is missing a token. Please request a new one.` / Success: `Password updated` / `Redirecting to sign in...`

### 8.5 Onboarding (`/onboarding`)
- Brand: `Recruiting ATS`
- H1: `Welcome, {displayName}` (fallback `there`)
- Subhead: `Before you get started, tell us which company you're with. This becomes your workspace name and shows up across your portal.`
- Fields: `Company / Firm Name` / `Industry` / `Team Size`
- Helper: `Enter the real name of the company you work for — not your own name.`
- Submit: `Saving...` / `Continue to dashboard`
- Bottom: `Sign out`
- Errors: `Please enter your company name.` / `Please pick your industry and team size.` / `Could not save your company. Please try again.` / `Something went wrong. Please try again.`

### 8.6 Invite acceptance (`/invite/[token]`)
- Loading: `Loading invitation...`
- Invalid: `Invalid Invitation` / `{error}` / `Go to Login`
- H1: `Join {organizationName}`
- Subhead: `You've been invited to join as a {role.toLowerCase()}`
- Fields: `Email` (disabled) / `Your Name` (`e.g. María López`) / `Job Title` (`e.g. Senior Recruiter`) / `Create Password` (`Min. 8 characters`) / `Confirm Password` (`Re-enter the same password`)
- Submit: `Setting up your account...` / `Accept & Join`
- Trust line: `Your account will be ready instantly`
- Errors: `Passwords don't match` / `Failed to load invitation` / `Failed to accept invitation` / `Something went wrong`

### 8.7 Agency verify-email (`/verify-email`)
- Loading: `Verifying your email…`
- Success: `Email verified` / `You're all set. Head back to your dashboard to keep working.` / CTA `Go to dashboard`
- Already verified: `Already verified` / `Your email is already confirmed.`
- Expired: `Link expired` / `Verification links are good for 24 hours. Send yourself a new one.` / `New link sent. Check your inbox.` / `Send a new verification email`
- Invalid: `Link no longer valid` / `This verification link has already been used or replaced by a newer one. If you've already verified your email, just sign in. Otherwise check your inbox for the most recent link.` / `Go to sign in` / `Go to dashboard`
- Error: `Couldn't verify`
- Inline errors: `Missing verification token.` / `Verification failed` / `Network error. Try again.` / `Couldn't send. Try again.`

### 8.8 Complete profile (OAuth fill-in)
- Loading: `Loading…`
- H1: `Welcome` / Subhead: `Quick step before you get started — confirm how your name shows up and what you do.`
- Fields: `Your name` (`e.g. María López`) / `Job title` (`e.g. Senior Recruiter`)
- Submit: `Saving…` / `Continue`
- Errors: `Both name and job title are required.` / `Failed to save profile` / `Something went wrong`

### 8.9 404 / 500 / global error
- `app/not-found.tsx`: `404` / `Page not found` / `The page you're looking for doesn't exist or has been moved.` / `Go to Dashboard` / `Home`
- `app/error.tsx`: `Oops` / `Something went wrong` / `An unexpected error occurred. Please try again.` / `Try Again`
- `app/global-error.tsx`: no custom copy.

### 8.10 Privacy + Terms
- Both: `Recruiting ATS` brand, `← Back to home`, `Last updated: April 16, 2026` (manually stamped).
  - [REVIEW] Manually stamped date predates 2026-06-24 — confirm content still matches before the founder meeting.
- Privacy H1: `Privacy Policy`. Sections: `1. Information we collect`, `2. How we use your information`, `3. Google API data`, `4. Sub-processors we rely on`, `5. Data retention`, `6. Your rights`, `7. Security`, `8. Children`, `9. Changes to this policy`, `10. Contact us`.
- Privacy contact: `nicolas@alphabridgepartners.com`.
- Privacy sub-processors: Vercel, Neon, Vercel Blob, Resend, Stripe, Google, Microsoft.
- Privacy explicit: `We do not sell your data. We do not use your data or your candidates' data to train machine-learning models.`
- Terms H1: `Terms of Service`. Sections: `1. The Service`, `2. Accounts`, `3. Your content`, `4. Acceptable use`, `5. Third-party integrations`, `6. Fees and billing`, `7. Cancellation and termination`, `8. Disclaimer of warranties`, `9. Limitation of liability`, `10. Indemnification`, `11. Governing law` (Delaware), `12. Changes to these Terms`, `13. Contact` (nicolas@alphabridgepartners.com).
- Both footers: `© {year} Alphabridge Partners LLC. All rights reserved.` / `Privacy` / `Terms` / `Home`.

---

## 9. Billing-specific copy (extras not already in 3.21–3.23)

### 9.1 Billing page hero badges + subtitles (`app/(dashboard)/settings/billing/page.tsx`)
- `Complimentary` / `All features unlocked, no billing required.`
- `Trial expired` / `Subscribe now to keep your team working. Your candidates, jobs and pipeline are safe.`
  - [REVIEW] This and SubscriptionGate use different titles for the same state (`Your free trial has ended`).
- `Scheduled to cancel` / `Access until {date}. Reactivate any time before then to keep billing as is.`
- `Active` / `Your subscription is current.`
- `Past due` / `Update your payment method to avoid interruption.`
- `Canceled` / `Subscribe again to keep using the ATS.`
- `Free trial` / `{N} day(s) left to try everything.`

### 9.2 Sync + post-checkout banners
- `Syncing latest changes from Stripe…`
- Success banner: `Subscription activated` / `Thanks for choosing Recruiting ATS. Your team is good to go.`
- Cancel banner: `Subscription not completed` / `No charges were made. You can subscribe any time.`

### 9.3 Seat cards / pool messaging
- `Seats` / `Manage seats`
- Trial: `Active recruiter(s) · Unlimited during trial` / `Invite teammates from the Team page. Per-seat billing kicks in on {date}.`
- Active: `All seats in use` / `{N} available to assign` / `Invite or deactivate teammates from the Team page. Seats freed by deactivating stay in your pool.`
- Date cards: `Trial ends` / `Ends on` / `Next billing` / `After that, ${X}/month` / `Charged: ${X}` / `Free` / `Complimentary plan, no billing` / `Subscribe to see your next billing date`

### 9.4 Pricing explainer
- `How pricing works`
- `${X}/seat/month. 7-day free trial — no credit card required. Add or remove seats any time and billing adjusts automatically on your next invoice. Cancel any time from the billing portal.`

### 9.5 Trial countdown popup (`components/billing/trial-countdown.tsx`)
- 0 days: `Your trial ends today` / `Add a payment method now to keep your team working without interruption.`
- 1-2 days: `{N} day(s) left in your trial` / `Add a payment method now to keep your team working without interruption.`
- 3-6 days: `{N} days left in your trial` / `Subscribe now to keep your team working. ${X}/seat per month. Cancel anytime.`
- 7+ days: `{N} days left in your free trial` / `Enjoying the ATS? Subscribe any time. ${X}/seat per month. Cancel anytime.`
- CTA: `Subscribe now`
- Urgent footnote: `You'll lose access to the ATS when the trial ends. Subscribe now to keep working.`

### 9.6 Billing impact inline callouts (`components/billing/billing-impact-block.tsx`)
- Heading: `Billing impact`
- Trial note: `You're still in trial — no charge yet. The new total of ${X}/mo kicks in when your trial ends.`
- Adding (active): `Prorated for this month: Stripe charges only the remaining days at ${X}/seat. The full +${Y}/mo kicks in on your next billing cycle.`
- Removing (active): `Credited to your next invoice: Stripe prorates the unused days and applies the credit automatically. Your next bill will be ${X}/mo.`

---

## 10. Stripe Customer Portal text

No custom locale / branding override — uses default Stripe Customer Portal copy. The ATS hands off via `POST /api/admin/billing/portal` and Stripe-hosted pages take over from there. If Ari wants branded portal copy, that's a Stripe dashboard config pass.

---

## 11. Permission / status banners + overlays

### 11.1 SubscriptionGate overlay (`components/billing/subscription-gate.tsx`)
Full-screen overlay shown when subscription state blocks access:

| State | Title | Subtitle |
|---|---|---|
| trial_expired | `Your free trial has ended` | `Subscribe to keep your team working. Your candidates, jobs and pipeline are safe — pick up exactly where you left off.` |
| no_sub | `Subscription required` | `Subscribe to start using Recruiting ATS.` |
| canceled | `Your subscription has ended` | `Subscribe again to regain access. Your candidates, jobs and pipeline come back instantly.` |
| past_due | `Payment past due` | `We couldn't process your last payment. Update your billing details to restore access.` |
| unpaid | `Subscription unpaid` | `Your subscription has unpaid invoices. Settle them to keep using Recruiting ATS.` |
| inactive | `Subscription inactive` | `Subscribe to keep using Recruiting ATS.` |

- Admin CTA: `Subscribe now` + footer `$20/seat per month · Cancel anytime`
- Non-admin: `Only your workspace admin can subscribe. Reach out to them to restore access.` + `Email {adminEmail}` (mailto subject: `Recruiting ATS — subscription needed`).
- Secondary: `Log out`.

### 11.2 Session-revoked overlay (`components/auth/session-gate.tsx`)
- Title: `Your access has been revoked`
- Body: `Your workspace admin has deactivated your account. Contact them if you think this is a mistake.`
- Footnote: `You will be redirected to the login screen.`
- Primary: `Log out`.

### 11.3 Email verification banner (`components/auth/email-verification-banner.tsx`)
- Body: `Verify your email — we sent a link to {email}.`
- Resend success: `Sent. Check your inbox.`
- Resend error: `Couldn't resend.`
- Button: `Sending…` / `Resend`
- Dismiss aria-label: `Dismiss`.

### 11.4 Migration banner (`components/dashboard/migrate-banner.tsx`)
- `Coming from another ATS?` / `Bring your candidates, clients, and open searches over in one shot — CSV or TSV from Bullhorn, JobAdder, Loxo, Crelate, or wherever you live today. The mapping wizard handles renamed columns.` / `Start importing` / `Your first week — {N} day(s) left` / `Migrate any time`

---

## 12. Cross-cutting findings worth raising with Ari

1. **All toasts render red.** No consumer of `showToast(msg)` passes the `"success"` variant. Success messages like `"Invite resent."`, `"Invitation sent!"`, `"Profile updated"`, `"Team member reactivated."` all show as errors. Real bug to fix before showing the product to anyone.
2. **Three support email addresses in active use**: `support@recruitingats.com` (forgot/reset pages), `contact@alphabridgepartners.com` (landing, default email reply-to, hardcoded inside an API error string), `nicolas@alphabridgepartners.com` (privacy + terms). Pick one and propagate.
3. **`María López` placeholder leaks Spanish** into UI strings in 6+ files (register, invite, onboarding, complete-profile, agency team invite, client portal team invite, dashboard add-member). Violates the memory rule "UI strings in English".
4. **Casing drift**: Title Case (`Add Member`, `Post a Job`) vs Sentence case (`Add candidate`, `Invite teammate`) in equivalent button positions across the agency / client portal split.
5. **Two trial-expired wordings for the same condition**: billing-page hero (`Trial expired`) and SubscriptionGate overlay (`Your free trial has ended`). Pick one.
6. **Two seat-pool-full CTAs with different verbs**: team page `Buy more seats →` and ConfirmAddSeatDialog `Buy seat & invite`.
7. **Stat-label drift for the same concept**: `Recruiting Firms` vs `Firms Engaged` vs `Firms engaged`; `Rejected` (jobs) vs `Declined` (engagements).
8. **Destructive "Yes, X" pattern IS consistent** across the agency dashboard (`Yes, delete`, `Yes, stop sharing`, `Yes, remove`, `Yes, cancel invite`, `Yes, change status`, `Yes, promote`). Good — keep it.
9. **`client-portal/my-team` lacks confirm dialogs** that `client-portal/settings` has — Remove and Cancel-invite on `my-team` fire immediately on click. Violates the destructive-confirm rule.
10. **Dev-leak in file-upload error**: clean (`"File uploads are not configured."`) vs dev-tail (`"...Enable Vercel Blob storage in the project settings."`) — the second variant is shown to end users in document/interview/job/client endpoints.
11. **Dashboard KPI tooltip mentions internal model name**: `"Hiring companies your firm is engaged with (linked via OrganizationClient)."` — leak.
12. **`Stripe subscription has no item. Contact support.`** (update-seats:154) leaks the Stripe data model to the user.
13. **Hardcoded email inside an error string**: `"Seats above 100 require manual setup. Reach out to contact@alphabridgepartners.com."` — should be a link or variable.
14. **Migration banner names specific competitors** (Bullhorn, JobAdder, Loxo, Crelate). Confirm these are still the right list before the meeting.
15. **HH / OS abbreviations** show up everywhere on Placements without an inline glossary. New users would need help decoding.
16. **AR-tax wording in placement dialog**: `"Take-home — fee uses gross (÷ 0.83)"` and `"Fee = {amount} ({pct}% of {gross} annual · {monthly} × 12 · grossed up from neto)"` — mixes EN + ES, and ties product to AR fiscal context.
17. **The 🎉 emoji in the "invite accepted" subject line** is the only emoji in the entire transactional email inventory. Decide if it's the voice or an outlier.
18. **`"viewed"` subject fragment in candidate-feedback email**: when there's no rating and no comment, the subject reads `"${reviewer} left viewed on ${candidate}"` — ungrammatical.
19. **Landing FAQ promises read-only post-cancel access** ("you retain read-only access through your billing period end") but `subscription-gate.tsx` blocks the whole UI when canceled. Mismatch worth verifying.
20. **Privacy + Terms `Last updated: April 16, 2026`** is manually stamped and predates the current date. Confirm whether the content still matches.
21. **`parse-document/route.ts:30`** returns its error inside a `200` `{ text: "", error: ... }` shape rather than `NextResponse.json({ error })`. Anomalous; worth a follow-up.
22. **`"Password reset!"`** with exclamation on client-portal reset success is the only exclamation success heading of its kind.
23. **Inconsistent retry CTA in error toasts**: some say `"Please try again."`, some `"Try again."`, some just end with a period.
24. **`Jobs / Searches`** page H1 uses both terms with a slash. The whole product flip-flops between "job" and "search" (engagement page says "search", job detail says "job"). Pick one as the primary noun.
