"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Briefcase, LayoutDashboard, FolderOpen, LogOut, Calendar } from "lucide-react";

const PUBLIC_PATHS = ["/client-portal/login", "/client-portal/set-password", "/client-portal/reset-password"];

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || /^\/client-portal\/(?!dashboard|jobs|calendar)[a-z0-9]+$/.test(pathname);
  const showNav = !isPublicPage;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-600" />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/client-portal/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-600 text-white">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">
                  Client Portal
                </h1>
                <p className="text-xs text-gray-500 leading-tight">
                  Manage your hiring pipeline
                </p>
              </div>
            </Link>

            {showNav && (
              <nav className="hidden sm:flex items-center gap-1 ml-4">
                <NavLink href="/client-portal/dashboard" current={pathname === "/client-portal/dashboard"}>
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </NavLink>
                <NavLink href="/client-portal/calendar" current={pathname === "/client-portal/calendar"}>
                  <Calendar className="h-4 w-4" />
                  Calendar
                </NavLink>
                <NavLink href="/client-portal/jobs/new" current={pathname === "/client-portal/jobs/new"}>
                  <FolderOpen className="h-4 w-4" />
                  Post a Job
                </NavLink>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {showNav ? (
              <>
                <span className="text-sm text-gray-500 hidden md:block">
                  {(session?.user as any)?.clientName}
                </span>
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
            <Link href="/client-portal/dashboard" className="text-xs text-gray-400 hover:text-emerald-600 transition-colors">
              Back to Dashboard
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
