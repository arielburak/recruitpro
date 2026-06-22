"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { ShieldAlert, LogOut } from "lucide-react";

// Detección de deactivation mid-sesión. Combina 3 estrategias para
// que el user nunca se quede más de unos segundos viendo UI rota:
//
//   1. Polling cada 10s al /api/auth/session-status
//   2. Trigger inmediato cuando la pestaña vuelve a estar visible
//      (el user vuelve a usar el ATS después de una pausa)
//   3. Listener global de respuestas 401 — si CUALQUIER fetch del ATS
//      devuelve 401, asumimos que la session puede estar comprometida
//      y disparamos un check inmediato
//
// Decisión 2026-06-22 con Nicolás: 'cuando Ari está usando el portal
// y lo desactivo solo le aparece error'. Ese error venía de fetches
// que tiraban 401 antes que el polling (cada 30s) detectara. Ahora
// el listener 401 dispara el check apenas pasa el primer error.
//
// Por qué polling + listener (no solo polling): el listener da
// detection casi instantánea para users navegando activamente, el
// polling cubre el caso del user con la página abierta sin interactuar.

const POLL_INTERVAL_MS = 10_000;

export function SessionGate() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    let checking = false;

    async function check() {
      if (checking) return; // evitar dobles checks concurrentes
      checking = true;
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
        // Network error transitorio: skip, retry en el próximo tick.
      } finally {
        checking = false;
      }
    }

    // Check inicial al montar — capta el caso de que el user llegue
    // a la página recién (post-load) y ya esté deactivated por algo
    // entre el server-render y el mount client.
    check();

    const interval = setInterval(check, POLL_INTERVAL_MS);

    // Page visibility: cuando el user vuelve al tab, check inmediato.
    function onVisibility() {
      if (document.visibilityState === "visible") {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Global 401 listener: monkey-patch fetch para detectar respuestas
    // 401 y disparar un check inmediato. Sin esto el user veía "error"
    // de algún endpoint que falló mientras el polling esperaba el
    // próximo tick. La intercepción es transparente — solo lee status,
    // no toca el response.
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      // Solo nos interesan responses 401 de nuestro propio backend.
      // Evitamos disparar el check para nuestro propio session-status
      // (sino entramos en loop infinito).
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        if (res.status === 401 && !url.includes("/api/auth/session-status")) {
          // Async no-await: dejamos seguir el fetch original sin
          // bloquear, el check corre en paralelo.
          void check();
        }
      } catch {
        // Si url parsing falla, skip — no rompemos el fetch original.
      }
      return res;
    };

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      // Restaurar el fetch original al desmontar (poco probable que
      // pase en práctica porque el layout queda montado, pero limpio).
      window.fetch = originalFetch;
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
