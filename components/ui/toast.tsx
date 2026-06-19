"use client";

import { useEffect, useState } from "react";

// Toast minimalista: reemplazo de window.alert() en flujos client-side.
// Sin dependencias externas — pub/sub con un Set + Toaster montado en el
// root layout que renderea la lista actual.
//
// Uso:
//   import { showToast } from "@/components/ui/toast";
//   showToast("Saved.");
//   showToast("Failed to remove member", "error");

type ToastType = "success" | "error";
type Toast = { id: number; message: string; type: ToastType };

const listeners = new Set<(toast: Toast) => void>();
let nextId = 0;

export function showToast(message: string, type: ToastType = "error") {
  const id = ++nextId;
  listeners.forEach((l) => l({ id, message, type }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== toast.id)),
        4000,
      );
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg border max-w-sm ${
            t.type === "error"
              ? "bg-red-50 text-red-900 border-red-200"
              : "bg-emerald-50 text-emerald-900 border-emerald-200"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
