"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, FolderOpen, LogOut, List, User, Users, Users2, Building2, Home } from "lucide-react";
import { NotificationBell } from "@/components/client-portal/notification-bell";
import { SessionGate } from "@/components/auth/session-gate";
import { InactivityLogout } from "@/components/auth/inactivity-logout";

const PUBLIC_PATHS = ["/client-portal/login", "/client-portal/set-password", "/client-portal/reset-password", "/client-portal/complete-profile"];

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || /^\/client-portal\/(?!dashboard|jobs|settings|candidates|engagements|my-team|complete-profile)[a-z0-9]+$/.test(pathname);
  const showNav = !isPublicPage;

  // OAuth-only welcome step: when the signed-in user is missing
  // name/title, push them to /client-portal/complete-profile before
  // anything else loads. Manual signup + invite-accept fill these
  // in-flow so this only fires for Google sign-ups (or anyone whose
  // row got cleared). Not a hard block — they just land here first,
  // submit once, normal access from then on.
  useEffect(() => {
    if (!session?.user) return;
    const needs = (session.user as any).needsProfileCompletion;
    if (!needs) return;
    if (pathname === "/client-portal/complete-profile") return;
    if (pathname === "/client-portal/login") return;
    router.replace("/client-portal/complete-profile");
  }, [session, pathname, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-600" />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/client-portal/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-emerald.svg?v=2" alt="Recruiting ATS" width={36} height={36} className="h-9 w-9 rounded-lg shrink-0" />
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">
                  Client Portal
                </h1>
                {(session?.user as any)?.clientName ? (
                  <p className="text-[11px] text-gray-400 leading-tight">
                    {(session?.user as any)?.clientName}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 leading-tight">
                    Manage your hiring pipeline
                  </p>
                )}
              </div>
            </Link>

            {/* The workspace name used to live both in the brand
                subtitle ("Newells Old Boys" under "Client Portal")
                AND in a separate badge to the right. Duplicate
                signal + truncated awkwardly at lg-xl widths. Brand
                subtitle wins — it's always visible and never
                clipped. Logo support comes back as a dedicated
                surface later if needed. */}

            {showNav && (
              <nav className="hidden sm:flex items-center gap-0.5 min-w-0">
                <NavLink href="/client-portal/dashboard" current={pathname === "/client-portal/dashboard"} label="Dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                </NavLink>
                <NavLink href="/client-portal/jobs" current={pathname === "/client-portal/jobs" && !pathname.includes("/new")} label="Jobs">
                  <List className="h-4 w-4" />
                </NavLink>
                <NavLink
                  href="/client-portal/candidates"
                  current={pathname.startsWith("/client-portal/candidates")}
                  label="Candidates"
                >
                  <Users className="h-4 w-4" />
                </NavLink>
                <NavLink
                  href="/client-portal/my-team"
                  current={pathname.startsWith("/client-portal/my-team")}
                  label="My Team"
                >
                  <Users2 className="h-4 w-4" />
                </NavLink>
                <NavLink
                  href="/client-portal/engagements"
                  current={pathname.startsWith("/client-portal/engagements")}
                  label="Recruiting Firms"
                >
                  <Building2 className="h-4 w-4" />
                </NavLink>
                <NavLink href="/client-portal/jobs/new" current={pathname === "/client-portal/jobs/new"} label="Post a Job">
                  <FolderOpen className="h-4 w-4" />
                </NavLink>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {showNav ? (
              <>
                <NotificationBell />
                <Link
                  href="/client-portal/settings"
                  className={`flex items-center gap-1.5 text-sm transition-colors px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                    pathname === "/client-portal/settings"
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                  title="Profile & Settings"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden xl:inline">{session?.user?.name?.split(" ")[0] || "Profile"}</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/client-portal/login" })}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100 whitespace-nowrap"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden xl:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-400 hidden sm:block">
                Powered by <span className="font-semibold text-gray-500">Recruiting ATS</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Idle auto-logout (30min) + session-revoked detection. Solo
          montamos cuando hay sesión — los public paths no necesitan
          el tracker y montarlo ahí dispararía polls innecesarios. */}
      {showNav && session?.user && (
        <>
          <SessionGate />
          <InactivityLogout redirectTo="/client-portal/login" />
        </>
      )}

      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Powered by{" "}
            <span className="font-semibold text-emerald-600">Recruiting ATS</span>
          </p>
          {showNav && (
            <Link
              href="/client-portal/dashboard"
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
            >
              <Home className="h-3 w-3" />
              Back to Home
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  current,
  children,
  label,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      // Responsive nav item: icon-only until lg, icon + label from lg+.
      // The previous layout always rendered the label which busted out
      // around 1280px (six items + brand + user menu + sign out). The
      // workspace badge moved up to xl; this drops textual nav to
      // icons in the same middle zone so 1024-1279px viewports stay
      // clean. whitespace-nowrap keeps multi-word labels ("My Team")
      // on one line when they DO show.
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
        current
          ? "bg-emerald-50 text-emerald-700"
          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {children}
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}
