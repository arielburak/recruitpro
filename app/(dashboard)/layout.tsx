import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { EmailVerificationBanner } from "@/components/auth/email-verification-banner";
import { SessionGate } from "@/components/auth/session-gate";
import { InactivityLogout } from "@/components/auth/inactivity-logout";
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
            <SubscriptionGate status={subStatus} isAdmin={isAdmin}>
              {children}
            </SubscriptionGate>
          </div>
        </main>
      </div>
      {/* Polling client gate: detecta deactivation mid-session y
          muestra overlay bloqueante full-screen. Z-index > Subscription
          Gate (60 vs 50) para asegurar que tape todo si los 2 se
          dispararan simultáneo. */}
      <SessionGate />
      {/* Inactivity logout: 30 min sin actividad → signOut + redirect
          al login con reason=inactivity. Igual que cualquier plataforma
          seria (banking, healthcare). Decisión 2026-06-24 con Nicolás. */}
      <InactivityLogout redirectTo="/login" />
    </div>
  );
}
