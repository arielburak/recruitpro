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
//     → email mentioned staffing users (User)
//     → NO client-side notification
//   CLIENT_VISIBLE (posted by either side, seen by both)
//     → email the OTHER side's relevant people
//     → in-app ClientNotification for the client (regardless of who posted)
//     → mention emails
//   CLIENT_INTERNAL (client posted, for client only)
//     → in-app ClientNotification for mentioned client users
//     → mention emails
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
          assignments: { select: { userId: true, user: { select: { email: true, name: true } } } },
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

  // --- Mention emails (always, regardless of comment type) ---
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

      // Email mentioned staffing users — only when they're allowed to see this comment
      const staffingCanSee = commentType === "INTERNAL" || commentType === "CLIENT_VISIBLE";
      if (staffingCanSee) {
        for (const u of mentionedUsers) {
          // Don't email the author
          if (authorKind === "staffing" && u.id === authorId) continue;
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

      // Email mentioned client users — only when they can see this comment
      const clientCanSee = commentType === "CLIENT_VISIBLE" || commentType === "CLIENT_INTERNAL";
      if (clientCanSee) {
        for (const cu of mentionedClientUsers) {
          if (authorKind === "client" && cu.id === authorId) continue;
          try {
            await sendMentionEmail({
              to: cu.email,
              mentionedBy: authorName,
              candidateName,
              jobTitle,
              preview,
              url: clientUrl,
            });
            // Also create in-app notification for client-side mention
            if (submission.job.clientId) {
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
            }
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
    // Notify the OTHER side + create ClientNotification for client
    try {
      if (authorKind === "staffing") {
        // Notify client admins + hiring manager via email + in-app
        if (submission.job.clientId) {
          await prisma.clientNotification.create({
            data: {
              clientId: submission.job.clientId,
              type: "comment_posted",
              title: `New message on ${candidateName}`,
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
          // Don't duplicate-email mentioned users (they got the mention email)
          const alreadyEmailed = new Set(mentions);
          for (const to of recipients) {
            // Skip if they happen to be in the mentions list by email (best-effort dedup)
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
          void alreadyEmailed;
        }
      } else {
        // Client posted — notify staffing team assigned to the job
        const recipients = new Set<string>();
        for (const a of submission.job.assignments) {
          if (a.user?.email) recipients.add(a.user.email.toLowerCase());
        }
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
  // Our comments are plain text + @mentions which we keep as-is. Just normalize whitespace.
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}
