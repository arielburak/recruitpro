"use client";

import { useState, useEffect } from "react";
import { Users, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSeats: number;
  activeUsers: number;
  status: string; // "ACTIVE" | "TRIALING" | etc.
  isComp: boolean;
  onConfirmed?: () => void;
};

export function ManageSeatsDialog({
  open,
  onOpenChange,
  currentSeats,
  activeUsers,
  status,
  isComp,
  onConfirmed,
}: Props) {
  const [seats, setSeats] = useState(currentSeats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset state cada vez que abre — sino el N anterior persiste.
  useEffect(() => {
    if (open) {
      setSeats(currentSeats);
      setError("");
      setLoading(false);
    }
  }, [open, currentSeats]);

  if (isComp) {
    // Edge case: no debería abrirse en COMP, pero por safety.
    return null;
  }

  const minSeats = Math.max(1, activeUsers);
  const isTrial = status === "TRIALING";
  const monthlyNow = monthlyTotalCents(currentSeats);
  const monthlyNew = monthlyTotalCents(Math.max(1, seats));
  const delta = monthlyNew - monthlyNow;
  const isIncreasing = delta > 0;
  const isDecreasing = delta < 0;

  const inputInvalid =
    !Number.isFinite(seats) ||
    seats < minSeats ||
    seats > SEAT_HARD_CAP;

  const inputError = (() => {
    if (!Number.isFinite(seats) || seats < 1) return "Must be at least 1 seat.";
    if (seats < activeUsers)
      return `You have ${activeUsers} active teammates. Deactivate ${activeUsers - seats} from Team first.`;
    if (seats > SEAT_HARD_CAP)
      return `Above ${SEAT_HARD_CAP} requires manual setup — contact support.`;
    return null;
  })();

  async function handleConfirm() {
    if (inputInvalid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/billing/update-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Couldn't update seats. Please try again.");
        setLoading(false);
        return;
      }
      // Success — invocar callback + cerrar.
      onConfirmed?.();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't update seats.");
    } finally {
      setLoading(false);
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
                min={minSeats}
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
            {loading
              ? "Updating…"
              : seats === currentSeats
                ? "No change"
                : isIncreasing
                  ? "Buy seats"
                  : "Reduce seats"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
