"use client";

import { useEffect, useRef, useState, Suspense } from "react";
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
  Settings,
} from "lucide-react";
import {
  monthlyTotalCents,
  perSeatCents,
  SOLO_PRICE_PER_SEAT_CENTS,
} from "@/lib/constants";
import { ManageSeatsDialog } from "@/components/billing/manage-seats-dialog";
import {
  SubscribeOptionsDialog,
  SUBSCRIBE_DIALOG_STORAGE_KEY,
} from "@/components/billing/subscribe-options-dialog";

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
  // ?subscribe=1 → auto-abrir el SubscribeOptionsDialog al cargar.
  // Llega de los overlays "Trial ended" / "Subscription ended" para
  // que el admin no tenga que clickear Subscribe DOS veces (overlay +
  // billing page). Decisión Nicolás 2026-06-25.
  const autoOpenSubscribe = searchParams.get("subscribe") === "1";
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Pool seat dialog: gestionar cuántos seats compra el admin.
  const [seatsDialogOpen, setSeatsDialogOpen] = useState(false);
  // Subscribe options dialog: durante trial, dar al user 2 opciones
  // (pay now y activate / save card y cobro al fin del trial).
  const [subscribeOptionsOpen, setSubscribeOptionsOpen] = useState(false);
  // Error de carga inicial — si /api/admin/subscription falla, mostramos
  // un banner con Retry en lugar de pretender que no hay sub.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Sync banner: cuando el user vuelve del Customer Portal, hacemos
  // polling porque Stripe puede tardar 1-5s en propagar el cambio a
  // su API. Sin esto el primer fetch traía data vieja y el user veía
  // 'Active' después de cancelar hasta que refrescara manualmente.
  const [syncing, setSyncing] = useState(false);
  // Dev widget loading state. DEBE estar acá arriba con el resto de
  // hooks — si lo declaro abajo del primer `if (loading) return`,
  // React tira "Rendered more hooks than during the previous render"
  // y rompe toda la página con el genérico "Oops" del error boundary.
  const [endTrialLoading, setEndTrialLoading] = useState(false);

  async function fetchSubWithErrorState() {
    try {
      const res = await fetch("/api/admin/subscription", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(
          "We couldn't load your billing info. Please try again or contact support.",
        );
        return null;
      }
      const data = await res.json();
      setLoadError(null);
      return data;
    } catch {
      setLoadError(
        "We couldn't reach our servers. Check your connection and try again.",
      );
      return null;
    }
  }

  useEffect(() => {
    // Fetch inicial siempre. Después, si venimos del Portal, hacemos
    // 3 fetches adicionales con 1.5s de delay para captar cambios
    // que Stripe puede no haber propagado todavía.
    fetchSubWithErrorState().then((data) => {
      setSubscription(data);
      setLoading(false);

      if (!fromPortal) return;

      setSyncing(true);
      let attempt = 0;
      const maxAttempts = 4;
      const interval = setInterval(async () => {
        attempt++;
        const fresh = await fetchSubWithErrorState();
        if (fresh) setSubscription(fresh);
        if (attempt >= maxAttempts) {
          clearInterval(interval);
          setSyncing(false);
        }
      }, 1500);
    });
  }, [fromPortal]);

  // Auto-abrir el SubscribeOptionsDialog cuando ?subscribe=1 llega
  // del overlay SubscriptionGate (trial expired / sub canceled). Sin
  // esto el admin clickea "Subscribe now" del overlay y aterriza en
  // /settings/billing teniendo que clickear OTRO botón Subscribe. UX
  // duplicada. Decisión Nicolás 2026-06-25.
  // Esperamos a que termine el load para que el dialog reciba la
  // activeUsersList completa.
  useEffect(() => {
    if (autoOpenSubscribe && !loading && subscription) {
      setSubscribeOptionsOpen(true);
    }
  }, [autoOpenSubscribe, loading, subscription]);

  // Restore-from-redirect: si el admin venía mid-flow de "Change
  // payment method" → Stripe portal → back/Return, el dialog persistió
  // sus seats/keepIds a sessionStorage. Acá re-abrimos el dialog para
  // que el restore-on-open recupere todo y el admin no tenga que volver
  // a elegir seats. Single-shot via ref para no re-disparar después de
  // que el user cierre manualmente.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (loading || !subscription) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(SUBSCRIBE_DIALOG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.open === true) {
        setSubscribeOptionsOpen(true);
      }
    } catch {
      // ignore (private browsing, JSON parse error)
    }
  }, [loading, subscription]);

  async function retryLoad() {
    setLoading(true);
    const data = await fetchSubWithErrorState();
    setSubscription(data);
    setLoading(false);
  }

  async function handleCheckout() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // No URL → Stripe falló o devolvió error. Mostrar al user.
      setActionError(
        data?.error ||
          "Couldn't reach Stripe to start checkout. Please try again in a moment.",
      );
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setActionError(
        data?.error ||
          "Couldn't open the billing portal. Please try again or contact support.",
      );
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  // Reactivar una sub "Scheduled to cancel" lleva al user al Customer
  // Portal de Stripe (mismo flow que Manage billing). Allí Stripe
  // muestra la sub con "Will be canceled on X" y el user clickea
  // "Renew" / "Don't cancel", con la opción de reconfirmar/cambiar
  // tarjeta si quiere. Stripe redirige de vuelta con ?from=portal y
  // el polling capta el cambio automáticamente.
  //
  // Decisión 2026-06-22 con Nicolás: un toggle silencioso en el ATS
  // es amateur. Los SaaS pro siempre llevan al user a Stripe para
  // que reconfirme y mantenga el flow visible end-to-end.
  async function handleReactivate() {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setActionError(
        data?.error ||
          "Couldn't open the billing portal to reactivate. Please try again.",
      );
    } catch {
      setActionError("Network error. Please try again.");
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

  // Error state cuando /api/admin/subscription falla y no tenemos data
  // para renderizar. Distinguir "no data yet" de "fetch failed" como
  // hacen Linear / Vercel.
  if (loadError && !subscription) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-800 p-5 rounded-xl">
          <p className="font-semibold mb-1">Couldn't load your billing info</p>
          <p className="text-sm mb-3">{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="text-sm font-semibold text-red-700 hover:text-red-900 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const seats = subscription?.seats || 1;
  const monthlyCost = monthlyTotalCents(seats);
  const status = subscription?.status || "TRIALING";
  const isComp = subscription?.isComp;
  const hasStripeSub = !!subscription?.stripeSubscriptionId;
  // Pool seat model: activeUsersCount viene del endpoint /api/admin/subscription
  const activeUsers = subscription?.activeUsersCount ?? 0;
  const seatsAvailable = Math.max(0, seats - activeUsers);
  // Durante TRIAL, `subscription.seats` queda stuck en lo último que se
  // sincronizó con Stripe (default 1 al signup) — no refleja invitar
  // teammates en vivo. Para el hero y la proyección post-trial, usamos
  // el active users count real. Post-trial (ACTIVE) sí confiamos en
  // subscription.seats porque ya está autoritativo en Stripe.
  const projectedSeats =
    status === "TRIALING" && !isComp ? Math.max(activeUsers, 1) : seats;
  const projectedMonthlyCost = monthlyTotalCents(projectedSeats);
  const customerIsPending = subscription?.stripeCustomerId?.startsWith("pending_");
  // Stripe flag: cancela al final del periodo actual. Sub sigue
  // ACTIVE (o TRIALING-con-card) hasta ese día pero NO se renueva. UI
  // distinto. Audit 2026-06-24: incluir TRIALING — el user puede
  // suscribir con card durante el trial y después cancelar; en ese
  // caso la sub queda TRIALING+cancelAtPeriodEnd y la UI necesita
  // mostrar "won't renew" + botón Reactivate igual que en ACTIVE.
  const scheduledToCancel =
    !!subscription?.cancelAtPeriodEnd &&
    (status === "ACTIVE" || status === "TRIALING");
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;

  // Trial progress (solo aplica si TRIALING).
  const trialEnd = subscription?.trialEndsAt
    ? new Date(subscription.trialEndsAt)
    : null;
  const trialStart = subscription?.createdAt
    ? new Date(subscription.createdAt)
    : null;
  const now = new Date();
  const trialMsLeft = trialEnd ? trialEnd.getTime() - now.getTime() : 0;
  // Math.floor en lugar de Math.ceil: el usuario lee "X days left" como
  // "X días COMPLETOS después de hoy". Math.ceil cuenta cualquier fracción
  // como un día más — fresh signup mostraba 7 cuando intuitivamente faltan
  // 6 (el día de hoy ya se está usando). Feedback Nicolás 2026-06-23.
  const trialDaysLeft = Math.max(0, Math.floor(trialMsLeft / (1000 * 60 * 60 * 24)));
  // Trial total duration calculado dinámicamente desde createdAt →
  // trialEndsAt en lugar de hardcoded 7d. Antes (hardcoded) si más
  // adelante cambiamos TRIAL_DAYS en constants.ts, el progress bar
  // mostraba info incorrecta. Fallback a 7 si falta data.
  const trialTotalMs =
    trialStart && trialEnd ? trialEnd.getTime() - trialStart.getTime() : 7 * 24 * 60 * 60 * 1000;
  const trialTotalDays = Math.max(1, Math.round(trialTotalMs / (1000 * 60 * 60 * 24)));
  const trialDaysUsed = Math.max(0, trialTotalDays - trialDaysLeft);
  const trialProgress = Math.min(100, (trialDaysUsed / trialTotalDays) * 100);
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
    : status === "TRIALING" && hasStripeSub
    ? {
        // Caso "ya subscribí pero el trial sigue corriendo" — Stripe
        // mantiene status=trialing hasta que el trial_end pase. Antes
        // este estado caía al branch genérico "Free trial · Subscribe
        // now", lo que confundía al usuario (acaba de subscribir y le
        // seguía apareciendo el botón Subscribe). Feedback Nicolás
        // 2026-06-23: "acabo de suscribirme y no cambia nada".
        bg: "bg-emerald-50",
        accent: "text-emerald-700",
        accentSoft: "bg-emerald-100",
        border: "border-emerald-200",
        label: "Subscribed",
        labelTone: trialEnd
          ? `Trial active through ${dateStr(trialEnd)} — billing starts then. Cancel anytime.`
          : "Your subscription is current.",
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

  // Dev-only widget — variables que NO son hooks (el useState ya se
  // declaró arriba junto con los demás hooks, antes de los early returns,
  // para respetar Rules of Hooks).
  const isDevEnv =
    process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" &&
    typeof window !== "undefined";
  async function endTrialNow() {
    if (!confirm("This will backdate your trial end + cancel any active Stripe sub. Continue?")) return;
    setEndTrialLoading(true);
    try {
      const res = await fetch("/api/admin/dev-billing-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "expire" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Failed: " + (data?.error || "unknown"));
        setEndTrialLoading(false);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert("Failed: " + (e?.message || "exception"));
      setEndTrialLoading(false);
    }
  }

  async function endSubscriptionNow() {
    if (
      !confirm(
        "This will cancel your Stripe subscription IMMEDIATELY (skipping the scheduled period end) and mark DB as CANCELED. Continue?",
      )
    )
      return;
    setEndTrialLoading(true);
    try {
      const res = await fetch("/api/admin/dev-billing-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "end-subscription" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Failed: " + (data?.error || "unknown"));
        setEndTrialLoading(false);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert("Failed: " + (e?.message || "exception"));
      setEndTrialLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Dev-only widgets para testing del lifecycle de billing.
          Solo visibles en non-production. */}
      {isDevEnv && !isComp && status === "TRIALING" && (
        <div className="rounded-lg border-2 border-dashed border-orange-300 bg-orange-50 p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-orange-900">
            <strong>DEV:</strong> backdate trial end to test the
            post-trial flow (SubscriptionGate, Subscribe CTA, etc).
          </p>
          <button
            type="button"
            onClick={endTrialNow}
            disabled={endTrialLoading}
            className="text-xs font-semibold bg-orange-600 text-white px-3 py-1.5 rounded-md hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
          >
            {endTrialLoading ? "Ending…" : "End trial now (dev)"}
          </button>
        </div>
      )}
      {isDevEnv && !isComp && status === "ACTIVE" && (
        <div className="rounded-lg border-2 border-dashed border-orange-300 bg-orange-50 p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-orange-900">
            <strong>DEV:</strong> end subscription IMMEDIATELY (skipping
            period end). Cancels Stripe sub + marks DB CANCELED — to
            test the post-cancellation overlay + Resubscribe flow.
          </p>
          <button
            type="button"
            onClick={endSubscriptionNow}
            disabled={endTrialLoading}
            className="text-xs font-semibold bg-orange-600 text-white px-3 py-1.5 rounded-md hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
          >
            {endTrialLoading ? "Ending…" : "End subscription now (dev)"}
          </button>
        </div>
      )}

      {/* Action error banner: cuando handleCheckout / handleManageBilling
          / handleReactivate fallaron al contactar Stripe. Antes el
          botón se quedaba en "Loading..." sin feedback visible.
          Auto-clearable con la X. */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Something went wrong</p>
            <p className="text-sm mt-0.5">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

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
                {status === "ACTIVE" || isComp || (status === "TRIALING" && hasStripeSub) ? (
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
                ${dollars(projectedMonthlyCost)}
                <span className="text-base font-normal text-gray-500">/month</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {projectedSeats} {projectedSeats === 1 ? "seat" : "seats"} × ${dollars(perSeatCents(projectedSeats))}/seat
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
              {!scheduledToCancel && !hasStripeSub && (
                <Button
                  size="lg"
                  onClick={() => {
                    // En trial activo: abrir el dialog con 2 opciones
                    // (pay now / save card). En cualquier otro estado
                    // (trial expirado, canceled, no-sub), checkout
                    // directo con cobro inmediato.
                    if (status === "TRIALING" && !trialExpired) {
                      setSubscribeOptionsOpen(true);
                    } else {
                      handleCheckout();
                    }
                  }}
                  disabled={actionLoading}
                  className={`w-full sm:w-auto ${trialExpired ? "bg-red-600 hover:bg-red-700" : ""}`}
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {actionLoading
                    ? "Loading…"
                    : "Subscribe"}
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

        {/* Trial progress bar — solo cuando TRIALING activo (no expirado)
            Y el user NO se subscribio todavia. Una vez que hay sub en
            Stripe, el countdown urgente sobra: el copy del hero ya dice
            "Trial active through X — billing starts then". Feedback
            Nicolas 2026-06-24. */}
        {status === "TRIALING" && trialEnd && !isComp && !trialExpired && !hasStripeSub && (
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
        {/* Licenses card — patrón LinkedIn/Microsoft 365: tripleta
            de metricas Purchased | Assigned | Available + copy con
            el cap. Reemplaza el card SEATS viejo con su "X of Y"
            que confundia. Durante TRIAL el concepto "Purchased" no
            aplica (no hay sub), asi que mostramos copy distinto. */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <Users className="h-3.5 w-3.5" />
              Your licenses
            </div>
            {/* Manage seats: solo en ACTIVE (no en COMP ni TRIAL).
                Durante trial el pool no aplica — el admin invita a
                teammates subscribiéndose, no comprando pool. */}
            {!isComp && status === "ACTIVE" && (
              <button
                type="button"
                onClick={() => setSeatsDialogOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Settings className="h-3 w-3" />
                Manage seats
              </button>
            )}
          </div>
          {status === "TRIALING" && !isComp ? (
            <>
              {/* TRIAL: no hay "purchased" todavia. Solo Assigned. */}
              <div className="flex items-baseline gap-6 text-sm">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                    Assigned
                  </p>
                </div>
                <div className="text-gray-300 text-xs font-medium uppercase tracking-wide">
                  Unlimited during trial
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                Invite teammates from{" "}
                <a href="/settings/team" className="text-indigo-600 hover:underline">
                  the Team page
                </a>
                {trialEnd ? (
                  <>
                    . Per-seat billing kicks in on{" "}
                    <strong>{dateStr(trialEnd)}</strong>.
                  </>
                ) : (
                  <>. Per-seat billing kicks in after your trial ends.</>
                )}
              </p>
            </>
          ) : (
            <>
              {/* ACTIVE / COMP / CANCELED / PAST_DUE: triplete completo. */}
              <div className="flex items-baseline gap-6 text-sm">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{seats}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                    Purchased
                  </p>
                </div>
                <div className="h-8 w-px bg-gray-200" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                    Assigned
                  </p>
                </div>
                <div className="h-8 w-px bg-gray-200" />
                <div>
                  <p className={`text-2xl font-bold ${seatsAvailable === 0 ? "text-amber-600" : "text-gray-900"}`}>
                    {seatsAvailable}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                    Available
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                {seatsAvailable === 0 ? (
                  <>
                    All licenses are in use. Add more seats from Manage seats
                    above, or deactivate teammates from{" "}
                    <a href="/settings/team" className="text-indigo-600 hover:underline">
                      the Team page
                    </a>
                    .
                  </>
                ) : (
                  <>
                    Assign teammates from{" "}
                    <a href="/settings/team" className="text-indigo-600 hover:underline">
                      the Team page
                    </a>
                    . Deactivated members free their seat to the pool.
                  </>
                )}
              </p>
            </>
          )}
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
                After that, ${dollars(projectedMonthlyCost)}/month
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

      {/* Subscribe options dialog — solo en TRIAL activo. Pay now
          (cobro inmediato, ACTIVE) vs Save card for later (trial_end
          nativo Stripe, cobro automático al fin del trial). */}
      <SubscribeOptionsDialog
        open={subscribeOptionsOpen}
        onOpenChange={setSubscribeOptionsOpen}
        activeUsers={subscription?.activeUsersList || []}
        currentUserId={(session?.user as any)?.id || ""}
        trialDaysLeft={trialDaysLeft}
        trialEndsAt={trialEnd}
      />

      {/* Pool seat model: dialog para comprar/vender seats. Llama
          /api/admin/billing/update-seats que pushea cambio a Stripe
          y actualiza DB. onConfirmed re-fetcha la subscription. */}
      <ManageSeatsDialog
        open={seatsDialogOpen}
        onOpenChange={setSeatsDialogOpen}
        currentSeats={seats}
        activeUsers={activeUsers}
        activeUsersList={subscription?.activeUsersList || []}
        status={status}
        isComp={!!isComp}
        onConfirmed={() => {
          // Trigger re-fetch para que la card refleje el nuevo seats.
          fetch("/api/admin/subscription", { cache: "no-store" })
            .then((r) => r.json())
            .then((data) => setSubscription(data))
            .catch(() => {});
        }}
      />
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
