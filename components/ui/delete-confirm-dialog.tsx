"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Reusable destructive-action confirmation. Use it for any delete in
// the ATS — candidates, jobs, clients, contacts, documents, etc.
// Renders nothing while `open` is false, so it's cheap to drop in.
//
// Why a dedicated component instead of window.confirm: the consequence
// list makes the user actually read what's being destroyed (cascade
// deletes wipe submissions, activity history, interview records, etc.
// — small text "Are you sure?" doesn't carry that weight).
//
// Optional extraToggle: gives the caller a checkbox inside the dialog
// for sub-decisions like "also delete metrics history". Caller owns
// the state; we just render the UI + thread the value into onConfirm.
type ExtraToggle = {
  // Display label, shown next to the checkbox.
  label: string;
  // Optional small print under the label explaining what each state
  // means. Keep it concrete — the user is committing to a destructive
  // action, they need to know what changes.
  description?: string;
  // Default checked state. Used as the initial state; subsequent
  // mutations stay local to the dialog.
  defaultChecked?: boolean;
};

type DeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Plain-text label of the item being deleted, used in the title.
  // E.g. "Juan Pérez" or "Lionpoint LLC".
  itemLabel: string;
  // Optional one-word descriptor of the item kind, used in the
  // description. E.g. "candidato", "job", "cliente". Falls back to
  // a generic copy if omitted.
  itemKind?: string;
  // Bullet list of what will also be deleted as part of this action.
  // Compose plain user-facing strings — the component just renders
  // them. Keep them concrete: "3 submissions" beats "related records".
  consequences?: string[];
  // Optional sub-decision. The dialog renders a checkbox; the boolean
  // is passed to onConfirm so the caller can branch on it.
  extraToggle?: ExtraToggle;
  // Async-aware. While the returned promise is pending, the dialog
  // shows a disabled "Borrando…" button. Errors should be handled
  // upstream (toast / inline) — this component just gates the action.
  // The second arg is the extraToggle value (true if checked) — undefined
  // when there's no toggle.
  onConfirm: (extraChecked?: boolean) => void | Promise<void>;
  // Override the destructive button label if "Sí, borrar" doesn't
  // fit (e.g. "Sí, eliminar permanentemente" for higher-stakes flows).
  confirmLabel?: string;
};

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemLabel,
  itemKind,
  consequences,
  extraToggle,
  onConfirm,
  confirmLabel = "Sí, borrar",
}: DeleteConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [extraChecked, setExtraChecked] = useState(extraToggle?.defaultChecked ?? true);

  // Reset the extra toggle to its default whenever the dialog opens —
  // otherwise the previous decision lingers across opens, exactly the
  // state-retention bug we just fixed in invite dialogs.
  useEffect(() => {
    if (open) {
      setExtraChecked(extraToggle?.defaultChecked ?? true);
    }
  }, [open, extraToggle?.defaultChecked]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(extraToggle ? extraChecked : undefined);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  // Reset loading when the dialog closes from the outside (cancel /
  // escape / backdrop) so a re-open doesn't get stuck in "Borrando…".
  const handleOpenChange = (next: boolean) => {
    if (!next) setLoading(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 p-2 shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold">
                ¿Borrar {itemLabel}?
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                Esta acción <span className="font-semibold text-red-600">no se puede deshacer</span>
                {itemKind ? ` y eliminará permanentemente este ${itemKind} de la base de datos` : ""}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {consequences && consequences.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50/70 px-3 py-2.5">
            <p className="text-xs font-semibold text-red-700 mb-1.5 uppercase tracking-wider">
              Esto también se eliminará:
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              {consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {extraToggle && (
          <label className="flex items-start gap-2.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={extraChecked}
              onChange={(e) => setExtraChecked(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800">
                {extraToggle.label}
              </span>
              {extraToggle.description && (
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                  {extraToggle.description}
                </p>
              )}
            </div>
          </label>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Borrando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
