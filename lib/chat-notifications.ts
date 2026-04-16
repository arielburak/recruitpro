import { prisma } from "./prisma";
import { sendNewMessageEmail, sendMentionEmail } from "./email";

type NotifyArgs = {
  submissionId: string;
  commentType: "INTERNAL" | "CLIENT_VISIBLE" | "CLIENT_INTERNAL";
  content: string;
  mentions: string[]; // user/clientUser IDs
  authorKind: "staffing" | "client";
  authorId: string;
  authorName: string;
};

// Centralized notification logic for new comments posted in a candidate chat.
// Called AFTER the comment is created successfully.
//
// Behavior matrix:
//   INTERNAL (staffing posted, for staffing only)
//     → email + UserNotification to mentioned staffing users
//     → NO client-side notification
//   CLIENT_VISIBLE (posted by either side, seen by both)
//     → email + in-app notification to the OTHER side's relevant people
//     → mention emails + in-app notifications
//   CLIENT_INTERNAL (client posted, for client team only)
//     → in-app ClientNotification + email for mentioned client users
//     → NO staffing-side notification
export async function notifyOnNewComment(args: NotifyArgs) {
  const { submissionId, commentType, content, mentions, authorKind, authorId, authorName } = args;

  const submission = await prisma.candidateSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      jobId: true,
      candidateId: true,
      candidate: { select: { firstName: true, lastName: true } },
      job: {
        select: {
          id: true,
          title: true,
          clientId: true,
          organizationId: true,
          assignments: {
            select: { userId: true, user: { select: { id: true, email: true, name: true } } },
          },
        },
      },
    },
  });

  if (!submission) return;

  const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
  const jobTitle = submission.job.title;
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const staffingUrl = `${baseUrl}/candidates/${submission.candidateId}?submissionId=${submissionId}`;
  const clientUrl = `${baseUrl}/client-portal/candidates/${submissionId}`;

  const preview = stripMarkup(content);
  const alertTitle = `New comment on ${candidateName} — ${jobTitle}`;

  // --- Mentions ---
  if (mentions.length > 0) {
    try {
      const [mentionedUsers, mentionedClientUsers] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: mentions }, isActive: true },
          select: { id: true, email: true, name: true },
        }),
        prisma.clientUser.findMany({
          where: { id: { in: mentions }, isActive: true },
          select: { id: true, email: true, name: true },
        }),
      ]);

      const staffingCanSee = commentType === "INTERNAL" || commentType === "CLIENT_VISIBLE";
      if (staffingCanSee) {
        for (const u of mentionedUsers) {
          if (authorKind === "staffing" && u.id === authorId) continue;
          // In-app notification
          try {
            await prisma.userNotification.create({
              data: {
                userId: u.id,
                type: "mention",
                title: `${authorName} mentioned you`,
                body: truncate(preview, 140),
                link: `/candidates/${submission.candidateId}?submissionId=${submissionId}`,
                submissionId,
              },
            });
          } catch (e) {
            console.error("[chat-notify] staffing mention in-app failed:", e);
          }
          // Email
          try {
            await sendMentionEmail({
              to: u.email,
              mentionedBy: authorName,
              candidateName,
              jobTitle,
              preview,
              url: staffingUrl,
            });
          } catch (e) {
            console.error("[chat-notify] mention email (staffing) failed:", e);
          }
        }
      }

      const clientCanSee = commentType === "CLIENT_VISIBLE" || commentType === "CLIENT_INTERNAL";
      if (clientCanSee && submission.job.clientId) {
        for (const cu of mentionedClientUsers) {
          if (authorKind === "client" && cu.id === authorId) continue;
          try {
            await prisma.clientNotification.create({
              data: {
                clientId: submission.job.clientId,
                type: "mention",
                title: `${authorName} mentioned you`,
                body: truncate(preview, 140),
                link: `/client-portal/candidates/${submissionId}`,
                submissionId,
              },
            });
          } catch (e) {
            console.error("[chat-notify] client mention in-app failed:", e);
          }
          try {
            await sendMentionEmail({
              to: cu.email,
              mentionedBy: authorName,
              candidateName,
              jobTitle,
              preview,
              url: clientUrl,
            });
          } catch (e) {
            console.error("[chat-notify] mention email (client) failed:", e);
          }
        }
      }
    } catch (e) {
      console.error("[chat-notify] mention handling failed:", e);
    }
  }

  // --- Audience notifications ---
  if (commentType === "CLIENT_VISIBLE") {
    try {
      if (authorKind === "staffing") {
        // Staffing → Client: ClientNotification + emails to client side
        if (submission.job.clientId) {
          await prisma.clientNotification.create({
            data: {
              clientId: submission.job.clientId,
              type: "comment_posted",
              title: alertTitle,
              body: `${authorName} (recruiter): ${truncate(preview, 120)}`,
              link: `/client-portal/candidates/${submissionId}`,
              submissionId,
            },
          });

          const [client, clientAdmins] = await Promise.all([
            prisma.client.findUnique({
              where: { id: submission.job.clientId },
              select: { contactEmail: true },
            }),
            prisma.clientUser.findMany({
              where: { clientId: submission.job.clientId, isActive: true, role: "ADMIN" },
              select: { email: true },
            }),
          ]);

          const recipients = new Set<string>();
          if (client?.contactEmail) recipients.add(client.contactEmail.toLowerCase());
          for (const a of clientAdmins) recipients.add(a.email.toLowerCase());
          for (const to of recipients) {
            try {
              await sendNewMessageEmail({
                to,
                fromName: authorName,
                fromRole: "recruiter",
                candidateName,
                jobTitle,
                preview,
                portalUrl: clientUrl,
              });
            } catch (e) {
              console.error("[chat-notify] CLIENT_VISIBLE staffing->client email failed:", e);
            }
          }
        }
      } else {
        // Client → Staffing: UserNotification for each assigned recruiter + emails
        const recipients = new Set<string>();
        const userIds = new Set<string>();
        for (const a of submission.job.assignments) {
          if (a.user?.id) userIds.add(a.user.id);
          if (a.user?.email) recipients.add(a.user.email.toLowerCase());
        }

        // In-app notifications
        for (const uid of userIds) {
          try {
            await prisma.userNotification.create({
              data: {
                userId: uid,
                type: "comment_posted",
                title: alertTitle,
                body: `${authorName} (client): ${truncate(preview, 120)}`,
                link: `/candidates/${submission.candidateId}?submissionId=${submissionId}`,
                submissionId,
              },
            });
          } catch (e) {
            console.error("[chat-notify] client->staffing in-app notification failed:", e);
          }
        }

        // Emails
        for (const to of recipients) {
          try {
            await sendNewMessageEmail({
              to,
              fromName: authorName,
              fromRole: "client",
              candidateName,
              jobTitle,
              preview,
              portalUrl: staffingUrl,
            });
          } catch (e) {
            console.error("[chat-notify] CLIENT_VISIBLE client->staffing email failed:", e);
          }
        }
      }
    } catch (e) {
      console.error("[chat-notify] CLIENT_VISIBLE audience notifications failed:", e);
    }
  }

  // INTERNAL and CLIENT_INTERNAL only have the mention notifications handled above.
}

function stripMarkup(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}
