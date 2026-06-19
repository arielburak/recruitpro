"use client";

// Helper imperativo para reemplazar window.confirm() / confirm() sin
// tener que setup state local + JSX en cada caller. Uso:
//
//   const ok = await confirmDialog({
//     title: "Disconnect Google?",
//     description: "You'll need to reconnect to create Meet links.",
//     confirmLabel: "Disconnect",
//   });
//   if (!ok) return;
//
// Internamente: monta un componente con DeleteConfirmDialog en un
// portal, resuelve la promesa al confirmar/cancelar, y desmonta.
// Idempotente — si lo llamás 2x se manejan en paralelo independiente.

import { useEffect, useState } from "react";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

type ConfirmOptions = {
  title?: string;
  description?: string;
  itemLabel?: string;
  consequences?: string[];
  confirmLabel?: string;
};

type Resolver = (ok: boolean) => void;

const listeners = new Set<(req: { id: number; opts: ConfirmOptions; resolve: Resolver }) => void>();
let nextId = 0;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++nextId;
    listeners.forEach((l) => l({ id, opts, resolve }));
  });
}

// Mount-once component, va en el root layout junto al Toaster. Mantiene
// la lista de dialogs vivos y los renderea encima de todo.
export function ConfirmDialogHost() {
  const [active, setActive] = useState<{
    id: number;
    opts: ConfirmOptions;
    resolve: Resolver;
  }[]>([]);

  useEffect(() => {
    const handler = (req: { id: number; opts: ConfirmOptions; resolve: Resolver }) => {
      setActive((prev) => [...prev, req]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  function close(id: number, ok: boolean) {
    setActive((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) target.resolve(ok);
      return prev.filter((x) => x.id !== id);
    });
  }

  return (
    <>
      {active.map((req) => (
        <DeleteConfirmDialog
          key={req.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) close(req.id, false);
          }}
          itemLabel={req.opts.itemLabel || ""}
          title={req.opts.title}
          description={req.opts.description}
          consequences={req.opts.consequences}
          confirmLabel={req.opts.confirmLabel || "Yes, continue"}
          onConfirm={async () => {
            close(req.id, true);
          }}
        />
      ))}
    </>
  );
}
