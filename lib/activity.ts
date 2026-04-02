import { prisma } from "./prisma";

export async function logActivity({
  action,
  description,
  userId,
  candidateId,
  organizationId,
  metadata = {},
}: {
  action: string;
  description: string;
  userId?: string;
  candidateId?: string;
  organizationId: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      action,
      description,
      userId,
      candidateId,
      organizationId,
      metadata: metadata as any,
    },
  });
}
