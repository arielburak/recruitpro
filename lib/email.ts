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
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 32px; margin: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding: 32px 40px 24px 40px;">
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px 0;">${appName}</h1>
          <h2 style="font-size: 18px; font-weight: 600; color: #111827; margin: 16px 0 12px 0;">${title}</h2>
          <div style="font-size: 14px; line-height: 1.6; color: #4b5563;">${bodyHtml}</div>
          ${
            ctaUrl && ctaLabel
              ? `<div style="margin: 28px 0 8px 0;">
                  <a href="${ctaUrl}" style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; font-size: 14px;">${ctaLabel}</a>
                </div>
                <p style="font-size: 12px; color: #9ca3af; margin: 12px 0 0 0;">Or copy this link: ${ctaUrl}</p>`
              : ""
          }
        </td>
      </tr>
      <tr>
        <td style="padding: 20px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
          You're receiving this because of activity on your ${appName} account. If this wasn't you, you can safely ignore this email.
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
