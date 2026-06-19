"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  CheckCircle,
  Calendar,
  Sparkles,
  AlertTriangle,
  Users,
  Receipt,
} from "lucide-react";
import {
  monthlyTotalCents,
  perSeatCents,
  SOLO_PRICE_PER_SEAT_CENTS,
} from "@/lib/constants";

// Rediseño Linear/Vercel style: hero card con estado visual claro,
// progress bar del trial cuando aplica, breakdown desglosado del costo,
// próxima factura prominente. Reemplaza el card-cuadrado original que
// listaba campos uno debajo del otro sin jerarquía.

const dollars = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

const dateStr = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function BillingContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/subscription")
      .then((r) => r.json())
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const seats = subscription?.seats || 1;
  const monthlyCost = monthlyTotalCents(seats);
  const status = subscription?.status || "TRIALING";
  const isComp = subscription?.isComp;
  const hasStripeSub = !!subscription?.stripeSubscriptionId;
  const customerIsPending = subscription?.stripeCustomerId?.startsWith("pending_");

  // Trial progress (solo aplica si TRIALING).
  const trialEnd = subscription?.trialEndsAt
    ? new Date(subscription.trialEndsAt)
    : null;
  const now = new Date();
  const trialMsLeft = trialEnd ? trialEnd.getTime() - now.getTime() : 0;
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / (1000 * 60 * 60 * 24)));
  // Calc total trial duration (asumimos 7d desde signup); usado para % progress.
  const TRIAL_TOTAL_DAYS = 7;
  const trialDaysUsed = Math.max(0, TRIAL_TOTAL_DAYS - trialDaysLeft);
  const trialProgress = Math.min(100, (trialDaysUsed / TRIAL_TOTAL_DAYS) * 100);

  // Estado visual del hero card.
  const heroPalette = isComp
    ? {
        bg: "bg-emerald-50",
        accent: "text-emerald-700",
        accentSoft: "bg-emerald-100",
        border: "border-emerald-200",
        label: "Complimentary",
        labelTone: "All features unlocked, no billing required.",
      }
    : status === "ACTIVE"
    ? {
        bg: "bg-emerald-50",
        accent: "text-emerald-700",
        accentSoft: "bg-emerald-100",
        border: "border-emerald-200",
        label: "Active",
        labelTone: "Your subscription is current.",
      }
    : status === "PAST_DUE"
    ? {
        bg: "bg-amber-50",
        accent: "text-amber-700",
        accentSoft: "bg-amber-100",
        border: "border-amber-200",
        label: "Past due",
        labelTone: "Update your payment method to avoid interruption.",
      }
    : status === "CANCELED"
    ? {
        bg: "bg-gray-50",
        accent: "text-gray-700",
        accentSoft: "bg-gray-100",
        border: "border-gray-200",
        label: "Canceled",
        labelTone: "Subscribe again to keep using the ATS.",
      }
    : {
        bg: "bg-indigo-50",
        accent: "text-indigo-700",
        accentSoft: "bg-indigo-100",
        border: "border-indigo-200",
        label: "Free trial",
        labelTone: `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left to try everything.`,
      };

  return (
    <div className="space-y-6">
      {/* Result banners desde el redirect de Stripe */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Subscription activated</p>
            <p className="text-sm">Thanks for choosing Recruiting ATS. Your team is good to go.</p>
          </div>
        </div>
      )}
      {canceled && (
        <div className="bg-gray-50 border border-gray-200 text-gray-800 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-gray-500" />
          <div>
            <p className="font-semibold">Subscription not completed</p>
            <p className="text-sm">No charges were made. You can subscribe any time.</p>
          </div>
        </div>
      )}

      {/* ──────── HERO ──────── */}
      <div
        className={`rounded-2xl border ${heroPalette.border} ${heroPalette.bg} p-6 sm:p-8`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${heroPalette.accentSoft} ${heroPalette.accent}`}
              >
                {status === "ACTIVE" || isComp ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : status === "TRIALING" ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {heroPalette.label}
              </span>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                ${dollars(monthlyCost)}
                <span className="text-base font-normal text-gray-500">/month</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {seats} {seats === 1 ? "seat" : "seats"} × ${dollars(perSeatCents(seats))}/seat
              </p>
            </div>
            <p className="text-sm text-gray-700">{heroPalette.labelTone}</p>
          </div>

          {/* CTA — solo si la sub está en estado actionable */}
          {!isComp && (
            <div className="shrink-0 flex flex-col gap-2 w-full sm:w-auto">
              {(!hasStripeSub || status === "TRIALING") && (
                <Button
                  size="lg"
                  onClick={handleCheckout}
                  disabled={actionLoading}
                  className="w-full sm:w-auto"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {actionLoading
                    ? "Loading…"
                    : status === "TRIALING"
                    ? "Add payment method"
                    : "Subscribe now"}
                </Button>
              )}
              {hasStripeSub && !customerIsPending && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleManageBilling}
                  disabled={actionLoading}
                  className="w-full sm:w-auto"
                >
                  <CreditCard className="h-4 w-4 mr-1.5" />
                  {actionLoading ? "Loading…" : "Manage billing"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Trial progress bar — solo cuando TRIALING */}
        {status === "TRIALING" && trialEnd && !isComp && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Trial progress</span>
              <span className={`font-semibold ${heroPalette.accent}`}>
                {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
              </span>
            </div>
            <div className="h-2 bg-white rounded-full overflow-hidden border border-indigo-100">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${trialProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Trial ends on <strong>{dateStr(trialEnd)}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* ──────── DETAILS ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            <Users className="h-3.5 w-3.5" />
            Team
          </div>
          <p className="text-2xl font-bold text-gray-900">{seats}</p>
          <p className="text-xs text-gray-500 mt-1">
            {seats === 1 ? "Active recruiter" : "Active recruiters"}
          </p>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Add or remove teammates from{" "}
            <a href="/settings/team" className="text-indigo-600 hover:underline">
              the Team page
            </a>
            . Billing updates automatically.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            {status === "TRIALING" ? (
              <Calendar className="h-3.5 w-3.5" />
            ) : (
              <Receipt className="h-3.5 w-3.5" />
            )}
            {status === "TRIALING" ? "Trial ends" : "Next billing"}
          </div>
          {status === "TRIALING" && trialEnd ? (
            <>
              <p className="text-2xl font-bold text-gray-900">{dateStr(trialEnd)}</p>
              <p className="text-xs text-gray-500 mt-1">
                After that, ${dollars(monthlyCost)}/month
              </p>
            </>
          ) : status === "ACTIVE" && subscription?.currentPeriodEnd ? (
            <>
              <p className="text-2xl font-bold text-gray-900">
                {dateStr(subscription.currentPeriodEnd)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Charged: ${dollars(monthlyCost)}
              </p>
            </>
          ) : isComp ? (
            <>
              <p className="text-2xl font-bold text-emerald-700">Free</p>
              <p className="text-xs text-gray-500 mt-1">
                Complimentary plan, no billing
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-1">
                Subscribe to see your next billing date
              </p>
            </>
          )}
        </div>
      </div>

      {/* ──────── PRICING INFO ──────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-white border border-gray-200">
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">How pricing works</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              <strong>${dollars(SOLO_PRICE_PER_SEAT_CENTS)}/seat/month.</strong>{" "}
              7-day free trial — no credit card required. Add or remove seats
              any time and billing adjusts automatically on your next invoice.
              Cancel any time from the billing portal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-44 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}
