"use client";

import { useState } from "react";
import { CreditCard, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BillingImpactBlock } from "@/components/billing/billing-impact-block";

// Dialog que confirma al admin el impacto en billing antes de agregar
// un seat. Cubre 2 modos:
//
//   · invite     → "Inviting X will add a seat..." (default)
//   · reactivate → "Reactivating X will add a seat back..."
//
// Aparece para ACTIVE y TRIALING. Para COMP el caller decide skipearlo
// (BillingImpactBlock no renderiza igual, así que el dialog quedaría
// con info breakdown vacío — el ConfirmAddSeatDialog NO se debe abrir
// en COMP).
//
// Decisión 2026-06-22 con Nicolás: incluir secondary link "Change
// payment method" que abre el Customer Portal de Stripe en nueva tab.
// Razón: si el admin va a pagar más, puede querer cambiar la tarjeta
// (corporativa vs personal). Antes de eso el flow no le daba la
// oportunidad — silent toggle hacia más cobro.

type Mode = "invite" | "reactivate";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSeats: number;
  status: string;
  isComp: boolean;
  // Nombre del teammate involucrado (para personalizar el copy).
  teammateName?: string;
  // Determina copy + label del botón confirmar.
  mode?: Mode;
  onConfirm: () => void;
  loading?: boolean;
};

const copyByMode: Record<
  Mode,
  { title: string; bodyWithName: (n: string) => string; bodyWithoutName: string; confirmLabel: string; loadingLabel: string }
> = {
  invite: {
    title: "Add a seat to your subscription",
    bodyWithName: (n) =>
      `Inviting <strong>${n}</strong> will add a seat to your subscription as soon as they accept.`,
    bodyWithoutName:
      "This will add a seat to your subscription as soon as the teammate accepts.",
    confirmLabel: "Confirm and invite",
    loadingLabel: "Sending invite…",
  },
  reactivate: {
    title: "Reactivate teammate",
    bodyWithName: (n) =>
      `Reactivating <strong>${n}</strong> will add a seat back to your subscription. They'll regain access immediately.`,
    bodyWithoutName:
      "Reactivating this teammate will add a seat back to your subscription. They'll regain access immediately.",
    confirmLabel: "Confirm and reactivate",
    loadingLabel: "Reactivating…",
  },
};

export function ConfirmAddSeatDialog({
  open,
  onOpenChange,
  currentSeats,
  status,
  isComp,
  teammateName,
  mode = "invite",
  onConfirm,
  loading,
}: Props) {
  const [portalLoading, setPortalLoading] = useState(false);
  const copy = copyByMode[mode];

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        // Abrir en nueva tab para que el user vuelva al dialog
        // después de cambiar el método. El dialog queda abierto.
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        // QA Medium: antes el portal failure (e.g. customerId pending_*,
        // 403 non-admin, 500 Stripe down) era silent — el botón paraba
        // de cargar y nada pasaba. Surface el error al user.
        alert(
          data?.error ||
            "Couldn't open billing portal. Try /settings/billing directly."
        );
      }
    } catch {
      alert("Couldn't open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  // Mostrar el link "Change payment method" SOLO cuando aplica billing
  // (no en COMP) y hay método existente (no en pure TRIAL sin sub Stripe).
  // Como no recibimos hasStripeSubscriptionId acá, lo asumimos por status:
  // ACTIVE → ya hay tarjeta; TRIALING → solo si el caller la pasó (default
  // skip — durante trial no se cobra ahora, no hace falta cambiarla).
  const showChangePayment = status === "ACTIVE" && !isComp;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>

        <p
          className="text-sm text-gray-600"
          dangerouslySetInnerHTML={{
            __html: teammateName
              ? copy.bodyWithName(teammateName)
              : copy.bodyWithoutName,
          }}
        />

        <BillingImpactBlock
          currentSeats={currentSeats}
          delta={1}
          status={status}
          isComp={isComp}
        />

        {showChangePayment && (
          <button
            type="button"
            onClick={openBillingPortal}
            disabled={portalLoading || loading}
            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-1 disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {portalLoading
              ? "Opening Stripe…"
              : "Change payment method first"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? copy.loadingLabel : copy.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
