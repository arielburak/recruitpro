import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "noreply@recruitingats.com";
const appName = "Recruiting ATS";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail({ to, subject, html }: SendArgs) {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent to ${to}: ${subject}`
    );
    console.log(`[email] HTML body:\n${html}`);
    return { skipped: true as const };
  }

  const { data, error } = await resend.emails.send({
    from: `${appName} <${fromAddress}>`,
    to,
    subject,
    html,
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
    `<p>Hi${recipientName ? ` ${recipientName}` : ""},</p>
     <p>We received a request to reset your ${appName} password. Click the button below to choose a new one. This link will expire in 1 hour.</p>`,
    resetUrl,
    "Reset password"
  );

  return sendEmail({
    to,
    subject: `Reset your ${appName} password`,
    html,
  });
}

export async function sendTeamInviteEmail({
  to,
  inviteUrl,
  inviterName,
  organizationName,
}: {
  to: string;
  inviteUrl: string;
  inviterName: string;
  organizationName: string;
}) {
  const html = wrapTemplate(
    `You've been invited to join ${organizationName}`,
    `<p>${inviterName} has invited you to collaborate on ${appName}, an applicant tracking system used by their recruiting team.</p>
     <p>Accept the invitation to create your account and get started. This link expires in 7 days.</p>`,
    inviteUrl,
    "Accept invitation"
  );

  return sendEmail({
    to,
    subject: `${inviterName} invited you to ${organizationName} on ${appName}`,
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
    `<p>Hi ${clientName},</p>
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
}) {
  const typeLabel =
    interviewType === "VIDEO" ? "Video Call" : interviewType === "PHONE" ? "Phone Call" : "In Person";

  const tzLabel = timezone.split("/").pop()?.replace(/_/g, " ") || timezone;

  let detailsHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6; width: 120px;">Position</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${jobTitle} @ ${clientName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Date</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${interviewDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Time</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${interviewTime} - ${interviewEndTime} (${tzLabel})</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Format</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${typeLabel}</td>
      </tr>
      ${location ? `<tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Location</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${location}</td>
      </tr>` : ""}
    </table>`;

  if (notes) {
    detailsHtml += `<p style="font-size: 13px; color: #6b7280; margin: 12px 0 4px 0;">Additional notes:</p>
    <p style="font-size: 14px; color: #374151; background: #f9fafb; padding: 12px; border-radius: 8px; white-space: pre-wrap;">${notes}</p>`;
  }

  const html = wrapTemplate(
    "Interview Invitation",
    `<p>Hi ${candidateName},</p>
     <p>You have been scheduled for an interview. Here are the details:</p>
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
}) {
  const typeLabel =
    interviewType === "VIDEO" ? "Video Call" : interviewType === "PHONE" ? "Phone Call" : "In Person";
  const tzLabel = timezone.split("/").pop()?.replace(/_/g, " ") || timezone;

  const detailsHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6; width: 120px;">Candidate</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${candidateName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Position</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${jobTitle}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Date</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${interviewDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Time</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${interviewTime} - ${interviewEndTime} (${tzLabel})</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Format</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${typeLabel}</td>
      </tr>
      ${location ? `<tr>
        <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Location</td>
        <td style="padding: 8px 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${location}</td>
      </tr>` : ""}
    </table>
    ${notes ? `<p style="font-size: 13px; color: #6b7280; margin: 12px 0 4px 0;">Additional notes:</p>
    <p style="font-size: 14px; color: #374151; background: #f9fafb; padding: 12px; border-radius: 8px; white-space: pre-wrap;">${notes}</p>` : ""}`;

  const html = wrapTemplate(
    "Interview Scheduled",
    `<p>Hi ${contactName},</p>
     <p><strong>${recruiterName}</strong> from <strong>${firmName}</strong> has scheduled an interview for your review:</p>
     ${detailsHtml}
     <p style="margin-top: 16px;">If you need to reschedule, please contact <strong>${recruiterName}</strong>.</p>`,
    meetingLink || undefined,
    meetingLink ? "Join Meeting" : undefined
  );

  return sendEmail({
    to,
    subject: `Interview Scheduled: ${candidateName} for ${jobTitle} @ ${clientName}`,
    html,
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
    `<p>Hi ${memberName},</p>
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
    subject: `${inviterName} invited you to ${companyName}'s hiring team on ${appName}`,
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
}: {
  to: string;
  fromName: string;
  fromRole: "recruiter" | "client" | "team";
  candidateName: string;
  jobTitle: string;
  preview: string;
  portalUrl: string;
  isInternal?: boolean;
}) {
  const roleLabel =
    fromRole === "recruiter" ? "a recruiter" : fromRole === "client" ? "the client" : "your team";
  const channelLabel = isInternal ? "your internal channel" : "the shared chat";

  const trimmedPreview = preview.length > 240 ? `${preview.slice(0, 240)}…` : preview;

  const html = wrapTemplate(
    `New message about ${candidateName}`,
    `<p>Hi,</p>
     <p><strong>${fromName}</strong> (${roleLabel}) left a new message in ${channelLabel} for <strong>${candidateName}</strong> (<em>${jobTitle}</em>):</p>
     <div style="margin: 16px 0; padding: 12px; background: #f9fafb; border-left: 3px solid #6366f1; border-radius: 4px; font-size: 14px; color: #374151; white-space: pre-wrap;">${trimmedPreview}</div>`,
    portalUrl,
    "View Conversation"
  );

  return sendEmail({
    to,
    subject: `New message on ${candidateName} — ${jobTitle}`,
    html,
  });
}

export async function sendMentionEmail({
  to,
  mentionedBy,
  candidateName,
  jobTitle,
  preview,
  url,
}: {
  to: string;
  mentionedBy: string;
  candidateName: string;
  jobTitle: string;
  preview: string;
  url: string;
}) {
  const trimmedPreview = preview.length > 240 ? `${preview.slice(0, 240)}…` : preview;
  const html = wrapTemplate(
    `${mentionedBy} mentioned you`,
    `<p><strong>${mentionedBy}</strong> mentioned you in a message about <strong>${candidateName}</strong> (<em>${jobTitle}</em>):</p>
     <div style="margin: 16px 0; padding: 12px; background: #f9fafb; border-left: 3px solid #10b981; border-radius: 4px; font-size: 14px; color: #374151; white-space: pre-wrap;">${trimmedPreview}</div>`,
    url,
    "View Conversation"
  );

  return sendEmail({
    to,
    subject: `${mentionedBy} mentioned you — ${candidateName}`,
    html,
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
}: {
  to: string;
  candidateName: string;
  jobTitle: string;
  recruiterName: string;
  firmName: string;
  clientName: string;
  portalUrl: string;
  note?: string;
}) {
  const noteBlock = note
    ? `<div style="margin: 16px 0; padding: 12px; background: #f9fafb; border-left: 3px solid #10b981; border-radius: 4px;">
         <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; font-weight: 600;">Note from ${recruiterName}:</p>
         <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${note}</p>
       </div>`
    : "";

  const html = wrapTemplate(
    `New candidate for ${jobTitle}`,
    `<p>Hi,</p>
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
  });
}

export async function sendClientSetPasswordEmail({
  to,
  setPasswordUrl,
  clientName,
}: {
  to: string;
  setPasswordUrl: string;
  clientName: string;
}) {
  const html = wrapTemplate(
    "Set up your client portal account",
    `<p>Hi${clientName ? ` ${clientName}` : ""},</p>
     <p>A recruiting firm has shared candidates with you on ${appName}. To review them, you'll need to set a password for your account.</p>
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
    ? `<div style="margin: 12px 0 0 0; padding: 12px; background: #f9fafb; border-left: 3px solid #6366f1; border-radius: 4px;">
         <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${trimmedComment}</p>
       </div>`
    : "";

  const subjectFragment =
    rating && rating >= 1 && rating <= 5
      ? `${rating}★ feedback`
      : trimmedComment
      ? "new feedback"
      : "viewed";

  const html = wrapTemplate(
    `New feedback on ${candidateName}`,
    `<p>Hi${recruiterName ? ` ${recruiterName.split(" ")[0]}` : ""},</p>
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
  const firstName = recipientName?.split(" ")[0] || recipientName;
  const html = wrapTemplate(
    `Verify your email`,
    `<p>Hi ${firstName},</p>
     <p>Thanks for signing up. Please confirm this email address belongs to you so we can keep your account secure.</p>
     <p>This link expires in 24 hours.</p>`,
    verifyUrl,
    "Verify email"
  );
  return sendEmail({
    to,
    subject: `Verify your email — ${appName}`,
    html,
  });
}

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
  const firstName = recipientName?.split(" ")[0] || recipientName;

  // Deep-link to the specific create flows so the recruiter
  // doesn't have to hunt for them. dashboardUrl is the full
  // origin + /dashboard, so we strip the path and rebuild.
  const origin = dashboardUrl.replace(/\/dashboard\/?$/, "");
  const addClientUrl = `${origin}/clients/new`;
  const addJobUrl = `${origin}/jobs/new`;
  const inviteTeamUrl = `${origin}/settings/team`;

  const trialLine = trialEndsAt
    ? `<p style="color: #6b7280;">Your free trial runs until <strong>${trialEndsAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</strong>. We won't charge anything until it ends — cancel any time before then and you won't be billed.</p>`
    : "";

  const html = wrapTemplate(
    `Welcome, ${firstName}`,
    `<p><strong>${organizationName}</strong> is live on ${appName}. Here's the fastest path to your first placement:</p>
     ${trialLine}
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
    subject: `Welcome to ${appName} — ${organizationName} is ready`,
    html,
  });
}
