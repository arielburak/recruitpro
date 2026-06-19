import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { EmailVerificationBanner } from "@/components/auth/email-verification-banner";
import { SubscriptionGate } from "@/components/billing/subscription-gate";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getSubscriptionStatus, type SubscriptionStatusResult } from "@/lib/subscription-guard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One-shot read of the signed-in recruiter's verification state +
  // profile completeness. Cheap (single-row select on the indexed id)
  // and runs once per dashboard render.
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  let unverifiedEmail: string | null = null;
  let subStatus: SubscriptionStatusResult = { ok: true, reason: null };
  let isAdmin = false;
  let adminEmailForUser: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        emailVerifiedAt: true,
        name: true,
        title: true,
        isActive: true,
        role: true,
        organizationId: true,
      },
    });
    // Soft-deactivated users: cerrar el agujero UX donde su sesión JWT
    // seguía válida pero todos los endpoints les devolvían 401.
    if (user && !user.isActive) {
      redirect("/login?error=deactivated");
    }
    if (user && !user.emailVerifiedAt) {
      unverifiedEmail = user.email;
    }
    // OAuth signup leaves title blank — park en /complete-profile.
    if (user && (!user.title?.trim() || !user.name?.trim())) {
      redirect("/complete-profile");
    }

    // Subscription gate: detecta sub no activa (trial vencido, canceled,
    // past_due, etc.). El componente client decide si bloquea o deja
    // pasar según el pathname (excepción única: /settings/billing).
    if (user && user.isActive) {
      isAdmin = user.role === "ADMIN";
      subStatus = await getSubscriptionStatus(user.organizationId);

      // Si el user actual NO es admin y la sub está bloqueada, le
      // pasamos el email del admin para que pueda contactarlo desde
      // el overlay. Solo lookup si hace falta.
      if (!subStatus.ok && !isAdmin) {
        const admin = await prisma.user.findFirst({
          where: {
            organizationId: user.organizationId,
            role: "ADMIN",
            isActive: true,
          },
          orderBy: { createdAt: "asc" },
          select: { email: true },
        });
        adminEmailForUser = admin?.email || null;
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {/* Main content area offset for the fixed desktop sidebar */}
      <div className="lg:pl-64">
        {unverifiedEmail && <EmailVerificationBanner email={unverifiedEmail} />}
        <main className="min-h-screen">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <SubscriptionGate
              status={subStatus}
              isAdmin={isAdmin}
              adminEmail={adminEmailForUser}
            >
              {children}
            </SubscriptionGate>
          </div>
        </main>
      </div>
    </div>
  );
}
