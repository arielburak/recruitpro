"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LayoutDashboard, FolderOpen, LogOut, List, User, Users, Home, ChevronDown, Check, Building2 } from "lucide-react";
import { NotificationBell } from "@/components/client-portal/notification-bell";
import { useLogoUrl } from "@/components/logo-uploader";

type Membership = {
  clientUserId: string;
  clientId: string;
  clientName: string;
  industry: string | null;
  role: "ADMIN" | "USER";
  isCurrent: boolean;
};

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

  // Multi-Client switcher: when the logged-in email has ClientUser rows
  // on more than one Client (e.g. shared by a recruiter to Lion Point
  // AND to Acme), let them flip between contexts without having to log
  // out and back in.
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!showNav) return;
    fetch("/api/client-portal/memberships")
      .then((r) => r.json())
      .then((d) => setMemberships(d?.memberships || []))
      .catch(() => {});
  }, [showNav]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function switchToClient(clientId: string) {
    if (switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/client-portal/switch-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        // Hard reload — every server query (dashboard, jobs, candidates)
        // re-resolves via getClientContext, which now picks the new
        // Client from the cookie we just set.
        window.location.href = "/client-portal/dashboard";
      } else {
        setSwitching(false);
      }
    } catch {
      setSwitching(false);
    }
  }

  const currentMembership = memberships.find((m) => m.isCurrent) || memberships[0] || null;
  const hasMultipleMemberships = memberships.length > 1;

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
                - If the client uploaded a logo → show just the logo (clean).
                - If no logo yet → show the company name as a fallback so
                  the workspace is still identified.
                - When the user has memberships on multiple Clients, the
                  whole badge becomes a switcher dropdown. */}
            {showNav && (session?.user as any)?.clientName && (
              <div
                ref={switcherRef}
                className="hidden lg:flex items-center pl-4 border-l border-gray-200 relative"
                title={(session?.user as any)?.clientName || ""}
              >
                <button
                  type="button"
                  onClick={() => hasMultipleMemberships && setSwitcherOpen((v) => !v)}
                  className={`flex items-center gap-2.5 ${hasMultipleMemberships ? "hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 cursor-pointer" : "cursor-default"}`}
                  disabled={!hasMultipleMemberships}
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
                      {currentMembership?.clientName || (session?.user as any)?.clientName}
                    </span>
                  )}
                  {hasMultipleMemberships && (
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${switcherOpen ? "rotate-180" : ""}`} />
                  )}
                </button>

                {hasMultipleMemberships && switcherOpen && (
                  <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-80 overflow-y-auto">
                    <div className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                      Switch workspace
                    </div>
                    {memberships.map((m) => (
                      <button
                        key={m.clientId}
                        type="button"
                        onClick={() => switchToClient(m.clientId)}
                        disabled={switching || m.isCurrent}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          m.isCurrent
                            ? "bg-emerald-50 text-emerald-700"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <Building2 className={`h-4 w-4 shrink-0 ${m.isCurrent ? "text-emerald-600" : "text-gray-400"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{m.clientName}</p>
                          {m.industry && (
                            <p className="text-[11px] text-gray-400 truncate">{m.industry}</p>
                          )}
                        </div>
                        {m.isCurrent && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
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
