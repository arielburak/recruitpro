"use client";

import { Users, TrendingUp, TrendingDown, Sparkles, Info } from "lucide-react";
import { monthlyTotalCents, perSeatCents } from "@/lib/constants";

// Bloque visual reusable que muestra el impacto en billing cuando una
// acción cambia el seat count: invite (+1), deactivate / delete (-1).
// Adapta copy y tono según el estado actual de la subscription:
//
//   · ACTIVE → "Bill changes from $X to $Y. Stripe prorates on next invoice."
//   · TRIALING → "After your trial ends, you'll pay $Y/mo (was $X/mo)."
//   · COMP → no se muestra (no aplica billing).
//
// Decisión 2026-06-22 con Nicolás: estandarizar el patrón en los 3
// dialogs (add seat, deactivate, delete) para que el admin siempre
// sepa el impacto financiero antes de confirmar. Idea inspirada en
// el feedback de Reactivate ("toggle silencioso es amateur").

type Props = {
  currentSeats: number;
  delta: -1 | 1; // -1 = removing seat, 1 = adding seat
  status: string; // "ACTIVE" | "TRIALING" | "CANCELED" | etc.
  isComp: boolean;
};

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function BillingImpactBlock({
  currentSeats,
  delta,
  status,
  isComp,
}: Props) {
  // No mostrar para comp (no pagan) o cuando la sub está canceled/
  // unpaid/past_due (el cobro está roto, agregar info de prorate
  // confunde más que ayuda).
  if (isComp) return null;
  if (status !== "ACTIVE" && status !== "TRIALING") return null;

  const newSeats = Math.max(0, currentSeats + delta);
  const currentMonthly = monthlyTotalCents(currentSeats);
  const newMonthly = monthlyTotalCents(newSeats);
  const diff = Math.abs(newMonthly - currentMonthly);
  const perSeat = perSeatCents(Math.max(1, newSeats));

  const isAdding = delta > 0;
  const isTrial = status === "TRIALING";

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 mt-2">
      {/* Header */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Billing impact
      </p>

      {/* Current → New breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            Current
          </span>
          <span className="text-sm text-gray-900 font-medium">
            {currentSeats} {currentSeats === 1 ? "seat" : "seats"} ·{" "}
            <span className="text-gray-500">${fmt(currentMonthly)}/mo</span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            {isAdding ? (
              <TrendingUp className="h-4 w-4 text-indigo-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-emerald-500" />
            )}
            {isAdding ? "After this invite" : "After this change"}
          </span>
          <span
            className={`text-sm font-semibold ${
              isAdding ? "text-indigo-700" : "text-emerald-700"
            }`}
          >
            {newSeats} {newSeats === 1 ? "seat" : "seats"} · $
            {fmt(newMonthly)}/mo
          </span>
        </div>

        <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            {isAdding ? "Added to your bill" : "Saved on your bill"}
          </span>
          <span className="text-base font-bold text-gray-900">
            {isAdding ? "+" : "−"}${fmt(diff)}/mo
          </span>
        </div>
      </div>

      {/* Prorate / trial note */}
      <div
        className={`rounded-lg border p-3 ${
          isTrial
            ? "bg-indigo-50 border-indigo-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <p
          className={`text-xs leading-relaxed flex items-start gap-2 ${
            isTrial ? "text-indigo-900" : "text-amber-900"
          }`}
        >
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {isTrial ? (
            <span>
              <strong>You&apos;re still in trial</strong> — no charge yet. The
              new total of <strong>${fmt(newMonthly)}/mo</strong> kicks in when
              your trial ends.
            </span>
          ) : isAdding ? (
            <span>
              <strong>Prorated for this month:</strong> Stripe charges only the
              remaining days at ${fmt(perSeat)}/seat. The full +${fmt(diff)}/mo
              kicks in on your next billing cycle.
            </span>
          ) : (
            <span>
              <strong>Credited to your next invoice:</strong> Stripe prorates
              the unused days and applies the credit automatically. Your next
              bill will be <strong>${fmt(newMonthly)}/mo</strong>.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
