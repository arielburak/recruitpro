"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Building2,
  Handshake,
  Trophy,
  Settings,
  UserPlus,
  Menu,
  X,
  LogOut,
  Upload,
  Inbox,
  Calendar,
  User,
} from "lucide-react";
import { useState, useEffect } from "react";

const mainNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Candidates", href: "/candidates", icon: Users },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Deals", href: "/deals", icon: Handshake },
  { label: "Placements", href: "/placements", icon: Trophy },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Engagements", href: "/engagements", icon: Inbox },
];

const adminNavItems = [
  { label: "Team", href: "/admin/users", icon: UserPlus },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

const accountNavItems = [
  { label: "Profile", href: "/profile", icon: User },
];

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: { label: string; href: string; icon: React.ElementType };
  pathname: string;
  onClick?: () => void;
}) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-indigo-600/10 text-indigo-400"
          : "text-gray-400 hover:text-white hover:bg-white/5"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-indigo-400" />
      )}
      <item.icon
        size={18}
        className={cn(
          "shrink-0 transition-colors",
          isActive
            ? "text-indigo-400"
            : "text-gray-500 group-hover:text-gray-300"
        )}
      />
      <span>{item.label}</span>
    </Link>
  );
}

function UserInfo({ session }: { session: ReturnType<typeof useSession>["data"] }) {
  const [title, setTitle] = useState<string | null>(null);
  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.title) setTitle(data.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  const role = session?.user?.role;
  const subtitle = title || (role === "ADMIN" ? "Admin" : role === "USER" ? "User" : "Member");

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="flex items-center gap-3 flex-1 min-w-0 rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-white/5 group"
        title="View profile"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/80 text-xs font-bold text-white">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-gray-200 group-hover:text-white">
            {session?.user?.name || "User"}
          </p>
          <p className="truncate text-xs text-gray-500">
            {subtitle}
          </p>
        </div>
      </Link>
      <button
        onClick={() => signOut()}
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300 shrink-0"
        title="Sign out"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = session?.user?.role === "ADMIN";

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5 hover:opacity-90 transition-opacity">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <Briefcase size={16} className="text-white" />
        </div>
        <div>
          <span className="text-lg font-semibold tracking-tight text-white leading-tight block">
            Recruiting ATS
          </span>
          {session?.user?.organizationName && (
            <span className="text-[11px] text-gray-400 leading-tight block">
              {session.user.organizationName}
            </span>
          )}
        </div>
      </Link>

      {/* Separator */}
      <div className="mx-4 border-t border-white/[0.06]" />

      {/* Main nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Main
        </p>
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            onClick={() => setMobileOpen(false)}
          />
        ))}

        {isAdmin && (
          <>
            {/* Separator */}
            <div className="!my-4 mx-0 border-t border-white/[0.06]" />
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Admin
            </p>
            {adminNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </>
        )}

        {/* Account section (for everyone) */}
        <div className="!my-4 mx-0 border-t border-white/[0.06]" />
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
          Account
        </p>
        {accountNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* Separator */}
      <div className="mx-4 border-t border-white/[0.06]" />

      {/* User section */}
      <div className="px-4 py-4">
        <UserInfo session={session} />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
        >
          <Menu size={22} />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <Briefcase size={13} className="text-white" />
          </div>
          <div>
            <span className="text-base font-semibold text-gray-900 leading-tight block">
              Recruiting ATS
            </span>
            {session?.user?.organizationName && (
              <span className="text-[10px] text-gray-400 leading-tight block">
                {session.user.organizationName}
              </span>
            )}
          </div>
        </Link>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gray-900 transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 rounded-md p-1 text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-gray-900">
        {sidebarContent}
      </aside>
    </>
  );
}
