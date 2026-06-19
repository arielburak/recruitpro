"use client";

import { Sparkles, Users, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { monthlyTotalCents, perSeatCents } from "@/lib/constants";

// Dialog que confirma al admin el impacto en el billing antes de
// invitar a un nuevo teammate. Solo se muestra cuando la org está en
// estado ACTIVE (cliente pago) — durante trial o comp no hay impacto
// inmediato, no vale la pena interrumpir el flow.
//
// Estilo de UX inspirado en Linear / Slack / Notion: breakdown claro
// "Hoy estás pagando X" → "Vas a pagar Y" con la diferencia destacada.
// Prorrate explicado en una sola línea para que el admin sepa que el
// cobro extra de este mes es proporcional, no el monto completo.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSeats: number;
  newTeammateName?: string; // optional, for friendlier copy
  onConfirm: () => void;
  loading?: boolean;
};

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function ConfirmAddSeatDialog({
  open,
  onOpenChange,
  currentSeats,
  newTeammateName,
  onConfirm,
  loading,
}: Props) {
  const newSeats = currentSeats + 1;
  const currentMonthly = monthlyTotalCents(currentSeats);
  const newMonthly = monthlyTotalCents(newSeats);
  const delta = newMonthly - currentMonthly;
  const perSeat = perSeatCents(newSeats);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a seat to your subscription</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          {newTeammateName ? (
            <>
              Inviting <strong>{newTeammateName}</strong> will add a seat to your subscription.
            </>
          ) : (
            <>
              This will add a seat to your subscription as soon as the
              teammate accepts the invite.
            </>
          )}
        </p>

        {/* Breakdown card */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 mt-2">
          {/* Current */}
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

          {/* New */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              After this invite
            </span>
            <span className="text-sm text-indigo-700 font-semibold">
              {newSeats} {newSeats === 1 ? "seat" : "seats"} ·{" "}
              ${fmt(newMonthly)}/mo
            </span>
          </div>

          {/* Difference */}
          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Added to your bill
            </span>
            <span className="text-base font-bold text-gray-900">
              +${fmt(delta)}/mo
            </span>
          </div>
        </div>

        {/* Prorate note */}
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 mt-3">
          <p className="text-xs text-indigo-900 leading-relaxed">
            <strong>Prorated for this month:</strong> Stripe charges only the
            remaining days at ${fmt(perSeat)}/seat. The full $
            {fmt(delta)}/mo kicks in on your next billing cycle.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Sending invite…" : "Confirm and invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
