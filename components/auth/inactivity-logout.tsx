"use client";

import { useEffect, useRef, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";

// Forzá logout del user tras N minutos sin actividad. Estándar de
// plataformas serias (banking, healthcare, ATS). Razón: si dejaste
// la pestaña abierta en una compu compartida o te robaron el laptop,
// la sesión no queda abierta indefinidamente.
//
// Implementación: timer cliente-side que se reinicia con cualquier
// señal de actividad (mousemove / keydown / click / scroll / touch).
// Si nada pasa por INACTIVITY_MS, llamo signOut() con redirect a
// /login?reason=inactivity para que la página pueda mostrar un
// mensaje claro ("Sesión cerrada por inactividad").
//
// Multi-tab: cada pestaña tiene su propio timer pero coordinan via
// localStorage — actividad en cualquier tab del mismo origin
// resetea el timer en todas. Sin esto, una tab inactiva mientras
// laburás en otra te tira el logout aunque estás usando el sistema.
//
// Decisión Nicolás 2026-06-24: 30 minutos. Si en el futuro se
// necesita per-role (admin más corto, user más largo), parametrizar
// via prop.

const INACTIVITY_MS = 30 * 60 * 1000; // 30 min
const ACTIVITY_BROADCAST_KEY = "ats:last-activity";
const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

type Props = {
  // Override timeout for testing. Default 30 min.
  timeoutMs?: number;
  // Where to land the user after logout. Default to a generic login
  // — el layout que monta este componente decide qué login es (agency
  // vs client portal).
  redirectTo: string;
};

export function InactivityLogout({ timeoutMs = INACTIVITY_MS, redirectTo }: Props) {
  const { data: session, status } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const fireLogout = useCallback(() => {
    // signOut redirect — la URL final lleva ?reason=inactivity para
    // que el login page muestre el mensaje correcto en lugar de un
    // "Invalid credentials" genérico.
    const url = redirectTo.includes("?")
      ? `${redirectTo}&reason=inactivity`
      : `${redirectTo}?reason=inactivity`;
    void signOut({ callbackUrl: url });
  }, [redirectTo]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fireLogout, timeoutMs);
  }, [fireLogout, timeoutMs]);

  // Broadcast a otras tabs cada vez que detectamos actividad acá.
  // Usamos un throttle simple (1 escritura cada 30s max) para no
  // spammear localStorage en cada mousemove.
  const lastBroadcastRef = useRef<number>(0);
  const broadcastActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastBroadcastRef.current < 30_000) return;
    lastBroadcastRef.current = now;
    try {
      window.localStorage.setItem(ACTIVITY_BROADCAST_KEY, String(now));
    } catch {
      // localStorage puede fallar (private mode, quota) — no es crítico
    }
  }, []);

  useEffect(() => {
    // Solo activar el timer si hay session real. Mientras la session
    // está "loading", no contamos inactividad (puede haber refresh).
    if (status !== "authenticated" || !session?.user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    function onActivity() {
      resetTimer();
      broadcastActivity();
    }

    function onStorage(e: StorageEvent) {
      // Otra tab del mismo origin reporta actividad — resetá el timer
      // sin re-broadcastear (eso lo hace la tab originadora).
      if (e.key === ACTIVITY_BROADCAST_KEY && e.newValue) {
        lastActivityRef.current = Date.now();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(fireLogout, timeoutMs);
      }
    }

    // Bootstrap: arrancá con un timer fresco apenas se monta.
    resetTimer();

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, session, resetTimer, fireLogout, timeoutMs, broadcastActivity]);

  return null;
}
