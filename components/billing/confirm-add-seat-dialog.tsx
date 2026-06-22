"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BillingImpactBlock } from "@/components/billing/billing-impact-block";

// Dialog que confirma al admin el impacto en billing antes de invitar
// a un nuevo teammate. Aparece para workspaces ACTIVE (cobro inmediato
// prorrateado) y TRIALING (avisa que el monto sube cuando termine el
// trial). Para COMP no aparece — no aplica billing.
//
// Decisión 2026-06-22: aparecer también en TRIAL — el user todavía no
// paga pero conviene setear expectativas. Sino llega al fin del trial
// con un bill mayor del esperado.

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSeats: number;
  status: string; // "ACTIVE" | "TRIALING" | ...
  isComp: boolean;
  newTeammateName?: string;
  onConfirm: () => void;
  loading?: boolean;
};

export function ConfirmAddSeatDialog({
  open,
  onOpenChange,
  currentSeats,
  status,
  isComp,
  newTeammateName,
  onConfirm,
  loading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a seat to your subscription</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          {newTeammateName ? (
            <>
              Inviting <strong>{newTeammateName}</strong> will add a seat to
              your subscription as soon as they accept.
            </>
          ) : (
            <>
              This will add a seat to your subscription as soon as the teammate
              accepts the invite.
            </>
          )}
        </p>

        <BillingImpactBlock
          currentSeats={currentSeats}
          delta={1}
          status={status}
          isComp={isComp}
        />

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
