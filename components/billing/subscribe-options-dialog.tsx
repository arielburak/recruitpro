"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, AlertTriangle } from "lucide-react";
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

// Dialog para subscribirse desde trial.
//
// Pivote 2026-06-23 (feedback Nicolás): "el free trial es free siempre,
// el periodo de facturacion comienza despues — como cualquier otra
// plataforma". Antes había 2 opciones: Pay now (cobra inmediato) Y
// Save card for later (trial end nativo Stripe). El usuario sentia
// que pedir tarjeta con doble-opcion durante trial era agresivo.
//
// Ahora: una sola opcion. Si está en TRIAL la card se guarda pero NO
// se cobra hasta que termine el trial (Stripe trial_end nativo). La
// opcion "Pay now and activate" se retiró — quien quiera activar
// antes que el trial termine, espera al cambio de estado en lugar de
// forzar cobro temprano.
//
// El backend (/api/admin/billing/checkout) ya soporta payNow=false
// como el flujo principal — solo dejamos de exponer el toggle.

const PRICE_PER_SEAT = SOLO_PRICE_PER_SEAT_CENTS / 100;
const SEAT_HARD_CAP = 100;

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

type Teammate = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Active users actuales (incluye al admin). Excluir el admin del
  // checklist — su seat es obligatorio.
  activeUsers: Teammate[];
  // userId del admin actual (no se puede deactivar a sí mismo).
  currentUserId: string;
  trialDaysLeft: number;
  trialEndsAt: Date | null;
};

export function SubscribeOptionsDialog({
  open,
  onOpenChange,
  activeUsers,
  currentUserId,
  trialDaysLeft,
  trialEndsAt,
}: Props) {
  const activeCount = activeUsers.length;
  const teammates = useMemo(
    () => activeUsers.filter((u) => u.id !== currentUserId),
    [activeUsers, currentUserId],
  );

  const [seats, setSeats] = useState(Math.max(1, activeCount));
  // userIds de teammates que el admin marcó para mantener acceso.
  // El admin actual está implícito (siempre keeps).
  const [keepIds, setKeepIds] = useState<Set<string>>(
    () => new Set(teammates.map((t) => t.id)),
  );
  const [loading, setLoading] = useState(false);

  // Reset state cada vez que se abre — sino el estado anterior persiste.
  useEffect(() => {
    if (open) {
      setSeats(Math.max(1, activeCount));
      setKeepIds(new Set(teammates.map((t) => t.id)));
      setLoading(false);
    }
  }, [open, activeCount, teammates]);

  const monthly = monthlyTotalCents(seats);
  const trialEndStr = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "trial end";

  // Modelo LinkedIn explícito (2026-06-25): el admin SIEMPRE elige
  // quién mantiene seat — incluso si compra MÁS seats que active users
  // (puede querer dejar 2 Available en pool para invitar después).
  //
  //   teammateSlotsAvailable = cuántos teammates PUEDE marcar (admin slot
  //     no cuenta — el admin actual siempre keep).
  //   teammatesKept = cuántos marcó.
  //   pickerVisible = mostrar la sección. Cuando hay teammates, sí.
  //   selectionIsValid = nunca puede marcar MÁS que slots disponibles.
  //     Marcar menos es válido (los seats sobrantes quedan Available).
  const teammateSlotsAvailable = Math.max(0, seats - 1);
  const teammatesKept = keepIds.size;
  const pickerVisible = teammates.length > 0;
  const selectionIsValid = teammatesKept <= teammateSlotsAvailable;

  // Quiénes pierden acceso al subscribir: teammates NO marcados.
  const willDeactivate = teammates.length - teammatesKept;
  // Seats sobrantes (Available) post-subscribe.
  const availableAfter = teammateSlotsAvailable - teammatesKept;

  function toggleKeep(id: string) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Cap dur: nunca permitir marcar MÁS que slots disponibles.
        // Aplica siempre, no solo cuando seats < activeUsers.
        if (next.size >= teammateSlotsAvailable) {
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  // Si bajan seats y queda con más keepIds que slots, recortar al límite.
  useEffect(() => {
    if (teammatesKept > teammateSlotsAvailable) {
      setKeepIds((prev) => {
        const arr = Array.from(prev);
        return new Set(arr.slice(0, teammateSlotsAvailable));
      });
    }
  }, [seats, teammateSlotsAvailable, teammatesKept]);

  const inputInvalid =
    !Number.isFinite(seats) || seats < 1 || seats > SEAT_HARD_CAP;
  const canConfirm = !inputInvalid && selectionIsValid && !loading;

  async function handleSubscribe() {
    if (!canConfirm) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Siempre payNow=false: la card queda guardada en Stripe pero
          // el cobro arranca recién en trial_end (Slack/Notion model).
          payNow: false,
          seats,
          // Siempre enviamos la lista — el backend desactiva a los que
          // NO están en keepUserIds. Modelo LinkedIn: el admin elige
          // EXACTAMENTE quién mantiene, no inferimos por count.
          keepUserIds: Array.from(keepIds),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data?.error || "Couldn't start checkout. Please try again.");
        setLoading(false);
      }
    } catch (e: any) {
      alert(e?.message || "Couldn't start checkout.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          {activeCount > 1 ? (
            <>
              You have <strong>{activeCount} active teammates</strong> using
              the ATS. Pick how many seats to keep and who they belong to.
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
                disabled={loading || seats <= 1}
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
                disabled={loading}
                className="w-20 text-center font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSeats((s) => Math.min(SEAT_HARD_CAP, s + 1))
                }
                disabled={loading || seats >= SEAT_HARD_CAP}
              >
                +
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ${fmt(monthly)}/mo · ${PRICE_PER_SEAT}/seat
          </p>
        </div>

        {/* Teammate selector — siempre visible cuando hay teammates.
            Modelo LinkedIn: el admin elige explícitamente. Puede dejar
            seats sin asignar (Available) para invitar después. */}
        {pickerVisible && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Assign seats to teammates
              </p>
              <span
                className={`text-xs font-semibold ${
                  selectionIsValid ? "text-gray-600" : "text-amber-700"
                }`}
              >
                {teammatesKept} / {teammateSlotsAvailable} assigned
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              You take 1 seat as admin (automatic). Pick up to{" "}
              <strong>
                {teammateSlotsAvailable} teammate
                {teammateSlotsAvailable === 1 ? "" : "s"}
              </strong>{" "}
              to assign the remaining seat
              {teammateSlotsAvailable === 1 ? "" : "s"}. Unassigned seats
              stay available — you can give them out anytime from the Team
              page. Teammates without a seat lose access but their data
              stays intact.
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {teammates.map((t) => {
                const isChecked = keepIds.has(t.id);
                const canCheck =
                  isChecked || teammatesKept < teammateSlotsAvailable;
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                      isChecked
                        ? "border-indigo-300 bg-indigo-50/40"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    } ${!canCheck ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKeep(t.id)}
                      disabled={!canCheck && !isChecked}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {t.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {t.email}
                      </p>
                    </div>
                    {t.role === "ADMIN" && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        ADMIN
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {willDeactivate > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>{`${willDeactivate} teammate${willDeactivate === 1 ? "" : "s"} won't get a seat.`}</strong>{" "}
              They lose access but their data (candidates, jobs, history)
              stays intact. Give them a seat anytime from the Team page.
            </p>
          </div>
        )}

        {availableAfter > 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
            <Users className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              <strong>
                {availableAfter} seat{availableAfter === 1 ? "" : "s"} will
                stay available.
              </strong>{" "}
              Reserved for new invites. You can assign them whenever you
              want from the Team page.
            </p>
          </div>
        )}

        {/* Reassurance copy — el corazon del pivote 2026-06-23. Antes
            la doble opcion (pay now / save card later) sugeria que la
            card era condicion para mantener el trial. Ahora dejamos
            super claro: trial sigue siendo gratis hasta que se termine
            solo. */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 mt-2">
          <p className="text-sm text-emerald-900 leading-relaxed">
            <strong>Your card won&apos;t be charged today.</strong> You have{" "}
            {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} of free trial
            left — billing of <strong>${fmt(monthly)}/mo</strong> starts on{" "}
            <strong>{trialEndStr}</strong>. Cancel anytime before then.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubscribe} disabled={!canConfirm}>
            {loading ? "Opening Stripe…" : "Continue to checkout"}
          </Button>
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-2">
          ${PRICE_PER_SEAT}/seat per month · Cancel anytime
        </p>
      </DialogContent>
    </Dialog>
  );
}
