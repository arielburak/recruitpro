import { prisma } from "@/lib/prisma";

/**
 * Converts PendingFirmInvite records into FirmEngagement records
 * for a user who just registered or logged in.
 *
 * Called after registration and when viewing engagements.
 */
export async function processPendingInvites(email: string, organizationId: string) {
  const pending = await prisma.pendingFirmInvite.findMany({
    where: { email },
  });

  if (pending.length === 0) return 0;

  let created = 0;

  for (const invite of pending) {
    // Check if engagement already exists for this firm + job
    const existing = await prisma.firmEngagement.findUnique({
      where: {
        clientJobId_organizationId: {
          clientJobId: invite.clientJobId,
          organizationId,
        },
      },
    });

    if (!existing) {
      await prisma.firmEngagement.create({
        data: {
          clientJobId: invite.clientJobId,
          organizationId,
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
