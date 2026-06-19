import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { EmailVerificationBanner } from "@/components/auth/email-verification-banner";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One-shot read of the signed-in recruiter's verification state +
  // profile completeness. Cheap (single-row select on the indexed id)
  // and runs once per dashboard render. Banner only mounts when the
  // user is signed in and hasn't verified yet, so OAuth users
  // (pre-verified at signup) and verified email/password users see
  // nothing.
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  let unverifiedEmail: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, name: true, title: true, isActive: true },
    });
    // Soft-deactivated users: cerrar el agujero UX donde su sesión JWT
    // seguía válida pero todos los endpoints les devolvían 401. El
    // layout antes los dejaba ver la shell del dashboard con data
    // vacía. Ahora directo al login con un mensaje claro. Endpoints
    // ya validan isActive en getOrgContext() — esto es la primera
    // línea para que NO vean nada en lugar de ver UI rota.
    if (user && !user.isActive) {
      redirect("/login?error=deactivated");
    }
    if (user && !user.emailVerifiedAt) {
      unverifiedEmail = user.email;
    }
    // OAuth signup leaves title blank (Google doesn't carry a job
    // title). Park the user on /complete-profile as the welcome step
    // — once they save name + title, normal access resumes.
    if (user && (!user.title?.trim() || !user.name?.trim())) {
      redirect("/complete-profile");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {/* Main content area offset for the fixed desktop sidebar */}
      <div className="lg:pl-64">
        {unverifiedEmail && <EmailVerificationBanner email={unverifiedEmail} />}
        <main className="min-h-screen">
          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
