"use client";

// Gate hard-lock: cuando la sub no está activa (trial vencido,
// canceled, past_due, etc.) bloquea TODO el dashboard con un
// overlay full-screen. Única excepción: rutas bajo /settings/billing
// donde el ADMIN puede subscribirse / pagar.
//
// Decisión 2026-06-19 con Nicolás: el trial expirado no permite usar
// el ATS ni siquiera para ver data — para seguir usándolo hay que
// pagar. Diseño A/B-safe: si por alguna razón el client-side falla,
// el backend guard (require-active-sub) sigue tirando 402 en los
// endpoints de mutation.

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  Lock,
  ArrowRight,
  LogOut,
  Mail,
} from "lucide-react";
import type { SubscriptionStatusResult } from "@/lib/subscription-guard";

type Reason = Extract<SubscriptionStatusResult, { ok: false }>["reason"];

const copyByReason: Record<
  Reason,
  { title: string; subtitle: string }
> = {
  trial_expired: {
    title: "Your free trial has ended",
    subtitle:
      "Subscribe to keep your team working. Your candidates, jobs and pipeline are safe — pick up exactly where you left off.",
  },
  no_sub: {
    title: "Subscription required",
    subtitle: "Subscribe to start using Recruiting ATS.",
  },
  canceled: {
    title: "Your subscription has ended",
    subtitle:
      "Subscribe again to regain access. Your candidates, jobs and pipeline come back instantly.",
  },
  past_due: {
    title: "Payment past due",
    subtitle:
      "We couldn't process your last payment. Update your billing details to restore access.",
  },
  unpaid: {
    title: "Subscription unpaid",
    subtitle:
      "Your subscription has unpaid invoices. Settle them to keep using Recruiting ATS.",
  },
  inactive: {
    title: "Subscription inactive",
    subtitle: "Subscribe to keep using Recruiting ATS.",
  },
};

export function SubscriptionGate({
  status,
  isAdmin,
  adminEmail,
  children,
}: {
  status: SubscriptionStatusResult;
  isAdmin: boolean;
  adminEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Sub OK → render normal sin overlay
  if (status.ok) return <>{children}</>;

  // Si está en /settings/billing dejamos pasar — es la única salida.
  // (También las sub-rutas /settings/billing/* por si agregamos en el
  // futuro un flow tipo /settings/billing/checkout.)
  const isOnBillingPage = pathname?.startsWith("/settings/billing") ?? false;
  if (isOnBillingPage) return <>{children}</>;

  const copy = copyByReason[status.reason];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-red-50 to-amber-50 p-6 border-b border-red-100">
          <div className="flex items-start gap-4">
            <div className="shrink-0 p-3 rounded-xl bg-red-100">
              {status.reason === "trial_expired" ? (
                <AlertTriangle className="h-6 w-6 text-red-600" />
              ) : (
                <Lock className="h-6 w-6 text-red-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{copy.title}</h2>
              <p className="mt-1 text-sm text-gray-700">{copy.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Body — CTA según role */}
        <div className="p-6 space-y-4">
          {isAdmin ? (
            <>
              <Link
                href="/settings/billing"
                className="flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors text-base"
              >
                Subscribe now
                <ArrowRight className="h-5 w-5" />
              </Link>
              <p className="text-xs text-center text-gray-500">
                $20/seat per month · Cancel anytime
              </p>
            </>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-sm text-gray-700">
                  Only your workspace admin can subscribe. Reach out to them to
                  restore access.
                </p>
                {adminEmail && (
                  <a
                    href={`mailto:${adminEmail}?subject=Recruiting%20ATS%20%E2%80%94%20subscription%20needed`}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    <Mail className="h-4 w-4" />
                    Email {adminEmail}
                  </a>
                )}
              </div>
            </>
          )}

          {/* Logout secondary */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
