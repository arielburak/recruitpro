"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Shield,
  CreditCard,
  ExternalLink,
} from "lucide-react";
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
  perSeatCents,
  SOLO_PRICE_PER_SEAT_CENTS,
} from "@/lib/constants";

// Pool seat model 2026-06-22: el admin compra explícitamente N seats
// y los asigna invitando members. Este dialog permite ajustar el N.
//
// UX:
//   · Input numérico con +/- buttons. Default = current.
//   · Validación inline: no < active users count, no < 1, no > 100.
//   · Breakdown: "X seats × $20/seat = $X/mo".
//   · Delta visible: "Change: +$40/mo" o "-$20/mo" o "no change".
//   · Notas según contexto:
//     - Aumentar: "Available immediately. New seats can be invited from Team."
//     - Reducir: "Lower charge starts next billing cycle (no proration spam)."
//     - TRIAL: "No charge until your trial ends — at that point you'll pay for X seats."

const PRICE_PER_SEAT_DOLLARS = SOLO_PRICE_PER_SEAT_CENTS / 100;
const SEAT_HARD_CAP = 100;

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

type ActiveUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSeats: number;
  activeUsers: number;
  // Lista completa de active users — necesaria para que el admin
  // elija quién mantiene seat cuando baja seats < active count.
  activeUsersList?: ActiveUser[];
  status: string; // "ACTIVE" | "TRIALING" | etc.
  isComp: boolean;
  onConfirmed?: () => void;
};

export function ManageSeatsDialog({
  open,
  onOpenChange,
  currentSeats,
  activeUsers,
  activeUsersList,
  status,
  isComp,
  onConfirmed,
}: Props) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const [seats, setSeats] = useState(currentSeats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Lista de userIds que el admin elige MANTENER cuando baja seats <
  // activeUsers. El admin actual es slot implícito (no aparece en la
  // lista — siempre keep). Reset cuando cambia el seats target.
  const [keepUserIds, setKeepUserIds] = useState<string[]>([]);

  // Reset state cada vez que abre — sino el N anterior persiste.
  useEffect(() => {
    if (open) {
      setSeats(currentSeats);
      setError("");
      setLoading(false);
      setKeepUserIds([]);
    }
  }, [open, currentSeats]);

  // Si bajaron a un número que YA NO requiere choice (seats >=
  // activeUsers), limpiar la lista de keeps. Sino quedaba con ids
  // viejos cuando subían y bajaban el counter.
  useEffect(() => {
    if (seats >= activeUsers) {
      setKeepUserIds([]);
    }
  }, [seats, activeUsers]);

  if (isComp) {
    // Edge case: no debería abrirse en COMP, pero por safety.
    return null;
  }

  // minSeats = 1: el admin actual ocupa 1 seat siempre. Si baja a 1,
  // todos los demás active users quedan desactivados (con choice
  // explícito via checklist abajo). Antes era Math.max(1, activeUsers)
  // que bloqueaba el flow — el admin tenía que ir a Team primero a
  // deactivar manual. Fix 2026-06-25.
  const minSeats = 1;
  const isTrial = status === "TRIALING";
  const monthlyNow = monthlyTotalCents(currentSeats);
  const monthlyNew = monthlyTotalCents(Math.max(1, seats));
  const delta = monthlyNew - monthlyNow;
  const isIncreasing = delta > 0;
  const isDecreasing = delta < 0;

  // Si baja por debajo de active count, el admin debe elegir quién
  // mantiene. Lista de candidatos = otros active users (no el admin).
  const needsKeepChoice = seats < activeUsers;
  const otherActiveUsers = (activeUsersList || []).filter(
    (u) => u.id !== currentUserId,
  );
  const expectedKeepCount = Math.max(0, seats - 1); // -1 admin slot
  const keepListValid =
    !needsKeepChoice || keepUserIds.length === expectedKeepCount;

  const inputInvalid =
    !Number.isFinite(seats) ||
    seats < minSeats ||
    seats > SEAT_HARD_CAP ||
    !keepListValid;

  const inputError = (() => {
    if (!Number.isFinite(seats) || seats < 1) return "Must be at least 1 seat.";
    if (seats > SEAT_HARD_CAP)
      return `Above ${SEAT_HARD_CAP} requires manual setup — contact support.`;
    return null;
  })();

  function toggleKeep(userId: string) {
    setKeepUserIds((curr) =>
      curr.includes(userId)
        ? curr.filter((id) => id !== userId)
        : [...curr, userId],
    );
  }

  async function handleConfirm() {
    if (inputInvalid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/billing/update-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seats,
          // Solo enviamos keepUserIds cuando hace falta (bajar < active).
          // Sino el endpoint lo ignora.
          ...(needsKeepChoice && { keepUserIds }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Couldn't update seats. Please try again.");
        setLoading(false);
        return;
      }

      // Decisión Nicolás 2026-06-25: NO redirigimos al Portal después
      // del cambio. Era confuso porque parecía que el cambio se
      // ejecutaba en el Portal cuando ya estaba hecho. Ahora cerramos
      // el dialog y dejamos que la billing page refresque con polling.
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't update seats.");
    } finally {
      setLoading(false);
    }
  }

  // Abrir Stripe Portal en una nueva tab para que el admin cambie
  // payment method ANTES de confirmar el cambio de seats. Si el admin
  // necesita cambiar la card por una con más fondos antes de que
  // Stripe le cobre $X/mo nuevo, este es el momento. El dialog queda
  // abierto en la tab original — vuelve y confirma cuando termina.
  async function handleOpenPortal() {
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // Silent — si Portal falla, el admin ve el dialog igual con el
      // payment method actual y puede cancelar / proceder a su criterio.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage seats</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          Buy the number of seats your team needs and assign them by inviting
          teammates. {activeUsers > 0 && (
            <>
              You currently have <strong>{activeUsers}</strong> active
              teammate{activeUsers === 1 ? "" : "s"}.
            </>
          )}
        </p>

        {/* Counter input */}
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
                onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
                disabled={loading || seats <= minSeats}
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
                onClick={() => setSeats((s) => Math.min(SEAT_HARD_CAP, s + 1))}
                disabled={loading || seats >= SEAT_HARD_CAP}
              >
                +
              </Button>
            </div>
          </div>

          {inputError && (
            <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {inputError}
            </p>
          )}
        </div>

        {/* Breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Per seat</span>
            <span className="text-gray-900 font-medium">
              ${PRICE_PER_SEAT_DOLLARS}/mo
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {seats || 0} seat{seats === 1 ? "" : "s"}
            </span>
            <span className="text-gray-900 font-medium">
              ${fmt(monthlyNew)}/mo
            </span>
          </div>
          {delta !== 0 && (
            <div className="border-t border-gray-200 pt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600 flex items-center gap-1.5">
                {isIncreasing ? (
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-emerald-500" />
                )}
                Change
              </span>
              <span
                className={`font-bold ${isIncreasing ? "text-indigo-700" : "text-emerald-700"}`}
              >
                {isIncreasing ? "+" : "−"}${fmt(Math.abs(delta))}/mo
              </span>
            </div>
          )}
        </div>

        {/* Choice de quién mantiene seat cuando baja < activeUsers */}
        {needsKeepChoice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  Pick who keeps a seat
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  You're going from {activeUsers} to {seats} seat
                  {seats === 1 ? "" : "s"}. Select{" "}
                  <strong>{expectedKeepCount}</strong> teammate
                  {expectedKeepCount === 1 ? "" : "s"} below — the rest
                  will lose access (you can reassign their seat anytime
                  from the Team page).
                </p>
              </div>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {otherActiveUsers.length === 0 ? (
                <p className="text-xs text-amber-900 italic px-1">
                  No other teammates to deactivate.
                </p>
              ) : (
                otherActiveUsers.map((u) => {
                  const checked = keepUserIds.includes(u.id);
                  const wouldBeKept = checked;
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        wouldBeKept
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKeep(u.id)}
                        disabled={loading}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {u.name || u.email}
                        </p>
                        {u.name && (
                          <p className="text-xs text-gray-500 truncate">
                            {u.email}
                          </p>
                        )}
                      </div>
                      {u.role === "ADMIN" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          wouldBeKept
                            ? "text-emerald-700 bg-emerald-100"
                            : "text-gray-500 bg-gray-100"
                        }`}
                      >
                        {wouldBeKept ? "Keeps seat" : "Loses seat"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-amber-700 flex items-center gap-1 pt-1 border-t border-amber-200">
              <Shield className="h-3 w-3" />
              You (admin) always keep your own seat — not shown above.
            </p>

            {keepUserIds.length !== expectedKeepCount && (
              <p className="text-xs text-amber-900 font-medium">
                {keepUserIds.length < expectedKeepCount
                  ? `Select ${expectedKeepCount - keepUserIds.length} more.`
                  : `Unselect ${keepUserIds.length - expectedKeepCount}.`}
              </p>
            )}
          </div>
        )}

        {/* Contextual note */}
        {isTrial ? (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
            <p className="text-xs text-indigo-900 leading-relaxed">
              <strong>You're in trial</strong> — no charge yet. When the trial
              ends, you'll start paying for{" "}
              <strong>${fmt(monthlyNew)}/mo</strong>.
            </p>
          </div>
        ) : isIncreasing ? (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
            <p className="text-xs text-indigo-900 leading-relaxed">
              <strong>Available immediately.</strong> New seats can be assigned
              from the Team page. The new amount applies to your next invoice
              (no mid-cycle proration charges).
            </p>
          </div>
        ) : isDecreasing ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>Lower charge from next cycle.</strong> Your next invoice
              will be ${fmt(monthlyNew)}/mo. Deactivated members keep their
              freed seat available for future invites.
            </p>
          </div>
        ) : null}

        {/* Payment method — el admin necesita poder cambiar el método
            de pago ANTES de confirmar el cambio. Sino la diferencia se
            cobra a una card que capaz quiere cambiar. Memoria
            feedback_billing_transparency. Solo aplica a ACTIVE — en
            TRIAL todavía no hay sub Stripe ni payment method. */}
        {!isTrial && seats !== currentSeats && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CreditCard className="h-4 w-4 text-gray-500 shrink-0" />
              <p className="text-xs text-gray-700">
                <span className="font-medium">Charged to</span> your card on
                file at Stripe.{" "}
                {isIncreasing
                  ? `Next invoice: $${fmt(monthlyNew)}/mo.`
                  : `Lower charge starts next billing cycle.`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenPortal}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap flex items-center gap-1 shrink-0"
            >
              Change
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || inputInvalid || seats === currentSeats}
          >
            {/* Botón con monto explícito para que el click no sea sorpresa.
                "Confirm — $80/mo" deja en claro qué se está confirmando
                vs el ambiguo "Buy seats" anterior. */}
            {loading
              ? "Updating…"
              : seats === currentSeats
                ? "No change"
                : isTrial
                  ? `Save (${seats} seat${seats === 1 ? "" : "s"})`
                  : `Confirm — $${fmt(monthlyNew)}/mo`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
