import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFounderEmail } from "@/lib/founder-gate";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OperationsTabs } from "./tabs";

// Panel de operación visible SOLO a founders (Nicolás + Ari).
// Gate por email vs FOUNDER_EMAILS env var (con fallback hardcoded).
// Si alguien más entra → 404 (no le revelamos que existe).
//
// 3 tabs: CEO (estratégico), COO (operacional), Tech (salud sistema).
// Datos en vivo desde la DB en cada request.

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;

  if (!isFounderEmail(email)) {
    notFound();
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    // CEO
    totalAgencies,
    activeAgencies, // con actividad última 30d
    activeSubscriptions,
    pastDueSubscriptions,
    totalSeats,
    // COO
    totalClientOrgs,
    totalAgencyUsers,
    totalClientUsers,
    activeJobs,
    totalCandidates,
    placementsThisMonth,
    silentAgencies, // sin actividad >7d
    recentSignups, // agencies nuevas en 30d
    // Tech
    activitiesLast24h,
    pendingInvites,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({
      where: { activities: { some: { createdAt: { gte: thirtyDaysAgo } } } },
    }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    prisma.subscription.aggregate({
      where: { status: "ACTIVE" },
      _sum: { seats: true },
    }),
    prisma.client.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.clientUser.count({ where: { isActive: true } }),
    prisma.job.count({ where: { status: { in: ["OPEN", "ACTIVE"] } } }),
    prisma.candidate.count(),
    prisma.candidateSubmission.count({
      where: {
        stage: { name: "Placed" },
        updatedAt: { gte: startOfMonth },
      },
    }),
    prisma.organization.count({
      where: {
        NOT: { activities: { some: { createdAt: { gte: sevenDaysAgo } } } },
      },
    }),
    prisma.organization.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.activity.count({
      where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.userInvite.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
  ]);

  const data = {
    ceo: {
      totalAgencies,
      activeAgencies,
      activeSubscriptions,
      pastDueSubscriptions,
      totalSeats: totalSeats._sum.seats ?? 0,
      recentSignups,
    },
    coo: {
      totalClientOrgs,
      totalAgencyUsers,
      totalClientUsers,
      activeJobs,
      totalCandidates,
      placementsThisMonth,
      silentAgencies,
    },
    tech: {
      activitiesLast24h,
      pendingInvites,
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">🎯 Operations Center</h1>
        <p className="text-gray-500">
          Executive panel · founders only · live data.
        </p>
      </div>
      <OperationsTabs data={data} userEmail={email || ""} />
    </div>
  );
}
