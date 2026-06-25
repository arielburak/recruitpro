"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, AlertTriangle, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  monthlyTotalCents,
  SOLO_PRICE_PER_SEAT_CENTS,
} from "@/lib/constants";

type SavedCard = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

// Dialog para subscribirse desde trial.
//
// Pivote 2026-06-23 (feedback Nicolás): "el free trial es free siempre,
// el periodo de facturacion comienza despues — como cualquier otra
// plataforma". Antes había 2 opciones: Pay now (cobra inmediato) Y
// Save card for later (trial end nativo Stripe). El usuario sentia
// que pedir tarjeta con doble-opcion durante trial era agresivo.
//
// Ahora: una sola opcion. Si está en TRIAL la card se guarda pero NO
// se cobra hasta que termine el trial (Stripe trial_end nativo). La
// opcion "Pay now and activate" se retiró — quien quiera activar
// antes que el trial termine, espera al cambio de estado en lugar de
// forzar cobro temprano.
//
// El backend (/api/admin/billing/checkout) ya soporta payNow=false
// como el flujo principal — solo dejamos de exponer el toggle.

const PRICE_PER_SEAT = SOLO_PRICE_PER_SEAT_CENTS / 100;
const SEAT_HARD_CAP = 100;

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

type Teammate = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Active users actuales (incluye al admin). Excluir el admin del
  // checklist — su seat es obligatorio.
  activeUsers: Teammate[];
  // userId del admin actual (no se puede deactivar a sí mismo).
  currentUserId: string;
  trialDaysLeft: number;
  trialEndsAt: Date | null;
};

export function SubscribeOptionsDialog({
  open,
  onOpenChange,
  activeUsers,
  currentUserId,
  trialDaysLeft,
  trialEndsAt,
}: Props) {
  const activeCount = activeUsers.length;
  const teammates = useMemo(
    () => activeUsers.filter((u) => u.id !== currentUserId),
    [activeUsers, currentUserId],
  );

  const [seats, setSeats] = useState(Math.max(1, activeCount));
  // userIds de teammates que el admin marcó para mantener acceso.
  // El admin actual está implícito (siempre keeps).
  const [keepIds, setKeepIds] = useState<Set<string>>(
    () => new Set(teammates.map((t) => t.id)),
  );
  const [loading, setLoading] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  // Card guardada en Stripe customer (si la hay). Linkedin-style review:
  // el admin la ve EXPLICITA en el dialog antes de confirmar — sin esto
  // se sentia que "el sistema asumió" qué tarjeta usar. Memory
  // "Billing transparency obligatoria" 2026-06-22.
  //   undefined → todavia no fetcheado (mostramos placeholder)
  //   null      → fetcheado, no hay card on file
  //   SavedCard → fetcheado, mostramos brand + last4
  const [savedCard, setSavedCard] = useState<SavedCard | null | undefined>(
    undefined,
  );

  // Reset state cada vez que se abre — sino el estado anterior persiste.
  useEffect(() => {
    if (open) {
      setSeats(Math.max(1, activeCount));
      setKeepIds(new Set(teammates.map((t) => t.id)));
      setLoading(false);
      setSavedCard(undefined);
    }
  }, [open, activeCount, teammates]);

  // Fetch card guardada cada vez que se abre el dialog. Aborta si el
  // dialog se cierra antes de la respuesta — sino seteamos state sobre
  // un componente unmounted (warning React).
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    fetch("/api/admin/billing/payment-method", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { card: null }))
      .then((data) => {
        setSavedCard(data?.card ?? null);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        // Fail-soft: si el endpoint falla, mostramos "no card on file"
        // (que es el estado más conservador — Stripe Checkout va a
        // pedir card como siempre).
        setSavedCard(null);
      });
    return () => ctrl.abort();
  }, [open]);

  const monthly = monthlyTotalCents(seats);
  const trialEndStr = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "trial end";

  // Billing schedule derivado de trialEndsAt. Linkedin/Stripe Atlas
  // pattern: el admin tiene que ver EXPLICITO cuando cobra la primera
  // factura, cuándo recurre, y por qué monto.
  //   firstChargeLabel — fecha humana de la primera factura.
  //   monthlyAnchorLabel — "monthly on the Nth" derivado del día de
  //     trialEndsAt (o del día actual si trial termina hoy).
  const firstChargeIsToday = trialDaysLeft <= 0;
  const firstChargeLabel = firstChargeIsToday ? "today" : trialEndStr;
  const anchorDate = trialEndsAt ? new Date(trialEndsAt) : new Date();
  const anchorDay = anchorDate.getDate();
  function ordinal(n: number) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  const monthlyAnchorLabel = `the ${ordinal(anchorDay)}`;

  // Card preview helpers.
  const brandLabel = (brand: string) =>
    brand.charAt(0).toUpperCase() + brand.slice(1);
  const expLabel = (m: number, y: number) =>
    `${String(m).padStart(2, "0")}/${String(y).slice(-2)}`;

  // Modelo LinkedIn explícito (2026-06-25): el admin SIEMPRE elige
  // quién mantiene seat — incluso si compra MÁS seats que active users
  // (puede querer dejar 2 Available en pool para invitar después).
  //
  //   teammateSlotsAvailable = cuántos teammates PUEDE marcar (admin slot
  //     no cuenta — el admin actual siempre keep).
  //   teammatesKept = cuántos marcó.
  //   pickerVisible = mostrar la sección. Cuando hay teammates, sí.
  //   selectionIsValid = nunca puede marcar MÁS que slots disponibles.
  //     Marcar menos es válido (los seats sobrantes quedan Available).
  const teammateSlotsAvailable = Math.max(0, seats - 1);
  const teammatesKept = keepIds.size;
  const pickerVisible = teammates.length > 0;
  const selectionIsValid = teammatesKept <= teammateSlotsAvailable;

  // Quiénes pierden acceso al subscribir: teammates NO marcados.
  const willDeactivate = teammates.length - teammatesKept;
  // Seats sobrantes (Available) post-subscribe.
  const availableAfter = teammateSlotsAvailable - teammatesKept;

  function toggleKeep(id: string) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Cap dur: nunca permitir marcar MÁS que slots disponibles.
        // Aplica siempre, no solo cuando seats < activeUsers.
        if (next.size >= teammateSlotsAvailable) {
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  // Si bajan seats y queda con más keepIds que slots, recortar al límite.
  useEffect(() => {
    if (teammatesKept > teammateSlotsAvailable) {
      setKeepIds((prev) => {
        const arr = Array.from(prev);
        return new Set(arr.slice(0, teammateSlotsAvailable));
      });
    }
  }, [seats, teammateSlotsAvailable, teammatesKept]);

  const inputInvalid =
    !Number.isFinite(seats) || seats < 1 || seats > SEAT_HARD_CAP;
  // savedCard=undefined → todavía cargando la card. Bloqueamos el CTA
  // para no mostrar "Continue to add card" cuando realmente sí hay una.
  const cardKnown = savedCard !== undefined;
  const canConfirm =
    !inputInvalid && selectionIsValid && !loading && cardKnown;

  async function handleSubscribe() {
    if (!canConfirm) return;
    setLoading(true);
    // Decide flow basado en card on file (Linkedin-style 2026-06-25):
    //   · Hay card → pedimos inline=true. Backend crea sub directo
    //     via stripe.subscriptions.create. Sin redirect — el dialog
    //     queda como confirm final. La sub vive en Stripe igual.
    //   · No hay card → inline=false. Backend devuelve URL de Stripe
    //     Checkout (path original) para que el admin agregue card.
    const inline = !!savedCard;
    try {
      const res = await fetch("/api/admin/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payNow: false,
          inline,
          seats,
          keepUserIds: Array.from(keepIds),
        }),
      });
      const data = await res.json();

      // Backend creó la sub directo. Redirigimos al billing page con
      // ?success=true para que renderee el banner de éxito (mismo path
      // que usaba el flow de Stripe Checkout post-redirect).
      if (data.ok && data.inline) {
        window.location.href = "/settings/billing?success=true";
        return;
      }

      // Backend nos pidió fallback a Checkout (no había PM). Volvemos
      // a llamar al endpoint sin inline para conseguir la URL.
      if (data?.needsCheckout) {
        const res2 = await fetch("/api/admin/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payNow: false,
            inline: false,
            seats,
            keepUserIds: Array.from(keepIds),
          }),
        });
        const data2 = await res2.json();
        if (data2.url) {
          window.location.href = data2.url;
          return;
        }
        alert(data2?.error || "Couldn't start checkout. Please try again.");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      alert(data?.error || "Couldn't complete subscription. Please try again.");
      setLoading(false);
    } catch (e: any) {
      alert(e?.message || "Couldn't complete subscription.");
      setLoading(false);
    }
  }

  // "Change payment method" → abre Stripe Billing Portal en una tab
  // nueva. No usamos redirect en la misma ventana porque perderiamos
  // la selección de seats/teammates del dialog. Cuando vuelvan a esta
  // tab el useEffect [open] no se re-dispara (sigue open) pero a mano
  // refrescamos el state de card.
  async function handleChangeCard() {
    if (changingCard) return;
    setChangingCard(true);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        // Cuando el user vuelve a la tab del ATS, refresca la card.
        // No es 100% confiable (depende de focus event) pero es mejor
        // que dejar la card vieja indefinidamente.
        const onFocus = () => {
          fetch("/api/admin/billing/payment-method")
            .then((r) => (r.ok ? r.json() : { card: null }))
            .then((d) => setSavedCard(d?.card ?? null))
            .catch(() => {});
          window.removeEventListener("focus", onFocus);
        };
        window.addEventListener("focus", onFocus);
      } else {
        alert(data?.error || "Couldn't open billing portal.");
      }
    } catch (e: any) {
      alert(e?.message || "Couldn't open billing portal.");
    } finally {
      setChangingCard(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          {activeCount > 1 ? (
            <>
              You have <strong>{activeCount} active teammates</strong> using
              the ATS. Pick how many seats to keep and who they belong to.
            </>
          ) : (
            <>
              Pick how many seats you want. You can add or remove seats any
              time from billing settings.
            </>
          )}
        </p>

        {/* Seat selector */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mt-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              Seats
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSeats((s) => Math.max(1, s - 1))}
                disabled={loading || seats <= 1}
              >
                −
              </Button>
              <Input
                type="number"
                min={1}
                max={SEAT_HARD_CAP}
                value={Number.isFinite(seats) ? seats : ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setSeats(Number.isFinite(v) ? v : NaN);
                }}
                disabled={loading}
                className="w-20 text-center font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSeats((s) => Math.min(SEAT_HARD_CAP, s + 1))
                }
                disabled={loading || seats >= SEAT_HARD_CAP}
              >
                +
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ${fmt(monthly)}/mo · ${PRICE_PER_SEAT}/seat
          </p>
        </div>

        {/* Teammate selector — siempre visible cuando hay teammates.
            Modelo LinkedIn: el admin elige explícitamente. Puede dejar
            seats sin asignar (Available) para invitar después. */}
        {pickerVisible && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Assign seats to teammates
              </p>
              <span
                className={`text-xs font-semibold ${
                  selectionIsValid ? "text-gray-600" : "text-amber-700"
                }`}
              >
                {teammatesKept} / {teammateSlotsAvailable} assigned
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              You take 1 seat as admin (automatic). Pick up to{" "}
              <strong>
                {teammateSlotsAvailable} teammate
                {teammateSlotsAvailable === 1 ? "" : "s"}
              </strong>{" "}
              to assign the remaining seat
              {teammateSlotsAvailable === 1 ? "" : "s"}. Unassigned seats
              stay available — you can give them out anytime from the Team
              page. Teammates without a seat lose access but their data
              stays intact.
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {teammates.map((t) => {
                const isChecked = keepIds.has(t.id);
                const canCheck =
                  isChecked || teammatesKept < teammateSlotsAvailable;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                      isChecked
                        ? "border-indigo-300 bg-indigo-50/40"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    } ${!canCheck ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKeep(t.id)}
                      disabled={!canCheck && !isChecked}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {t.email}
                      </p>
                    </div>
                    {t.role === "ADMIN" && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        ADMIN
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {willDeactivate > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>{`${willDeactivate} teammate${willDeactivate === 1 ? "" : "s"} won't get a seat.`}</strong>{" "}
              They lose access but their data (candidates, jobs, history)
              stays intact. Give them a seat anytime from the Team page.
            </p>
          </div>
        )}

        {availableAfter > 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
            <Users className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>
                {availableAfter} seat{availableAfter === 1 ? "" : "s"} will
                stay available.
              </strong>{" "}
              Reserved for new invites. You can assign them whenever you
              want from the Team page.
            </p>
          </div>
        )}

        {/* Order summary + billing schedule + payment method.
            Linkedin/Stripe Atlas pattern (2026-06-25 con Nicolás):
            antes de redirect a Stripe el admin tiene que ver
            EXPLICITO qué se cobra, cuándo, y con qué tarjeta. Antes
            era un solo párrafo verde + "Continue to checkout" — el
            admin sentía que el sistema "asumía" la tarjeta y la
            fecha. */}

        {/* Order summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 mt-2 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Order summary
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              Recruiting ATS — Per Seat
              <span className="text-gray-400">
                {" · "}
                {seats} seat{seats === 1 ? "" : "s"} × ${PRICE_PER_SEAT}
              </span>
            </span>
            <span className="font-semibold text-gray-900">
              ${fmt(monthly)}/mo
            </span>
          </div>
        </div>

        {/* Billing schedule */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Billing schedule
          </p>
          <div className="space-y-1 text-sm text-gray-700">
            <div className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>
                First charge:{" "}
                <strong className="text-gray-900">
                  ${fmt(monthly)} {firstChargeIsToday ? "" : "on "}
                  {firstChargeLabel}
                </strong>
                {firstChargeIsToday ? (
                  <span className="text-gray-500">
                    {" "}
                    (as soon as your trial ends)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>
                Then{" "}
                <strong className="text-gray-900">${fmt(monthly)}</strong>{" "}
                monthly on {monthlyAnchorLabel}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span className="text-gray-500">
                Cancel anytime from billing settings
              </span>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Payment method
          </p>
          {savedCard === undefined ? (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <CreditCard className="h-4 w-4" />
              Loading saved card…
            </div>
          ) : savedCard ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-12 rounded bg-indigo-100 flex items-center justify-center shrink-0">
                  <CreditCard className="h-4 w-4 text-indigo-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {brandLabel(savedCard.brand)} •••• {savedCard.last4}
                  </p>
                  <p className="text-xs text-gray-500">
                    Expires {expLabel(savedCard.expMonth, savedCard.expYear)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleChangeCard}
                disabled={changingCard}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 whitespace-nowrap"
              >
                {changingCard ? "Opening…" : "Change"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <span>
                No card on file — you&apos;ll add one in the next step.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-1">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubscribe} disabled={!canConfirm}>
            {loading
              ? savedCard
                ? "Subscribing…"
                : "Opening Stripe…"
              : savedCard
                ? `Confirm subscription · $${fmt(monthly)}/mo`
                : `Continue to add card · $${fmt(monthly)}/mo`}
          </Button>
        </div>

        <p className="text-[11px] text-gray-500 text-center leading-relaxed mt-1">
          By subscribing you authorize Recruiting ATS to charge{" "}
          {savedCard
            ? `${brandLabel(savedCard.brand)} •••• ${savedCard.last4}`
            : "your card"}{" "}
          ${fmt(monthly)} monthly until you cancel.
        </p>
      </DialogContent>
    </Dialog>
  );
}
