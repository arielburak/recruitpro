"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { X, Sparkles, AlertTriangle } from "lucide-react";

// Popup que aparece al cargar el dashboard si el workspace está en
// trial. Muestra cuántos días quedan + un CTA grande para suscribirse.
// Dismisible — al cerrarlo se guarda en localStorage un timestamp y
// no vuelve a aparecer por 24h. Si el trial está por vencer (<= 2
// días), se ignora el dismiss y siempre aparece.
//
// Visual escalado por urgencia:
//   · 7 días+ → indigo (gentle reminder)
//   · 3-6 días → amber (heads up)
//   · 0-2 días → red (urgent, no dismissible)

type Subscription = {
  status: string;
  trialEndsAt: string | null;
  isComp: boolean;
  stripeSubscriptionId: string | null;
};

const DISMISS_KEY = "trial-popup-dismissed-at";
const DISMISS_HOURS = 24;

export function TrialCountdown() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/admin/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSubscription(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [session]);

  useEffect(() => {
    if (!loaded) return;
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return;
    const last = parseInt(raw, 10);
    if (Number.isNaN(last)) return;
    const hoursAgo = (Date.now() - last) / (1000 * 60 * 60);
    if (hoursAgo < DISMISS_HOURS) setDismissed(true);
  }, [loaded]);

  if (!loaded || !subscription) return null;
  // Solo mostrar si está en trial — no a comp, ni active, ni canceled.
  if (subscription.status !== "TRIALING") return null;
  if (subscription.isComp) return null;
  if (!subscription.trialEndsAt) return null;

  const trialEnd = new Date(subscription.trialEndsAt).getTime();
  const now = Date.now();
  const msLeft = trialEnd - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  // Escalado de urgencia. 0-2 días → no dismissible.
  const isUrgent = daysLeft <= 2;
  const isHeadsUp = daysLeft >= 3 && daysLeft <= 6;

  if (dismissed && !isUrgent) return null;

  // Color + iconografía según urgencia.
  const styles = isUrgent
    ? {
        bg: "bg-red-50",
        border: "border-red-300",
        accent: "text-red-700",
        button: "bg-red-600 hover:bg-red-700",
        icon: AlertTriangle,
        title: daysLeft === 0 ? "Your trial ends today" : `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        subtitle: "Add a payment method to keep your team working without interruption.",
      }
    : isHeadsUp
    ? {
        bg: "bg-amber-50",
        border: "border-amber-300",
        accent: "text-amber-700",
        button: "bg-amber-600 hover:bg-amber-700",
        icon: AlertTriangle,
        title: `${daysLeft} days left in your trial`,
        subtitle: "Subscribe now to lock in $20/seat/month and skip the interruption.",
      }
    : {
        bg: "bg-indigo-50",
        border: "border-indigo-300",
        accent: "text-indigo-700",
        button: "bg-indigo-600 hover:bg-indigo-700",
        icon: Sparkles,
        title: `${daysLeft} days left in your free trial`,
        subtitle: "Enjoying the ATS? Subscribe any time — $20/seat/month, cancel whenever.",
      };

  const Icon = styles.icon;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-xl p-4 sm:p-5 flex items-start gap-4 relative`}
      role="banner"
    >
      <div className={`shrink-0 p-2 rounded-lg ${styles.bg} ${styles.accent}`}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${styles.accent}`}>{styles.title}</p>
        <p className="text-sm text-gray-700 mt-0.5">{styles.subtitle}</p>

        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href="/settings/billing"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${styles.button}`}
          >
            <Sparkles className="h-4 w-4" />
            Subscribe now
          </Link>
          {!isUrgent && (
            <button
              onClick={handleDismiss}
              type="button"
              className="text-xs text-gray-500 hover:text-gray-900 px-2"
            >
              Remind me later
            </button>
          )}
        </div>
      </div>

      {!isUrgent && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          type="button"
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
