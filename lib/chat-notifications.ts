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
          // Cliente para identificar la busqueda en el mail: "Senior
          // Engineer @ Acme" en vez de "Senior Engineer" suelto.
          // Mismo motivo que en notifyOnNewJobComment.
          client: { select: { name: true } },
          assignments: {
            select: { userId: true, user: { select: { id: true, email: true, name: true } } },
          },
        },
      },
    },
  });

  if (!submission) return;

  const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
  const jobTitle = submission.job.client?.name
    ? `${submission.job.title} @ ${submission.job.client.name}`
    : submission.job.title;
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
            // Target this specific user (clientUserId set → only they see it)
            await prisma.clientNotification.create({
              data: {
                clientId: submission.job.clientId,
                clientUserId: cu.id,
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
        // Staffing → Client. WhatsApp-group rule: notify only
        // ClientUsers who are members of the ClientJob backing this
        // submission's Job. A hiring contact who wasn't invited to
        // this search shouldn't get a ping (and clicking the notif
        // would 404 them anyway — the portal gates by membership).
        if (submission.job.clientId) {
          const engagement = await prisma.firmEngagement.findFirst({
            where: { jobId: submission.job.id, status: "ACCEPTED" },
            select: { clientJobId: true },
          });

          // Audience: members of the ClientJob if we have one,
          // otherwise the full active client roster (legacy Jobs
          // created directly without a ClientJob mirror — keeps
          // notifications working in those flows).
          const audience = engagement
            ? (
                await prisma.clientJobMember.findMany({
                  where: {
                    clientJobId: engagement.clientJobId,
                    clientUser: { isActive: true, clientId: submission.job.clientId },
                  },
                  select: {
                    clientUser: { select: { id: true, email: true, role: true } },
                  },
                })
              ).map((m) => m.clientUser)
            : await prisma.clientUser.findMany({
                where: { clientId: submission.job.clientId, isActive: true },
                select: { id: true, email: true, role: true },
              });

          const mentionSet = new Set(mentions); // Skip users already notified via mention

          for (const cu of audience) {
            if (mentionSet.has(cu.id)) continue; // already got mention notification
            try {
              await prisma.clientNotification.create({
                data: {
                  clientId: submission.job.clientId,
                  clientUserId: cu.id,
                  type: "comment_posted",
                  title: alertTitle,
                  body: `${authorName} (recruiter): ${truncate(preview, 120)}`,
                  link: `/client-portal/candidates/${submissionId}`,
                  submissionId,
                },
              });
            } catch (e) {
              console.error("[chat-notify] CLIENT_VISIBLE staffing->client in-app failed:", e);
            }
          }

          // No emails on the audience path — only mentions trigger
          // a mail (handled above). The user feedback was clear:
          // "que me avise por mail únicamente cuando alguien me
          // arroba (no cuando responden el chat)". The bell on the
          // portal still gets a notification, which is enough for
          // catch-up.
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

        // No emails on the audience path — mentions are the only
        // mail trigger (see staffing→client side above for the
        // same rule). recipients is kept built only to drive the
        // in-app loop; if a future feature wants opt-in mail for
        // replies, hang it off a per-user preference instead of
        // blasting the whole audience.
        void recipients;
      }
    } catch (e) {
      console.error("[chat-notify] CLIENT_VISIBLE audience notifications failed:", e);
    }
  }

  // INTERNAL and CLIENT_INTERNAL only have the mention notifications handled above.
}

// Candidate-level comments (no submissionId — pinned to the
// Candidate itself rather than a specific submission). Notifies:
//   * Anyone @-mentioned.
//   * The candidate's owner (the recruiter who "owns" them, gets
//     every note even if not mentioned).
//
// There's no client side here because the candidate may belong to
// any number of submissions; the chat is scoped to the staffing
// firm internally.
export async function notifyOnNewCandidateComment(args: {
  candidateId: string;
  content: string;
  mentions: string[]; // staffing user IDs
  authorId: string;
  authorName: string;
}) {
  const { candidateId, content, mentions, authorId, authorName } = args;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, firstName: true, lastName: true, ownerId: true },
  });
  if (!candidate) return;

  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/candidates/${candidate.id}`;
  const preview = stripMarkup(content);

  // Recipient pool: explicit @-mentions + the candidate's owner. We
  // dedupe by user id and skip the author so they don't notify
  // themselves.
  const recipientIds = new Set<string>(mentions);
  if (candidate.ownerId) recipientIds.add(candidate.ownerId);
  recipientIds.delete(authorId);
  if (recipientIds.size === 0) return;

  const mentionSet = new Set(mentions);
  const recipients = await prisma.user.findMany({
    where: { id: { in: Array.from(recipientIds) }, isActive: true },
    select: { id: true, email: true, name: true },
  });

  for (const u of recipients) {
    const isMention = mentionSet.has(u.id);
    try {
      await prisma.userNotification.create({
        data: {
          userId: u.id,
          type: isMention ? "mention" : "comment_posted",
          title: isMention
            ? `${authorName} mentioned you`
            : `${authorName} commented on ${candidateName}`,
          body: truncate(preview, 140),
          link: `/candidates/${candidate.id}`,
        },
      });
    } catch (e) {
      console.error("[chat-notify] candidate notification in-app failed:", e);
    }
    // Email solo cuando hay @-mention. Los owners se enteran por el
    // bell — la regla de producto es: mail unicamente al ser arroba.
    if (!isMention) continue;
    try {
      await sendMentionEmail({
        to: u.email,
        mentionedBy: authorName,
        candidateName,
        jobTitle: "candidate-level note",
        preview,
        url,
      });
    } catch (e) {
      console.error("[chat-notify] candidate notification email failed:", e);
    }
  }
}

// Job-level comments (no submissionId, no candidateId — pinned to
// the Job's Notes tab). Notifies:
//   * Anyone @-mentioned.
//   * Every JobAssignment member ("recruiters working this search").
//
// Previously silent: a comment on the Notes tab never reached any
// teammate working the same job. That meant @-mentions inside
// job-level notes went nowhere AND assignees missed updates.
export async function notifyOnNewJobComment(args: {
  jobId: string;
  content: string;
  mentions: string[]; // staffing user IDs
  authorId: string;
  authorName: string;
}) {
  const { jobId, content, mentions, authorId, authorName } = args;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      assignments: { select: { userId: true } },
      // Cliente para identificar la busqueda en la notificacion:
      // "Mentioned you in Senior FE Engineer @ Acme" es mas util que
      // "Mentioned you in Senior FE Engineer" suelto cuando hay 5
      // jobs con el mismo titulo en distintos clientes.
      client: { select: { name: true } },
    },
  });
  if (!job) return;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/jobs/${job.id}`;
  const preview = stripMarkup(content);
  const jobLabel = job.client?.name ? `${job.title} @ ${job.client.name}` : job.title;

  const recipientIds = new Set<string>(mentions);
  for (const a of job.assignments) recipientIds.add(a.userId);
  recipientIds.delete(authorId);
  if (recipientIds.size === 0) return;

  const mentionSet = new Set(mentions);
  const recipients = await prisma.user.findMany({
    where: { id: { in: Array.from(recipientIds) }, isActive: true },
    select: { id: true, email: true, name: true },
  });

  for (const u of recipients) {
    const isMention = mentionSet.has(u.id);
    try {
      await prisma.userNotification.create({
        data: {
          userId: u.id,
          type: isMention ? "mention" : "comment_posted",
          title: isMention
            ? `${authorName} mentioned you in ${jobLabel}`
            : `${authorName} commented on ${jobLabel}`,
          body: truncate(preview, 140),
          link: `/jobs/${job.id}`,
        },
      });
    } catch (e) {
      console.error("[chat-notify] job notification in-app failed:", e);
    }
    // Email solo cuando hay @-mention. Los asignados al job se
    // enteran por el bell — la regla de producto es: mail unicamente
    // al ser arroba.
    if (!isMention) continue;
    try {
      await sendMentionEmail({
        to: u.email,
        mentionedBy: authorName,
        // jobLabel ya combina "Senior Engineer @ Acme" cuando hay
        // cliente — sin esto el email decia solo el titulo del job
        // y con 5 jobs llamados "Senior Engineer" en distintos
        // clientes nadie sabia cual era.
        candidateName: jobLabel,
        jobTitle: "Job notes",
        preview,
        url,
      });
    } catch (e) {
      console.error("[chat-notify] job notification email failed:", e);
    }
  }
}

// Mention-only fan-out for ClientJob Notes. These comments are
// CLIENT_INTERNAL by design — the agency never sees them — so the
// recipient pool is always ClientUsers. Job-access (members list)
// gates who can be mentioned at the API layer; here we just deliver.
export async function notifyOnNewClientJobComment(args: {
  clientJobId: string;
  content: string;
  mentions: string[]; // ClientUser IDs
  authorId: string; // ClientUser ID of the poster
  authorName: string;
}) {
  const { clientJobId, content, mentions, authorId, authorName } = args;
  if (mentions.length === 0) return;

  const job = await prisma.clientJob.findUnique({
    where: { id: clientJobId },
    select: { id: true, title: true, clientId: true, client: { select: { name: true } } },
  });
  if (!job) return;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/client-portal/jobs/${job.id}`;
  const preview = stripMarkup(content);

  const mentioned = await prisma.clientUser.findMany({
    where: { id: { in: mentions }, clientId: job.clientId, isActive: true },
    select: { id: true, email: true, name: true },
  });

  for (const u of mentioned) {
    if (u.id === authorId) continue;

    try {
      await prisma.clientNotification.create({
        data: {
          clientId: job.clientId,
          clientUserId: u.id,
          type: "mention",
          title: `${authorName} mentioned you in ${job.title}`,
          body: truncate(preview, 140),
          link: `/client-portal/jobs/${job.id}`,
        },
      });
    } catch (e) {
      console.error("[chat-notify] client-job mention in-app failed:", e);
    }
    try {
      await sendMentionEmail({
        to: u.email,
        mentionedBy: authorName,
        candidateName: job.client?.name || "your team",
        jobTitle: job.title,
        preview,
        url,
      });
    } catch (e) {
      console.error("[chat-notify] client-job mention email failed:", e);
    }
  }
}

function stripMarkup(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}
