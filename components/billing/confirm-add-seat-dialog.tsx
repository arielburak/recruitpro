"use client";

import { useState } from "react";
import { Users, AlertCircle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Pool seat model 2026-06-22 (refactor): el dialog de confirmación
// para invite/reactivate ya NO muestra "+$20/mo" en el momento del
// invite — el billing solo cambia cuando el admin compra/saca seats
// explícitamente desde /settings/billing → Manage seats.
//
// Lógica nueva:
//   · Hay seats disponibles → confirmar la asignación: "Assigning
//     seat — X of Y will be in use". Sin billing impact.
//   · Pool full → bloquear el confirm. CTA "Buy more seats" lleva
//     a /settings/billing.
//   · TRIAL: pool no limita (invite libre). Mostrar info que cuando
//     subscriba va a pagar por todos los seats activos.
//   · COMP: el caller no debería abrir el dialog (no aplica billing).
//
// El admin invita/reactiva con confianza — el costo lo decidió antes
// cuando compró el pool. Como las mejores plataformas SaaS.

type Mode = "invite" | "reactivate";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pool comprado (Subscription.seats en DB).
  currentSeats: number;
  // Active users count actual del workspace.
  activeUsers: number;
  status: string;
  isComp: boolean;
  teammateName?: string;
  mode?: Mode;
  onConfirm: () => void;
  loading?: boolean;
};

const copyByMode: Record<
  Mode,
  {
    title: string;
    actionVerb: string; // "invite" | "reactivate"
    confirmLabel: string;
    loadingLabel: string;
  }
> = {
  invite: {
    title: "Confirm invite",
    actionVerb: "Inviting",
    confirmLabel: "Confirm and invite",
    loadingLabel: "Sending invite…",
  },
  reactivate: {
    title: "Confirm reactivation",
    actionVerb: "Reactivating",
    confirmLabel: "Confirm and reactivate",
    loadingLabel: "Reactivating…",
  },
};

export function ConfirmAddSeatDialog({
  open,
  onOpenChange,
  currentSeats,
  activeUsers,
  status,
  isComp,
  teammateName,
  mode = "invite",
  onConfirm,
  loading,
}: Props) {
  const copy = copyByMode[mode];
  const [buyAndInviteLoading, setBuyAndInviteLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Pool calculations.
  const isTrial = status === "TRIALING";
  const seatsAfter = activeUsers + 1;
  const available = Math.max(0, currentSeats - activeUsers);
  // Trial e isComp pasan libre — no aplica pool gate visualmente.
  const isPoolFull = !isTrial && !isComp && available < 1;

  // "Buy seat & invite" flow: si pool full, este botón compra 1 seat
  // adicional + después dispara el invite en una sola acción. Una
  // cosa habilita la otra — feedback de Nicolás 2026-06-22.
  async function handleBuyAndInvite() {
    setBuyAndInviteLoading(true);
    setBuyError(null);
    try {
      const res = await fetch("/api/admin/billing/update-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: currentSeats + 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data?.error || "Couldn't buy seat. Try again.");
        setBuyAndInviteLoading(false);
        return;
      }
      // Seat comprado. Ahora disparamos el invite normal — el caller
      // hace el POST a /api/admin/invites. El gate ya pasa porque
      // ahora hay 1 seat disponible.
      onConfirm();
      // No cerramos manual — el caller cierra cuando termine.
    } catch (e: any) {
      setBuyError(e?.message || "Couldn't buy seat. Try again.");
      setBuyAndInviteLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>

        {/* Header text */}
        <p className="text-sm text-gray-600">
          {teammateName ? (
            <>
              {copy.actionVerb} <strong>{teammateName}</strong>{" "}
              {mode === "invite"
                ? "will give them access to the ATS"
                : "will restore their access to the ATS"}
              {isTrial
                ? "."
                : isPoolFull
                  ? " once you have an available seat."
                  : " with a seat from your pool."}
            </>
          ) : (
            <>
              {copy.actionVerb} this teammate will give them ATS access.
            </>
          )}
        </p>

        {/* Seat usage breakdown — solo cuando NO es trial. Durante
            trial el pool no se enforcen, mostrarlo confunde con "2 of 1". */}
        {!isTrial && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Seat usage
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                Currently in use
              </span>
              <span className="text-gray-900 font-medium">
                {activeUsers} of {currentSeats}
              </span>
            </div>
            {!isPoolFull && (
              <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
                <span className="text-gray-600">After this {mode}</span>
                <span className="text-indigo-700 font-semibold">
                  {seatsAfter} of {currentSeats}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contextual notes */}
        {isPoolFull ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-900 leading-relaxed flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>All seats are in use.</strong> Buying 1 more seat adds{" "}
                <strong>$20/mo</strong> to your subscription and{" "}
                {mode === "invite" ? "invites" : "reactivates"} {teammateName || "this teammate"}{" "}
                automatically.
              </span>
            </p>
          </div>
        ) : isTrial ? (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
            <p className="text-xs text-indigo-900 leading-relaxed">
              <strong>You&apos;re in trial</strong> — invite as many teammates
              as you want for free. When the trial ends you&apos;ll buy seats
              for the team size you have at that point.
            </p>
          </div>
        ) : null}

        {/* Error display */}
        {buyError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {buyError}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || buyAndInviteLoading}
          >
            Cancel
          </Button>
          {isPoolFull ? (
            <Button
              onClick={handleBuyAndInvite}
              disabled={loading || buyAndInviteLoading}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {buyAndInviteLoading
                ? "Buying seat…"
                : loading
                  ? copy.loadingLabel
                  : `Buy seat & ${mode === "invite" ? "invite" : "reactivate"}`}
            </Button>
          ) : (
            <Button onClick={onConfirm} disabled={loading}>
              {loading ? copy.loadingLabel : copy.confirmLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
