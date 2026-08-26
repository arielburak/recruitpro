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

// Modal popup que se muestra al loguearse si el workspace está en
// trial. Estilo overlay para que sea bien prominente — el admin lo
// ve apenas entra.
//
// Decisión 2026-06-24 con Nicolás (refinamiento): aparece UNA VEZ por
// login session — no en cada refresh ni navegación. Usamos
// sessionStorage para marcar "ya mostrado en esta pestaña". El flag
// se borra al cerrar la tab o hacer logout, así el próximo login lo
// vuelve a disparar. Modo refresh F5 lo respeta (el user ya lo vio
// y no quiere ver el mismo popup cada vez que recarga).
//
// Excepción: NO mostrar durante el PRIMER DÍA después del signup. El
// user recién armó su workspace, el popup interrumpe el onboarding
// y le mete urgencia donde todavía no la hay. A partir del segundo
// login después del signup, aparece normal.
//
// Visual escalado por urgencia:
//   · 7d+ → indigo (gentle reminder, dismissible esta carga)
//   · 3-6d → amber (heads up, dismissible esta carga)
//   · 0-2d → red (urgent, SIN X, solo el CTA. La X confunde porque
//     no cierra — la sacamos directo del DialogContent)
//
// Si el trial YA expiró: early return. El SubscriptionGate del layout
// muestra overlay full-screen bloqueante y este popup no aporta nada
// arriba de eso.

type Subscription = {
  status: string;
  trialEndsAt: string | null;
  isComp: boolean;
  stripeSubscriptionId: string | null;
  // userCreatedAt viene del endpoint /api/admin/subscription. Si el
  // user se acaba de crear (<5min), skipeamos el popup para no
  // interrumpir el primer momento del onboarding. Logins posteriores
  // y refreshes durante una sesión activa SÍ disparan el popup.
  userCreatedAt: string | null;
};

// Ventana en minutos desde el signup donde NO se muestra el popup.
// 1 día completo cubre la primera sesión + cualquier login del mismo
// día. El user recién armó su workspace, no le metemos urgencia hasta
// que pase 24h. A partir del 2do día sí: ya tuvo tiempo de explorar
// y cualquier nuevo login dispara el popup (una vez por session).
const SIGNUP_GRACE_MINUTES = 24 * 60;

// sessionStorage key. La presencia indica "ya mostré el popup en
// esta pestaña" — se borra solo al cerrar la tab / logout, así el
// próximo login lo vuelve a disparar.
const SESSION_FLAG_KEY = "trial_countdown_shown";

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
    // Ya subscribió: trial sigue corriendo (Stripe trial_end) pero no
    // tiene sentido empujarlo a "Subscribe now" — ya lo hizo. Feedback
    // Nicolás 2026-06-23.
    if (subscription.stripeSubscriptionId) return;

    // Si el trial ya expiró, el SubscriptionGate maneja el bloqueo
    // — no abrir el popup chico por arriba.
    const trialEndMs = new Date(subscription.trialEndsAt).getTime();
    if (trialEndMs <= Date.now()) return;

    // Skipear durante la ventana de gracia post-signup (24h).
    if (subscription.userCreatedAt) {
      const minutesSinceSignup =
        (Date.now() - new Date(subscription.userCreatedAt).getTime()) /
        1000 /
        60;
      if (minutesSinceSignup < SIGNUP_GRACE_MINUTES) return;
    }

    // One-per-session: si ya lo mostramos en esta pestaña, skip.
    // sessionStorage persiste durante refresh pero se borra al
    // cerrar tab o hacer logout — exactamente lo que queremos.
    if (typeof window !== "undefined") {
      try {
        if (window.sessionStorage.getItem(SESSION_FLAG_KEY) === "1") {
          return;
        }
        window.sessionStorage.setItem(SESSION_FLAG_KEY, "1");
      } catch {
        // sessionStorage puede fallar (private mode, etc.) — fallback
        // al comportamiento viejo (mostrar igual).
      }
    }

    setOpen(true);
  }, [loaded, subscription]);

  if (!loaded || !subscription) return null;
  if (subscription.status !== "TRIALING") return null;
  if (subscription.isComp) return null;
  if (!subscription.trialEndsAt) return null;
  // Ya subscribió: el popup empuja "Subscribe now" que ya esta hecho.
  if (subscription.stripeSubscriptionId) return null;

  const trialEnd = new Date(subscription.trialEndsAt).getTime();
  const now = Date.now();
  const msLeft = trialEnd - now;

  // Si el trial YA expiró, el SubscriptionGate del layout se hace
  // cargo con un overlay full-screen bloqueante. Este popup chico
  // no aporta nada arriba de eso — solo confunde.
  if (msLeft <= 0) return null;

  // Skipear durante el primer día post-signup (SIGNUP_GRACE_MINUTES).
  // Evita meter urgencia mientras el user todavía está explorando el
  // workspace recién creado. A partir del segundo login después de
  // pasar la ventana, el popup aparece una vez por session.
  if (subscription.userCreatedAt) {
    const minutesSinceSignup =
      (now - new Date(subscription.userCreatedAt).getTime()) / 1000 / 60;
    if (minutesSinceSignup < SIGNUP_GRACE_MINUTES) return null;
  }

  // Math.floor en lugar de Math.ceil: "X days left" se lee como "X dias
  // completos despues de hoy". Math.ceil contaba cualquier fraccion como
  // un dia mas — fresh signup mostraba 7 cuando intuitivamente faltan 6
  // (el dia de hoy ya se esta usando). Feedback Nicolas 2026-06-23.
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));

  const isUrgent = daysLeft <= 2;
  const isHeadsUp = daysLeft >= 3 && daysLeft <= 6;

  // Color + iconografía según urgencia.
  // Copy consistente con /settings/billing: "$XX/seat per month. Cancel anytime."
  // Sin em-dashes ni "$XX/seat/month" (esos quebraban feo en el wrap del modal).
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
        subtitle: `Subscribe now to keep your team working. $${pricePerSeatDollars}/seat per month. Cancel anytime.`,
      }
    : {
        accent: "text-indigo-700",
        button: "bg-indigo-600 hover:bg-indigo-700 text-white",
        icon: Sparkles,
        title: `${daysLeft} days left in your free trial`,
        subtitle: `Enjoying the ATS? Subscribe any time. $${pricePerSeatDollars}/seat per month. Cancel anytime.`,
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
      <DialogContent showCloseButton={!isUrgent}>
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
            You'll lose access to the ATS when the trial ends. Subscribe now to keep working.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
