"use client";

import { useState, useEffect } from "react";
import { CalendarClock, Zap, Users, AlertTriangle } from "lucide-react";
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

// Dialog para subscribirse desde trial. Permite al admin:
//   1. Elegir cuántos seats comprar (default = current active users).
//      Puede ser menos: los usuarios que sobren quedan deactivated y
//      pueden reactivarse comprando más seats después.
//   2. Decidir cuándo arranca el cobro:
//      · "Pay now and activate" → cobra inmediato, sub ACTIVE
//      · "Save card, charge at trial end" → guarda tarjeta + trial_end,
//        cobra automático al fin del trial
//
// Decisión 2026-06-22 con Nicolás: el trial es para que el admin
// arme su equipo libre. Al subscribirse decide qué tamaño mantener.

const PRICE_PER_SEAT = SOLO_PRICE_PER_SEAT_CENTS / 100;
const SEAT_HARD_CAP = 100;

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Active users actuales (incluye al admin). Default del selector.
  activeUsers: number;
  trialDaysLeft: number;
  trialEndsAt: Date | null;
};

export function SubscribeOptionsDialog({
  open,
  onOpenChange,
  activeUsers,
  trialDaysLeft,
  trialEndsAt,
}: Props) {
  const [seats, setSeats] = useState(Math.max(1, activeUsers));
  const [loadingOption, setLoadingOption] = useState<"now" | "later" | null>(
    null,
  );

  // Reset state cada vez que se abre — sino el N anterior persiste.
  useEffect(() => {
    if (open) {
      setSeats(Math.max(1, activeUsers));
      setLoadingOption(null);
    }
  }, [open, activeUsers]);

  const monthly = monthlyTotalCents(seats);
  const trialEndStr = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "trial end";

  // Si elige menos seats que active users, los extra se deactivan.
  const willDeactivate = Math.max(0, activeUsers - seats);
  const inputInvalid =
    !Number.isFinite(seats) || seats < 1 || seats > SEAT_HARD_CAP;

  async function handleSubscribe(payNow: boolean) {
    if (inputInvalid) return;
    setLoadingOption(payNow ? "now" : "later");
    try {
      const res = await fetch("/api/admin/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payNow, seats }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data?.error || "Couldn't start checkout. Please try again.");
        setLoadingOption(null);
      }
    } catch (e: any) {
      alert(e?.message || "Couldn't start checkout.");
      setLoadingOption(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          {activeUsers > 1 ? (
            <>
              You have <strong>{activeUsers} active teammates</strong> using
              the ATS. Pick how many seats to keep — extras will lose access
              and can be reactivated later by buying more seats.
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
                disabled={loadingOption !== null || seats <= 1}
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
                disabled={loadingOption !== null}
                className="w-20 text-center font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSeats((s) => Math.min(SEAT_HARD_CAP, s + 1))
                }
                disabled={loadingOption !== null || seats >= SEAT_HARD_CAP}
              >
                +
              </Button>
            </div>
          </div>
        </div>

        {/* Warning: si compra menos que active users */}
        {willDeactivate > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>
                {willDeactivate} teammate
                {willDeactivate === 1 ? "" : "s"} will be deactivated.
              </strong>{" "}
              They&apos;ll lose access to the ATS. You can reactivate them
              later by buying more seats — their data stays intact.
            </p>
          </div>
        )}

        {/* Trial days remaining */}
        <p className="text-xs text-gray-500 mt-1">
          You have <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}</strong> left
          in your trial.
        </p>

        {/* Option A — Pay now */}
        <button
          type="button"
          onClick={() => handleSubscribe(true)}
          disabled={loadingOption !== null || inputInvalid}
          className="text-left w-full rounded-xl border-2 border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 p-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  Pay now and activate
                </p>
                <span className="text-sm font-semibold text-indigo-700">
                  ${fmt(monthly)} today
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 leading-snug">
                Start your billing right away. No interruption when the
                trial ends.
              </p>
              {loadingOption === "now" && (
                <p className="text-xs text-indigo-600 mt-2">Opening Stripe…</p>
              )}
            </div>
          </div>
        </button>

        {/* Option B — Save card for later */}
        <button
          type="button"
          onClick={() => handleSubscribe(false)}
          disabled={loadingOption !== null || inputInvalid}
          className="text-left w-full rounded-xl border border-gray-200 hover:border-gray-400 bg-white p-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 p-2 rounded-lg bg-gray-100 text-gray-700">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  Save card, charge at {trialEndStr}
                </p>
                <span className="text-sm font-medium text-gray-500">
                  ${fmt(monthly)}/mo
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 leading-snug">
                Keep your free trial through the end. We&apos;ll charge the
                card automatically on the last day.
              </p>
              {loadingOption === "later" && (
                <p className="text-xs text-gray-500 mt-2">Opening Stripe…</p>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center justify-end mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loadingOption !== null}
          >
            Cancel
          </Button>
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-1">
          ${PRICE_PER_SEAT}/seat per month · Cancel anytime
        </p>
      </DialogContent>
    </Dialog>
  );
}
