import { prisma } from "./prisma";

export async function generateClientPortalToken(
  clientId: string,
  jobId?: string,
  expiresInDays?: number
) {
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const token = await prisma.clientPortalToken.create({
    data: {
      clientId,
      jobId: jobId || null,
      expiresAt,
      isActive: true,
    },
  });

  return token;
}

export async function validateClientPortalToken(token: string) {
  const record = await prisma.clientPortalToken.findUnique({
    where: { token },
  });

  if (!record || !record.isActive) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  return record;
}
