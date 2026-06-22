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
  const fromPortal = searchParams.get("from") === "portal";
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  // Sync banner: cuando el user vuelve del Customer Portal, hacemos
  // polling porque Stripe puede tardar 1-5s en propagar el cambio a
  // su API. Sin esto el primer fetch traía data vieja y el user veía
  // 'Active' después de cancelar hasta que refrescara manualmente.
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // cache: no-store en cada fetch para garantizar que browser/CDN
    // no sirvan respuestas viejas.
    const fetchSub = () =>
      fetch("/api/admin/subscription", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);

    // Fetch inicial siempre. Después, si venimos del Portal, hacemos
    // 3 fetches adicionales con 1.5s de delay para captar cambios
    // que Stripe puede no haber propagado todavía.
    fetchSub().then((data) => {
      setSubscription(data);
      setLoading(false);

      if (!fromPortal) return;

      setSyncing(true);
      let attempt = 0;
      const maxAttempts = 4;
      const interval = setInterval(async () => {
        attempt++;
        const fresh = await fetchSub();
        if (fresh) setSubscription(fresh);
        if (attempt >= maxAttempts) {
          clearInterval(interval);
          setSyncing(false);
        }
      }, 1500);
    });
  }, [fromPortal]);

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

  // Reactivar una sub marcada para cancelar (cancel_at_period_end).
  // Hits el endpoint /api/admin/billing/reactivate que llama Stripe
  // y actualiza la DB optimisticamente. El webhook updated llega
  // después y refresca todo.
  async function handleReactivate() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/billing/reactivate", {
        method: "POST",
      });
      if (res.ok) {
        // Re-fetch para que el UI refleje el nuevo estado.
        const subRes = await fetch("/api/admin/subscription");
        if (subRes.ok) setSubscription(await subRes.json());
      }
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
  // Stripe flag: cancela al final del periodo actual. Sub sigue
  // ACTIVE hasta ese día pero NO se renueva. UI distinto.
  const scheduledToCancel = !!subscription?.cancelAtPeriodEnd && status === "ACTIVE";
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;

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
  // Trial expirado: status sigue siendo TRIALING en DB hasta que Stripe
  // mande el webhook (que puede no llegar nunca si el user no subscribió
  // y no hay sub en Stripe). El SubscriptionGate del layout ya bloqueó
  // todo lo demás del ATS, pero billing/ es la excepción y necesita
  // mostrar copy rojo prominente "Trial expired".
  const trialExpired =
    !isComp &&
    status === "TRIALING" &&
    trialEnd &&
    trialEnd.getTime() <= now.getTime();

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
    : trialExpired
    ? {
        bg: "bg-red-50",
        accent: "text-red-700",
        accentSoft: "bg-red-100",
        border: "border-red-200",
        label: "Trial expired",
        labelTone:
          "Subscribe now to keep your team working. Your candidates, jobs and pipeline are safe.",
      }
    : status === "ACTIVE" && scheduledToCancel
    ? {
        bg: "bg-amber-50",
        accent: "text-amber-700",
        accentSoft: "bg-amber-100",
        border: "border-amber-200",
        label: "Scheduled to cancel",
        labelTone: periodEnd
          ? `Access until ${dateStr(periodEnd)}. Reactivate any time before then to keep billing as is.`
          : "Your subscription is set to cancel at the end of the current period.",
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
      {/* Sync banner: el user vuelve del Customer Portal y mientras
          completamos los polls para detectar cambios, mostramos que
          estamos sincronizando. Desaparece solo cuando termina. */}
      {syncing && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 p-3 rounded-xl flex items-center gap-3">
          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-indigo-300 border-t-indigo-700 animate-spin" />
          <p className="text-sm font-medium">Syncing latest changes from Stripe…</p>
        </div>
      )}

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
                ) : trialExpired ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
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

          {/* CTA — contextual según estado:
              · Trial / no sub → Subscribe / Add payment method
              · Scheduled to cancel → Reactivate (priority) + Manage
              · Active normal → Manage billing */}
          {!isComp && (
            <div className="shrink-0 flex flex-col gap-2 w-full sm:w-auto">
              {scheduledToCancel && (
                <Button
                  size="lg"
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {actionLoading ? "Reactivating…" : "Reactivate subscription"}
                </Button>
              )}
              {!scheduledToCancel && (!hasStripeSub || status === "TRIALING") && (
                <Button
                  size="lg"
                  onClick={handleCheckout}
                  disabled={actionLoading}
                  className={`w-full sm:w-auto ${trialExpired ? "bg-red-600 hover:bg-red-700" : ""}`}
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {actionLoading
                    ? "Loading…"
                    : trialExpired
                    ? "Subscribe now"
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

        {/* Trial progress bar — solo cuando TRIALING activo (no expirado) */}
        {status === "TRIALING" && trialEnd && !isComp && !trialExpired && (
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
            {status === "TRIALING" || scheduledToCancel ? (
              <Calendar className="h-3.5 w-3.5" />
            ) : (
              <Receipt className="h-3.5 w-3.5" />
            )}
            {status === "TRIALING"
              ? "Trial ends"
              : scheduledToCancel
              ? "Ends on"
              : "Next billing"}
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
