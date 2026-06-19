"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { User, Users, Building2, Plug, CreditCard } from "lucide-react";

type TabDef = {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
};

const TABS: TabDef[] = [
  { label: "Profile", href: "/settings/profile", icon: User },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "Team", href: "/settings/team", icon: Users },
  { label: "Organization", href: "/settings/organization", icon: Building2, adminOnly: true },
  { label: "Billing", href: "/settings/billing", icon: CreditCard, adminOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your profile, integrations and organization in one place.
        </p>
      </div>

      {/* Tabs bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Settings tabs">
          {visibleTabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "group inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors",
                  active
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>{children}</div>
    </div>
  );
}
