import { getServerSession } from "next-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { EmailVerificationBanner } from "@/components/auth/email-verification-banner";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // One-shot read of the signed-in recruiter's verification state.
  // Cheap (single-row select on the indexed id) and runs once per
  // dashboard render. Banner only mounts when the user is signed in
  // and hasn't verified yet, so OAuth users (pre-verified at signup)
  // and verified email/password users see nothing.
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  let unverifiedEmail: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user && !user.emailVerifiedAt) {
      unverifiedEmail = user.email;
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
