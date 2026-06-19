"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Sparkles, AlertTriangle, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SOLO_PRICE_PER_SEAT_CENTS } from "@/lib/constants";

const pricePerSeatDollars = SOLO_PRICE_PER_SEAT_CENTS / 100;

// Modal popup que se muestra al cargar el dashboard si el workspace
// está en trial. Estilo overlay para que sea bien prominente — el
// admin lo ve apenas entra.
//
// Decisión 2026-06-19 con Nicolás: aparece SIEMPRE cada vez que se
// monta el componente (cada login / refresh). No persiste dismiss en
// storage. El user puede cerrarlo con X / click afuera para usar el
// ATS, pero al refresh / próximo login reaparece. La idea es que sea
// imposible olvidarse del trial.
//
// Visual escalado por urgencia:
//   · 7d+ → indigo (gentle reminder, dismissible esta carga)
//   · 3-6d → amber (heads up, dismissible esta carga)
//   · 0-2d → red (urgent, no dismissible — solo el CTA)

type Subscription = {
  status: string;
  trialEndsAt: string | null;
  isComp: boolean;
  stripeSubscriptionId: string | null;
};

export function TrialCountdown() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [open, setOpen] = useState(false);
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
    if (!loaded || !subscription) return;
    if (subscription.status !== "TRIALING") return;
    if (subscription.isComp) return;
    if (!subscription.trialEndsAt) return;

    // Sin persistencia de dismiss: abre cada vez que el componente
    // se monta (cada login / refresh). User puede cerrar para usar
    // el ATS, pero al recargar reaparece.
    setOpen(true);
  }, [loaded, subscription]);

  if (!loaded || !subscription) return null;
  if (subscription.status !== "TRIALING") return null;
  if (subscription.isComp) return null;
  if (!subscription.trialEndsAt) return null;

  const trialEnd = new Date(subscription.trialEndsAt).getTime();
  const now = Date.now();
  const msLeft = trialEnd - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  const isUrgent = daysLeft <= 2;
  const isHeadsUp = daysLeft >= 3 && daysLeft <= 6;

  // Color + iconografía según urgencia.
  const styles = isUrgent
    ? {
        accent: "text-red-700",
        button: "bg-red-600 hover:bg-red-700 text-white",
        icon: AlertTriangle,
        title:
          daysLeft === 0
            ? "Your trial ends today"
            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial`,
        subtitle:
          "Add a payment method now to keep your team working without interruption.",
      }
    : isHeadsUp
    ? {
        accent: "text-amber-700",
        button: "bg-amber-600 hover:bg-amber-700 text-white",
        icon: AlertTriangle,
        title: `${daysLeft} days left in your trial`,
        subtitle: `Subscribe now to lock in $${pricePerSeatDollars}/seat/month and skip the interruption.`,
      }
    : {
        accent: "text-indigo-700",
        button: "bg-indigo-600 hover:bg-indigo-700 text-white",
        icon: Sparkles,
        title: `${daysLeft} days left in your free trial`,
        subtitle: `Enjoying the ATS? Subscribe any time — $${pricePerSeatDollars}/seat/month, cancel whenever.`,
      };

  const Icon = styles.icon;

  function handleDismiss() {
    if (isUrgent) return; // urgent no se puede dismissar
    // Cierre transitorio solamente — no persistimos nada. Al refresh
    // o próximo login el modal reaparece.
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // El close del overlay (esc / click afuera) cuenta como
        // dismiss salvo en modo urgent.
        if (!o) handleDismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              className={`shrink-0 p-2 rounded-lg ${
                isUrgent
                  ? "bg-red-100"
                  : isHeadsUp
                  ? "bg-amber-100"
                  : "bg-indigo-100"
              } ${styles.accent}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span>{styles.title}</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-700">{styles.subtitle}</p>

        {/* Big CTA */}
        <Link
          href="/settings/billing"
          className={`mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-base font-semibold transition-colors ${styles.button}`}
        >
          <Sparkles className="h-5 w-5" />
          Subscribe now
          <ArrowRight className="h-4 w-4" />
        </Link>

        {isUrgent && (
          <p className="text-xs text-red-600 text-center mt-2">
            We'll keep showing this until you subscribe to avoid losing access.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
