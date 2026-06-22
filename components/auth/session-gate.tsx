"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { ShieldAlert, LogOut } from "lucide-react";

// Polling cada 30s al /api/auth/session-status para detectar si el
// user actual fue deactivated mientras tenía sesión abierta. Si
// detecta deactivation, monta un overlay full-screen bloqueante con
// un único botón: Log out.
//
// Decisión 2026-06-22 con Nicolás: 'cuando Ari está usando el portal
// y lo desactivo se le rompe y puede seguir usando settings'. La UI
// no debe quedar en estado roto silencioso — el user tiene que ver
// que perdió el acceso explícitamente.
//
// Por qué polling (no SSE / WebSocket): para MVP es overkill montar
// realtime. 30s de detection lag es aceptable y el polling es trivial
// de mantener. Si después escalamos, podemos cambiar al SSE.
//
// 30s también es el sweet spot: rápido enough para no dejar al user
// laburando en UI rota mucho rato, lento enough para no spamear el
// endpoint con un user logueado.

const POLL_INTERVAL_MS = 30_000;

export function SessionGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch("/api/auth/session-status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        if (data && data.active === false) {
          setBlocked(true);
        }
      } catch {
        // Network error / momentary: ignorar, retry en el próximo tick.
        // No queremos bloquear al user por un timeout transitorio.
      }
    }

    // Check inicial al montar — capta el caso de que el user llegue
    // a la página recién (post-load) y ya esté deactivated por algo
    // entre el server-render y el mount client.
    check();

    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-red-50 to-amber-50 p-6 border-b border-red-100">
          <div className="flex items-start gap-4">
            <div className="shrink-0 p-3 rounded-xl bg-red-100">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Your access has been revoked
              </h2>
              <p className="mt-1 text-sm text-gray-700">
                Your workspace admin has deactivated your account. Contact them
                if you think this is a mistake.
              </p>
            </div>
          </div>
        </div>

        {/* Single action: Log out */}
        <div className="p-6">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login?error=deactivated" })}
            className="flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold transition-colors text-base"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
          <p className="text-xs text-center text-gray-500 mt-3">
            You will be redirected to the login screen.
          </p>
        </div>
      </div>
    </div>
  );
}
