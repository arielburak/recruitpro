"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, FolderOpen, LogOut, List, User, Users, Users2, Home } from "lucide-react";
import { NotificationBell } from "@/components/client-portal/notification-bell";
import { useLogoUrl } from "@/components/logo-uploader";

const PUBLIC_PATHS = ["/client-portal/login", "/client-portal/set-password", "/client-portal/reset-password"];

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || /^\/client-portal\/(?!dashboard|jobs|settings|candidates)[a-z0-9]+$/.test(pathname);
  const showNav = !isPublicPage;
  // Only fetch the logo when the user is authenticated as a client user (avoids 401 on public pages)
  const clientLogo = useLogoUrl(showNav ? "/api/client-portal/logo" : "");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-600" />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/client-portal/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
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

            {/* Company workspace badge.
                One email → one Client (DB-enforced), so this is just an
                identity badge — logo if uploaded, company name otherwise.
                No dropdown, no switcher; the portal user only ever has
                a single workspace. */}
            {showNav && (session?.user as any)?.clientName && (
              <div
                className="hidden lg:flex items-center gap-2.5 pl-4 border-l border-gray-200"
                title={(session?.user as any)?.clientName || ""}
              >
                {clientLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={clientLogo}
                    alt={(session?.user as any)?.clientName || ""}
                    className="h-16 w-auto max-w-[180px] object-contain"
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-900 truncate max-w-[220px]">
                    {(session?.user as any)?.clientName}
                  </span>
                )}
              </div>
            )}

            {showNav && (
              <nav className="hidden sm:flex items-center gap-1 ml-4">
                <NavLink href="/client-portal/dashboard" current={pathname === "/client-portal/dashboard"}>
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </NavLink>
                <NavLink href="/client-portal/jobs" current={pathname === "/client-portal/jobs" && !pathname.includes("/new")}>
                  <List className="h-4 w-4" />
                  Jobs
                </NavLink>
                <NavLink
                  href="/client-portal/candidates"
                  current={pathname.startsWith("/client-portal/candidates")}
                >
                  <Users className="h-4 w-4" />
                  Candidates
                </NavLink>
                <NavLink
                  href="/client-portal/my-team"
                  current={pathname.startsWith("/client-portal/my-team")}
                >
                  <Users2 className="h-4 w-4" />
                  My Team
                </NavLink>
                <NavLink href="/client-portal/jobs/new" current={pathname === "/client-portal/jobs/new"}>
                  <FolderOpen className="h-4 w-4" />
                  Post a Job
                </NavLink>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showNav ? (
              <>
                <NotificationBell />
                <Link
                  href="/client-portal/settings"
                  className={`flex items-center gap-1.5 text-sm transition-colors px-3 py-1.5 rounded-lg ${
                    pathname === "/client-portal/settings"
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                  title="Profile & Settings"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{session?.user?.name?.split(" ")[0] || "Profile"}</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/client-portal/login" })}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
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
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        current
          ? "bg-emerald-50 text-emerald-700"
          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  );
}
