import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "noreply@recruitingats.com";
const appName = "Recruiting ATS";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Outbound-mail safety rails. Set these in any env where real
// addresses could land in the To field while we're still testing:
//
//   DISABLE_OUTBOUND_EMAIL=1   — drop every send, log the subject/body
//                                so the flow still completes without
//                                contacting anyone.
//   EMAIL_ALLOWLIST=a@x,b@y    — only addresses in this comma list go
//                                out; the rest are dropped with a log.
//                                Lets us test with our own inboxes
//                                without ever risking a client mail.
//
// Production should leave both unset.
const outboundDisabled =
  process.env.DISABLE_OUTBOUND_EMAIL === "1" ||
  process.env.DISABLE_OUTBOUND_EMAIL === "true";
const allowlist = (process.env.EMAIL_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  // Optional Reply-To header. Use when the recipient's instinct will
  // be to "reply" to a real person — interview invites that say
  // "contact ${recruiterName}", mention emails, etc. Without this
  // their reply lands in noreply@ and vanishes. Default is unset
  // (no Reply-To header) so transactional account mails (verify,
  // reset, welcome) stay on the noreply@ envelope.
  replyTo?: string;
  // Schedule el envío para una fecha futura (Resend `scheduledAt`).
  // Usado por el getting-started email para que llegue 1h post-signup
  // en vez de inmediato. Resend ISO 8601 format. Si no se pasa, envío
  // inmediato.
  scheduledAt?: Date;
};

// Shared copy helpers — single source of truth for the structural
// pieces every transactional email shares. The wrapTemplate handles
// VISUAL consistency (card, fonts, colors); these helpers handle
// TONAL/COPY consistency (greeting shape, quote box, footers). When
// you write a new sendX, compose the body using these — don't reroll
// the patterns.

// "Hi {first name}," / "Hi there," default. Always returns a wrapped
// <p>. Centralizes the first-name extraction so we never end up with
// "Hi  ," (double space) or "Hi Federico Bochinsky," (full name).
function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const trimmed = full.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function greeting(recipientName?: string | null): string {
  const f = firstName(recipientName);
  return `<p>Hi ${f || "there"},</p>`;
}

// Slack-style quote / preview block. Use for chat previews, mention
// excerpts, candidate-shared notes, feedback comments — anything
// where we're echoing user-generated content as a blockquote.
// `accent` defaults to indigo to match the CTA button; pass "emerald"
// for "warm" notifications (candidate shared, feedback).
function quoteBlock(
  text: string,
  opts?: { label?: string; accent?: "indigo" | "emerald" }
): string {
  const trimmed = text.length > 240 ? `${text.slice(0, 240)}…` : text;
  const accentColor = opts?.accent === "emerald" ? "#10b981" : "#6366f1";
  const labelHtml = opts?.label
    ? `<p style="font-size: 12px; color: #6b7280; margin: 0 0 6px 0; font-weight: 600;">${opts.label}</p>`
    : "";
  return `<div style="margin: 16px 0;">
      ${labelHtml}
      <div style="padding: 12px 14px; background: #f9fafb; border-left: 3px solid ${accentColor}; border-radius: 4px; font-size: 14px; color: #374151; white-space: pre-wrap;">${trimmed}</div>
    </div>`;
}

// Interview details table — used by sendInterviewInviteEmail (to
// candidate) and sendInterviewInviteToClientContact (to client
// contact). Same shape minus/plus a candidate row. Centralizing here
// means a future field (timezone offset, reschedule link, etc.) gets
// added once and lights up both call sites.
function interviewDetailsTable(args: {
  candidate?: { name: string };
  job: { title: string };
  client: { name: string };
  date: string;
  time: string;
  endTime: string;
  timezone: string;
  type: string;
  location?: string;
  notes?: string;
}): string {
  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding: 6px 12px 6px 0; color: #6b7280; font-size: 13px; vertical-align: top; white-space: nowrap;">${label}</td>
      <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${value}</td>
    </tr>`;
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 18px 0; border-collapse: collapse;">
      ${args.candidate ? row("Candidate", args.candidate.name) : ""}
      ${row("Job", args.job.title)}
      ${row("Client", args.client.name)}
      ${row("When", `${args.date} · ${args.time}–${args.endTime} (${args.timezone})`)}
      ${row("Type", args.type)}
      ${args.location ? row("Where", args.location) : ""}
      ${args.notes ? row("Notes", args.notes) : ""}
    </table>`;
}

async function sendEmail({ to, subject, html, replyTo, scheduledAt }: SendArgs) {
  if (outboundDisabled) {
    console.warn(
      `[email] DISABLE_OUTBOUND_EMAIL set — dropping mail to ${to}: ${subject}`
    );
    return { skipped: true as const, reason: "disabled" };
  }
  if (allowlist.length > 0 && !allowlist.includes(to.trim().toLowerCase())) {
    console.warn(
      `[email] ${to} not in EMAIL_ALLOWLIST — dropping mail: ${subject}`
    );
    return { skipped: true as const, reason: "allowlist" };
  }
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent to ${to}: ${subject}`
    );
    console.log(`[email] HTML body:\n${html}`);
    return { skipped: true as const, reason: "no_key" };
  }

  const { data, error } = await resend.emails.send({
    from: `${appName} <${fromAddress}>`,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
    // Resend `scheduledAt` admite ISO 8601 o human-readable ("in 1 hour").
    // Pasamos ISO para que el endpoint lo procese sin ambigüedad.
    ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
  });

  if (error) {
    console.error("[email] Resend send failed:", error);
    throw new Error(error.message || "Failed to send email");
  }

  return { id: data?.id };
}

function wrapTemplate(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  // Slack-style: outer neutral page, inner card with subtle tint, big bold heading,
  // prominent full-width button, small helper text underneath.
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; padding: 32px 16px; margin: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
      <tr>
        <td style="padding: 0 0 14px 0;">
          <p style="margin: 0; font-size: 13px; font-weight: 600; color: #6b7280; letter-spacing: 0.4px;">${appName.toUpperCase()}</p>
        </td>
      </tr>
      <tr>
        <td style="background: #f9f4ef; border-radius: 14px; padding: 40px 40px 36px 40px;">
          <h1 style="font-size: 28px; font-weight: 800; color: #111827; margin: 0 0 18px 0; line-height: 1.25; letter-spacing: -0.3px;">${title}</h1>
          <div style="font-size: 15px; line-height: 1.6; color: #374151;">${bodyHtml}</div>
          ${
            ctaUrl && ctaLabel
              ? `<div style="margin: 28px 0 0 0;">
                  <a href="${ctaUrl}" style="display: inline-block; width: 100%; box-sizing: border-box; text-align: center; background: #4a154b; color: #fff; text-decoration: none; padding: 16px 22px; border-radius: 10px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; text-transform: uppercase;">${ctaLabel}</a>
                </div>
                <p style="font-size: 12px; color: #9ca3af; margin: 14px 0 0 0; word-break: break-all;">Or open this link in your browser: <a href="${ctaUrl}" style="color: #6b7280; text-decoration: underline;">${ctaUrl}</a></p>`
              : ""
          }
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 8px 0 8px; font-size: 12px; color: #9ca3af; line-height: 1.5;">
          You're receiving this because of activity on your ${appName} account.<br/>
          If this wasn't you, you can safely ignore this email.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  recipientName,
}: {
  to: string;
  resetUrl: string;
  recipientName?: string;
}) {
  const html = wrapTemplate(
    "Reset your password",
    `${greeting(recipientName)}
     <p>We received a request to reset your ${appName} password. Click the button below to choose a new one. This link expires in 1 hour.</p>
     <p>If you didn't request this, ignore — your password stays unchanged.</p>`,
    resetUrl,
    "Reset Password"
  );

  return sendEmail({
    to,
    subject: `Reset your ${appName} password`,
    html,
  });
}

export async function sendJobAssignedEmail({
  to,
  recipientName,
  assignerName,
  jobTitle,
  clientName,
  role,
  jobUrl,
}: {
  to: string;
  recipientName: string;
  assignerName: string;
  jobTitle: string;
  clientName: string | null;
  role: string | null;
  jobUrl: string;
}) {
  // Sent when a recruiter is added to a Job via JobAssignment. The
  // line we surface to the user mirrors the in-app notification:
  // role + client so the recruiter can place the search in their
  // head before opening the link.
  const subject = `${assignerName} added you to ${jobTitle}`;
  const context = [role, clientName].filter(Boolean).join(" · ");
  const html = wrapTemplate(
    `You're now collaborating on ${jobTitle}`,
    `${greeting(recipientName)}
     <p>${assignerName} just added you to the search for <strong>${jobTitle}</strong>${
       context ? ` (${context})` : ""
     }. Open the job to see the pipeline and start sourcing.</p>`,
    jobUrl,
    "Open Job",
  );

  return sendEmail({ to, subject, html });
}

export async function sendTeamInviteEmail({
  to,
  inviteUrl,
  inviterName,
  organizationName,
  recipientName,
}: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  organizationName: string;
  recipientName?: string;
}) {
  const html = wrapTemplate(
    `You've been invited to join ${organizationName}`,
    `${greeting(recipientName)}
     <p><strong>${inviterName}</strong> invited you to collaborate on ${appName}.</p>
     <p>${appName} is where ${organizationName} runs their searches — accept to join the team there.</p>
     <p>This link expires in 7 days.</p>`,
    inviteUrl,
    "Accept Invitation"
  );

  return sendEmail({
    to,
    subject: `${inviterName} invited you to ${organizationName}`,
    html,
  });
}

export async function sendClientPortalShareEmail({
  to,
  portalUrl,
  recruiterName,
  firmName,
  jobTitle,
  clientName,
  candidateCount,
}: {
  to: string;
  portalUrl: string;
  recruiterName: string;
  firmName: string;
  jobTitle?: string;
  clientName: string;
  candidateCount?: number;
}) {
  const jobLine = jobTitle
    ? `<p style="font-size: 16px; font-weight: 600; color: #111827; margin: 16px 0 4px 0;">${jobTitle}</p>`
    : "";
  const candidateLine = candidateCount
    ? `<p style="color: #6b7280;">${candidateCount} candidate${candidateCount !== 1 ? "s" : ""} have been shared for your review.</p>`
    : `<p style="color: #6b7280;">Candidates have been shared for your review.</p>`;

  const html = wrapTemplate(
    `${firmName} shared candidates with you`,
    `${greeting(clientName)}
     <p><strong>${recruiterName}</strong> from <strong>${firmName}</strong> has shared a candidate shortlist with you on ${appName}.</p>
     ${jobLine}
     ${candidateLine}
     <p>Sign in to your client portal to review profiles, rate candidates, and leave feedback.</p>`,
    portalUrl,
    "Review Candidates"
  );

  return sendEmail({
    to,
    subject: `${firmName} shared candidates with you${jobTitle ? ` for ${jobTitle}` : ""}`,
    html,
  });
}

export async function sendInterviewInviteEmail({
  to,
  candidateName,
  jobTitle,
  clientName,
  interviewDate,
  interviewTime,
  interviewEndTime,
  timezone,
  interviewType,
  meetingLink,
  location,
  notes,
  recruiterName,
  recruiterEmail,
}: {
  to: string;
  candidateName: string;
  jobTitle: string;
  clientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewEndTime: string;
  timezone: string;
  interviewType: string;
  meetingLink?: string;
  location?: string;
  notes?: string;
  recruiterName: string;
  recruiterEmail?: string;
}) {
  const typeLabel =
    interviewType === "VIDEO" ? "Video Call" : interviewType === "PHONE" ? "Phone Call" : "In Person";

  const tzLabel = timezone.split("/").pop()?.replace(/_/g, " ") || timezone;

  const detailsHtml = interviewDetailsTable({
    job: { title: jobTitle },
    client: { name: clientName },
    date: interviewDate,
    time: interviewTime,
    endTime: interviewEndTime,
    timezone: tzLabel,
    type: typeLabel,
    location,
    notes,
  });

  const html = wrapTemplate(
    "Interview Invitation",
    `${greeting(candidateName)}
     <p>You've been scheduled for an interview. Here are the details:</p>
     ${detailsHtml}
     <p style="margin-top: 16px;">If you need to reschedule or have any questions, please contact <strong>${recruiterName}</strong>.</p>
     <p>Good luck!</p>`,
    meetingLink || undefined,
    meetingLink ? "Join Meeting" : undefined
  );

  return sendEmail({
    to,
    subject: `Interview Invitation: ${jobTitle} @ ${clientName}`,
    html,
    ...(recruiterEmail ? { replyTo: recruiterEmail } : {}),
  });
}

export async function sendInterviewInviteToClientContact({
  to,
  contactName,
  candidateName,
  jobTitle,
  clientName,
  interviewDate,
  interviewTime,
  interviewEndTime,
  timezone,
  interviewType,
  meetingLink,
  location,
  notes,
  recruiterName,
  firmName,
  recruiterEmail,
}: {
  to: string;
  contactName: string;
  candidateName: string;
  jobTitle: string;
  clientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewEndTime: string;
  timezone: string;
  interviewType: string;
  meetingLink?: string;
  location?: string;
  notes?: string;
  recruiterName: string;
  firmName: string;
  recruiterEmail?: string;
}) {
  const typeLabel =
    interviewType === "VIDEO" ? "Video Call" : interviewType === "PHONE" ? "Phone Call" : "In Person";
  const tzLabel = timezone.split("/").pop()?.replace(/_/g, " ") || timezone;

  const detailsHtml = interviewDetailsTable({
    candidate: { name: candidateName },
    job: { title: jobTitle },
    client: { name: clientName },
    date: interviewDate,
    time: interviewTime,
    endTime: interviewEndTime,
    timezone: tzLabel,
    type: typeLabel,
    location,
    notes,
  });

  const html = wrapTemplate(
    "Interview Scheduled",
    `${greeting(contactName)}
     <p><strong>${recruiterName}</strong> from <strong>${firmName}</strong> has scheduled an interview for your review:</p>
     ${detailsHtml}
     <p style="margin-top: 16px;">Thanks for taking the time — let us know if you need to reschedule.</p>`,
    meetingLink || undefined,
    meetingLink ? "Join Meeting" : undefined
  );

  return sendEmail({
    to,
    subject: `Interview Scheduled: ${candidateName} for ${jobTitle} @ ${clientName}`,
    html,
    ...(recruiterEmail ? { replyTo: recruiterEmail } : {}),
  });
}

export async function sendClientTeamInviteEmail({
  to,
  inviteUrl,
  inviterName,
  companyName,
  memberName,
  title,
}: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  companyName: string;
  memberName: string;
  title?: string;
}) {
  const titleLine = title ? `<p style="color: #6b7280;">Role: <strong>${title}</strong></p>` : "";
  const html = wrapTemplate(
    `You've been added to ${companyName}'s hiring team`,
    `${greeting(memberName)}
     <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong>'s hiring team on ${appName}.</p>
     ${titleLine}
     <p>With your account, you can:</p>
     <ul style="color: #4b5563; padding-left: 20px;">
       <li>View and post job openings</li>
       <li>Track recruiting firm activity</li>
       <li>Review shared candidates</li>
       <li>Manage your team's hiring pipeline</li>
     </ul>
     <p>Click below to set your password and get started.</p>`,
    inviteUrl,
    "Set Password & Get Started"
  );

  return sendEmail({
    to,
    subject: `${inviterName} invited you to ${companyName}'s hiring team`,
    html,
  });
}

// Sent to the client contact who invited an agency to a search,
// when that agency accepts the engagement. Heads-up that the firm
// is now active on the search and can start sharing candidates.
export async function sendEngagementAcceptedEmail({
  to,
  inviterName,
  firmName,
  jobTitle,
  jobUrl,
}: {
  to: string;
  inviterName: string;
  firmName: string;
  jobTitle: string;
  jobUrl: string;
}) {
  const html = wrapTemplate(
    `${firmName} accepted ${jobTitle}`,
    `${greeting(inviterName)}
     <p><strong>${firmName}</strong> just accepted your invitation to work on <strong>${jobTitle}</strong>. They can now start sharing candidates and chatting with your team.</p>`,
    jobUrl,
    "Open Search"
  );
  return sendEmail({
    to,
    subject: `${firmName} accepted ${jobTitle}`,
    html,
  });
}

// Sent when an existing teammate gets added to a specific Job on
// the client portal. Different from the team-invite path (no
// set-password — they already have a portal account); this just
// tells them "you can now see this search" and links straight to it.
export async function sendClientJobAccessGrantedEmail({
  to,
  memberName,
  inviterName,
  companyName,
  jobTitle,
  jobUrl,
}: {
  to: string;
  memberName: string;
  inviterName: string;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
}) {
  const html = wrapTemplate(
    `${inviterName} added you to ${jobTitle}`,
    `${greeting(memberName)}
     <p><strong>${inviterName}</strong> just gave you access to <strong>${jobTitle}</strong> on ${companyName}'s portal.</p>
     <p>You can now review shared candidates, post notes for the team, and follow the pipeline.</p>`,
    jobUrl,
    "Open Search"
  );

  return sendEmail({
    to,
    subject: `${inviterName} added you to ${jobTitle}`,
    html,
  });
}

export async function sendNewMessageEmail({
  to,
  fromName,
  fromRole,
  candidateName,
  jobTitle,
  preview,
  portalUrl,
  isInternal,
  recipientName,
  senderEmail,
}: {
  to: string;
  fromName: string;
  fromRole: "recruiter" | "client" | "team";
  candidateName: string;
  jobTitle: string;
  preview: string;
  portalUrl: string;
  isInternal?: boolean;
  recipientName?: string;
  senderEmail?: string;
}) {
  const roleLabel =
    fromRole === "recruiter" ? "a recruiter" : fromRole === "client" ? "the client" : "your team";
  const channelLabel = isInternal ? "your internal channel" : "the shared chat";

  const html = wrapTemplate(
    `New message about ${candidateName}`,
    `${greeting(recipientName)}
     <p><strong>${fromName}</strong> (${roleLabel}) left a new message in ${channelLabel} for <strong>${candidateName}</strong> (<em>${jobTitle}</em>):</p>
     ${quoteBlock(preview, { accent: "indigo" })}`,
    portalUrl,
    "View Conversation"
  );

  return sendEmail({
    to,
    subject: `New message on ${candidateName} — ${jobTitle}`,
    html,
    ...(senderEmail ? { replyTo: senderEmail } : {}),
  });
}

export async function sendMentionEmail({
  to,
  mentionedBy,
  candidateName,
  jobTitle,
  preview,
  url,
  recipientName,
  senderEmail,
}: {
  to: string;
  mentionedBy: string;
  candidateName: string;
  jobTitle: string;
  preview: string;
  url: string;
  recipientName?: string;
  senderEmail?: string;
}) {
  const html = wrapTemplate(
    `${mentionedBy} mentioned you`,
    `${greeting(recipientName)}
     <p><strong>${mentionedBy}</strong> mentioned you in a message about <strong>${candidateName}</strong> (<em>${jobTitle}</em>):</p>
     ${quoteBlock(preview, { accent: "indigo" })}`,
    url,
    "View Conversation"
  );

  return sendEmail({
    to,
    subject: `${mentionedBy} mentioned you — ${candidateName}`,
    html,
    ...(senderEmail ? { replyTo: senderEmail } : {}),
  });
}

export async function sendCandidateSharedEmail({
  to,
  candidateName,
  jobTitle,
  recruiterName,
  firmName,
  clientName,
  portalUrl,
  note,
  recipientName,
  recruiterEmail,
}: {
  to: string;
  candidateName: string;
  jobTitle: string;
  recruiterName: string;
  firmName: string;
  clientName: string;
  portalUrl: string;
  note?: string;
  recipientName?: string;
  recruiterEmail?: string;
}) {
  const noteBlock = note
    ? quoteBlock(note, { label: `Note from ${recruiterName}:`, accent: "emerald" })
    : "";

  const html = wrapTemplate(
    `New candidate for ${jobTitle}`,
    `${greeting(recipientName)}
     <p><strong>${recruiterName}</strong> from <strong>${firmName}</strong> just shared a new candidate with <strong>${clientName}</strong>:</p>
     <p style="font-size: 17px; font-weight: 600; color: #111827; margin: 16px 0 4px 0;">${candidateName}</p>
     <p style="color: #6b7280; margin: 0;">for <strong>${jobTitle}</strong></p>
     ${noteBlock}
     <p style="margin-top: 20px;">Sign in to the client portal to view the full profile, download their resume, and leave feedback.</p>`,
    portalUrl,
    "View Candidate"
  );

  return sendEmail({
    to,
    subject: `New candidate shared: ${candidateName} for ${jobTitle}`,
    html,
    ...(recruiterEmail ? { replyTo: recruiterEmail } : {}),
  });
}

export async function sendInviteAcceptedEmail({
  to,
  inviterName,
  newMemberName,
  newMemberEmail,
  organizationName,
  teamUrl,
}: {
  to: string;
  inviterName: string;
  newMemberName: string;
  newMemberEmail: string;
  organizationName: string;
  teamUrl: string;
}) {
  // Sent al inviter cuando el invitee acepta — cierra el loop "le mande
  // un invite, ¿se subió?". Empuja al inviter a sumar mas gente
  // (growth loop: cada invitee que acepta es revenue nuevo + un user
  // mas que puede invitar).
  const subject = `${newMemberName} joined ${organizationName}`;
  const html = wrapTemplate(
    `🎉 ${newMemberName} accepted your invite`,
    `${greeting(inviterName)}
     <p><strong>${newMemberName}</strong> (${newMemberEmail}) just joined <strong>${organizationName}</strong> on ${appName}.</p>
     <p>They can now see the searches they're assigned to and collaborate with you on candidates and clients.</p>
     <p>Want to keep growing the team? Send another invite from <a href="${teamUrl}">My Team</a>.</p>`,
    teamUrl,
    "Open My Team",
  );

  return sendEmail({ to, subject, html });
}

export async function sendStaffingMemberWelcomeEmail({
  to,
  recipientName,
  organizationName,
  appUrl,
}: {
  to: string;
  recipientName: string;
  organizationName: string;
  appUrl: string;
}) {
  // Sent after a teammate accepts an invite via /api/invite/[token].
  // The invite mail asked them to set a password; this one closes
  // the loop with "your account is live, here's the entry point"
  // — symmetric to sendClientPortalWelcomeEmail. Without it the
  // invited member never sees anything saying "you're verified",
  // which surfaced as the "no se le manda nada para verificar?"
  // doubt.
  const subject = `Your ${appName} account is ready — ${organizationName}`;
  const html = wrapTemplate(
    `Welcome to ${organizationName} on ${appName}`,
    `${greeting(recipientName)}
     <p>Your ${appName} account at <strong>${organizationName}</strong> is now active and your email has been confirmed. You can sign in any time at the link below.</p>
     <p>From the dashboard you'll see the searches you're assigned to, candidates in flight, and your team's recent activity.</p>`,
    appUrl,
    "Open Dashboard",
  );

  return sendEmail({ to, subject, html });
}

export async function sendClientPortalWelcomeEmail({
  to,
  recipientName,
  clientName,
  portalUrl,
}: {
  to: string;
  recipientName: string;
  clientName: string | null;
  portalUrl: string;
}) {
  // Confirmation mail sent after the hiring contact completes
  // set-password. The invite mail told them "click here to set a
  // password" — this one closes the loop with "your account is
  // live, here's how to come back next time". Without it, users
  // who came through the invite flow never see anything labeled
  // 'verification', which surfaced as "no me llegó el mail de
  // verificación" feedback.
  const company = clientName ? ` for ${clientName}` : "";
  const subject = `Your ${appName} client portal account is ready`;
  const html = wrapTemplate(
    `Welcome to ${appName}`,
    `${greeting(recipientName)}
     <p>Your client portal account${company} is now active. Your email has been confirmed and you can sign in any time at the link below.</p>
     <p>Use the portal to review candidates shared by your recruiter, leave feedback, and track the searches you're hiring on.</p>`,
    portalUrl,
    "Open Portal",
  );

  return sendEmail({ to, subject, html });
}

export async function sendClientSetPasswordEmail({
  to,
  setPasswordUrl,
  clientName,
  firmName,
}: {
  to: string;
  setPasswordUrl: string;
  clientName: string;
  firmName?: string;
}) {
  const sharer = firmName ? `<strong>${firmName}</strong>` : "A recruiting firm";
  const html = wrapTemplate(
    "Set up your client portal account",
    `${greeting(clientName)}
     <p>${sharer} has shared candidates with you on ${appName}. To review them, you'll need to set a password for your account.</p>
     <p>Click below to set your password and access your portal.</p>`,
    setPasswordUrl,
    "Set Password & Sign In"
  );

  return sendEmail({
    to,
    subject: `Set up your ${appName} client portal account`,
    html,
  });
}

export async function sendCandidateFeedbackEmail({
  to,
  recruiterName,
  candidateName,
  jobTitle,
  clientCompanyName,
  reviewerName,
  rating,
  comment,
  candidateUrl,
}: {
  to: string;
  recruiterName?: string;
  candidateName: string;
  jobTitle: string;
  clientCompanyName: string;
  reviewerName: string;
  rating?: number | null;
  comment?: string | null;
  candidateUrl: string;
}) {
  const ratingBlock =
    rating && rating >= 1 && rating <= 5
      ? `<div style="margin: 12px 0;">
           <span style="font-size: 13px; color: #6b7280;">Rating:</span>
           <span style="margin-left: 8px; font-size: 16px; letter-spacing: 2px;">${"★".repeat(rating)}<span style="color: #e5e7eb;">${"★".repeat(5 - rating)}</span></span>
           <span style="margin-left: 8px; font-size: 13px; color: #6b7280;">(${rating}/5)</span>
         </div>`
      : "";

  const trimmedComment = comment?.trim();
  const commentBlock = trimmedComment
    ? quoteBlock(trimmedComment, { accent: "emerald" })
    : "";

  const subjectFragment =
    rating && rating >= 1 && rating <= 5
      ? `${rating}★ feedback`
      : trimmedComment
      ? "new feedback"
      : "viewed";

  const html = wrapTemplate(
    `New feedback on ${candidateName}`,
    `${greeting(recruiterName)}
     <p><strong>${reviewerName}</strong> at <strong>${clientCompanyName}</strong> just left feedback on <strong>${candidateName}</strong> for <em>${jobTitle}</em>.</p>
     ${ratingBlock}
     ${commentBlock}
     ${!ratingBlock && !commentBlock ? `<p style="color: #6b7280;">They opened the profile but didn&apos;t leave a comment or rating yet.</p>` : ""}`,
    candidateUrl,
    "View Candidate"
  );

  return sendEmail({
    to,
    subject: `${reviewerName} left ${subjectFragment} on ${candidateName}`,
    html,
  });
}

export async function sendEmailVerificationEmail({
  to,
  recipientName,
  verifyUrl,
}: {
  to: string;
  recipientName: string;
  verifyUrl: string;
}) {
  const html = wrapTemplate(
    `Verify your email`,
    `${greeting(recipientName)}
     <p>Thanks for signing up. Click the button to confirm this is your email.</p>
     <p>This link expires in 24 hours.</p>`,
    verifyUrl,
    "Verify Email"
  );
  return sendEmail({
    to,
    subject: `Verify your email — ${appName}`,
    html,
  });
}

// Welcome flow dividido en 2 emails:
//
// 1. sendWelcomeEmail (este) — al instante post-signup. Confirma que
//    la cuenta existe y los manda al dashboard. Corto, sin guía
//    "qué hacer primero" — el dashboard ya tiene un onboarding visual.
// 2. sendGettingStartedEmail (abajo) — 1h después. Con la lista
//    "Add your first client / job / teammate" cuando el user ya
//    exploró un rato. Industry-standard B2B SaaS drip.
//
// Por qué split: el user feedback fue que el welcome con la lista
// "Add your first X" al instante se sentía spam. La cuenta se acaba
// de crear, todavía no exploraron nada, y ya les decimos qué hacer.
// 1h después llega cuando vale la pena.

export async function sendWelcomeEmail({
  to,
  recipientName,
  organizationName,
  dashboardUrl,
  trialEndsAt,
}: {
  to: string;
  recipientName: string;
  organizationName: string;
  dashboardUrl: string;
  trialEndsAt?: Date;
}) {
  const first = firstName(recipientName) || recipientName;

  const trialLine = trialEndsAt
    ? `<p style="color: #6b7280;">Your free trial runs until <strong>${trialEndsAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</strong>. We won't charge until it ends — cancel any time before then and you won't be billed.</p>`
    : "";

  const html = wrapTemplate(
    `You're in, ${first}`,
    `<p><strong>${organizationName}</strong> is live on ${appName}. Take a look around — we'll send you a short getting-started note in a bit.</p>
     ${trialLine}
     <p>Reply to this email if anything's confusing or missing — we read every message.</p>`,
    dashboardUrl,
    "Open Dashboard"
  );

  return sendEmail({
    to,
    subject: `Welcome to ${appName}`,
    html,
  });
}

// Segundo email del welcome flow — la guía "qué hacer primero". Se
// dispara con scheduledAt (Resend) ~1h post-signup. Si Resend no
// soporta el campo, el fallback envía al instante (peor caso = igual
// que antes del split).
export async function sendGettingStartedEmail({
  to,
  recipientName,
  organizationName,
  dashboardUrl,
  scheduledAt,
}: {
  to: string;
  recipientName: string;
  organizationName: string;
  dashboardUrl: string;
  scheduledAt?: Date;
}) {
  const first = firstName(recipientName) || recipientName;

  const origin = dashboardUrl.replace(/\/dashboard\/?$/, "");
  const addClientUrl = `${origin}/clients/new`;
  const addJobUrl = `${origin}/jobs/new`;
  const inviteTeamUrl = `${origin}/settings/team`;

  const html = wrapTemplate(
    `${first}, here's the fastest path to your first placement`,
    `<p>Now that you've had a chance to look around <strong>${organizationName}</strong>, three things worth doing this week:</p>
     <ol style="color: #4b5563; padding-left: 20px; line-height: 1.9;">
       <li><a href="${addClientUrl}" style="color: #4f46e5; font-weight: 600;">Add your first client</a> — set fee structure + payment terms once, reuse for every search.</li>
       <li><a href="${addJobUrl}" style="color: #4f46e5; font-weight: 600;">Post your first job</a> — upload the JD and the parser fills the form for you.</li>
       <li><a href="${inviteTeamUrl}" style="color: #4f46e5; font-weight: 600;">Invite a teammate</a> — collaborate on the same pipeline + share notes.</li>
     </ol>
     <p>Reply to this email if anything's confusing or missing — we read every message and ship fast.</p>`,
    dashboardUrl,
    "Open Dashboard"
  );

  return sendEmail({
    to,
    subject: `Getting started on ${appName}`,
    html,
    scheduledAt,
  });
}
