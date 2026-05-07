import { prisma } from "@/lib/prisma";

/**
 * Converts PendingFirmInvite records into person-level FirmEngagement
 * records for a user who just registered or logged in.
 *
 * Invites are person-scoped: the resulting engagement carries the email +
 * userId of the specific recruiter who claimed it, so only they (plus
 * their firm's admins) will see it.
 *
 * Called after registration and when viewing engagements.
 */
export async function processPendingInvites(email: string, organizationId: string, userId: string) {
  const normalized = email.trim().toLowerCase();
  const pending = await prisma.pendingFirmInvite.findMany({
    where: { email: normalized },
  });

  if (pending.length === 0) return 0;

  let created = 0;

  for (const invite of pending) {
    // Skip if this exact person was already turned into an engagement for
    // this job (e.g. they were invited again after registering and the
    // pending row lingered).
    const existing = await prisma.firmEngagement.findUnique({
      where: {
        clientJobId_invitedEmail: {
          clientJobId: invite.clientJobId,
          invitedEmail: normalized,
        },
      },
    });

    if (!existing) {
      await prisma.firmEngagement.create({
        data: {
          clientJobId: invite.clientJobId,
          organizationId,
          invitedEmail: normalized,
          invitedUserId: userId,
          message: invite.message,
        },
      });
      created++;
    }

    // Delete the pending invite regardless (it's been processed)
    await prisma.pendingFirmInvite.delete({
      where: { id: invite.id },
    });
  }

  return created;
}
