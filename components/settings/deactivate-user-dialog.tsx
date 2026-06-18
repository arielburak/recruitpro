"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, Briefcase, Users, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Dialog que pide la decisión al admin antes de desactivar a un user.
// Carga el impact info (counts + lista de upcoming interviews) cuando
// se abre, y muestra opciones de qué hacer con las reuniones futuras.
//
// Por qué es importante: deactivate sin pensar dejaba interviews
// zombie — el candidate llegaba al meet sin nadie del lado nuestro.
// El dialog obliga a tomar una decisión consciente.

type ImpactData = {
  user: { id: string; name: string; email: string; role: string };
  counts: {
    assignments: number;
    ownedCandidates: number;
    activeSubmissions: number;
    upcomingInterviews: number;
  };
  upcomingInterviews: Array<{
    id: string;
    title: string;
    startTime: string;
    jobTitle: string;
  }>;
  potentialReassignees: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
};

type InterviewChoice = "cancel" | "reassign" | "keep";

export function DeactivateUserDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onDeactivated,
}: {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeactivated: (summary: { interviewsHandled: number; choice: InterviewChoice }) => void;
}) {
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<InterviewChoice>("keep");
  const [reassignToUserId, setReassignToUserId] = useState<string>("");

  // Re-fetch impact cada vez que se abre. Sin esto, si abrís dialog
  // para user A, lo cancelás, después abrís para user B, ves los
  // counts de A por un instante. Reset de state también.
  useEffect(() => {
    if (!open || !userId) {
      setImpact(null);
      setError("");
      setChoice("keep");
      setReassignToUserId("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/users/${userId}/deactivate`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.error) {
          setError(data.error);
          return;
        }
        setImpact(data);
        // Si NO hay interviews futuras, no hay decisión que tomar:
        // default a "keep" (= no-op) y skipeamos las opciones en UI.
        if (data?.counts?.upcomingInterviews === 0) {
          setChoice("keep");
        } else {
          // Default a cancel — la opción más segura cuando hay
          // interviews pendientes. Sin nadie reasignado, esos
          // candidates quedan en limbo. Mejor cancelarlas y
          // re-agendarlas conscientemente que dejarlas huérfanas.
          setChoice("cancel");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load impact");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  async function handleConfirm() {
    if (!userId) return;
    if (choice === "reassign" && !reassignToUserId) {
      setError("Pick a teammate to reassign the interviews to.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcomingInterviews: choice,
          reassignToUserId: choice === "reassign" ? reassignToUserId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Deactivation failed");
        setSubmitting(false);
        return;
      }
      onDeactivated({
        interviewsHandled: data?.interviewsHandled ?? 0,
        choice,
      });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Deactivation failed");
    } finally {
      setSubmitting(false);
    }
  }

  const hasUpcoming = (impact?.counts.upcomingInterviews ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {userName}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-6 text-sm text-gray-500">Loading impact…</div>
        )}

        {!loading && impact && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              They&apos;ll lose access immediately. All history (comments,
              past work, assignments) stays intact so you can reactivate
              later without losing anything.
            </p>

            {/* Impact summary */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Active work today
              </p>
              <ul className="text-sm text-gray-700 space-y-1.5">
                <li className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  Assigned to {impact.counts.assignments} job
                  {impact.counts.assignments === 1 ? "" : "s"}
                </li>
                <li className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  Owner of {impact.counts.ownedCandidates} candidate
                  {impact.counts.ownedCandidates === 1 ? "" : "s"}
                </li>
                <li className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-gray-400" />
                  {impact.counts.activeSubmissions} active submission
                  {impact.counts.activeSubmissions === 1 ? "" : "s"} in pipeline
                </li>
                <li
                  className={`flex items-center gap-2 ${
                    hasUpcoming ? "text-amber-700 font-medium" : ""
                  }`}
                >
                  <Calendar
                    className={`h-4 w-4 ${
                      hasUpcoming ? "text-amber-600" : "text-gray-400"
                    }`}
                  />
                  {impact.counts.upcomingInterviews} interview
                  {impact.counts.upcomingInterviews === 1 ? "" : "s"} scheduled
                  upcoming
                </li>
              </ul>
            </div>

            {/* Interview handling — solo si hay alguna upcoming */}
            {hasUpcoming && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    Before deactivating, what should happen to the
                    upcoming interviews?
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="choice"
                      value="cancel"
                      checked={choice === "cancel"}
                      onChange={() => setChoice("cancel")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Cancel them
                      </p>
                      <p className="text-xs text-gray-500">
                        Marks interviews as cancelled in the ATS. You&apos;ll
                        still need to email candidates and clients manually
                        to let them know.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="choice"
                      value="reassign"
                      checked={choice === "reassign"}
                      onChange={() => setChoice("reassign")}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Reassign to another teammate
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        Transfers ownership and interviewer slot to whoever
                        you pick. They&apos;ll see the interviews on their
                        calendar.
                      </p>
                      {choice === "reassign" && (
                        <select
                          value={reassignToUserId}
                          onChange={(e) => setReassignToUserId(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">— Select teammate —</option>
                          {impact.potentialReassignees.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.role.toLowerCase()})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="choice"
                      value="keep"
                      checked={choice === "keep"}
                      onChange={() => setChoice("keep")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Keep them as-is
                      </p>
                      <p className="text-xs text-gray-500">
                        Don&apos;t touch the interviews. You&apos;ll handle
                        them manually.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Lista de interviews afectadas, para que el admin sepa
                cuales son antes de decidir. */}
            {hasUpcoming && impact.upcomingInterviews.length > 0 && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">
                  View list of upcoming interviews ({impact.upcomingInterviews.length})
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {impact.upcomingInterviews.map((i) => (
                    <li key={i.id}>
                      <span className="font-medium">{i.title}</span>
                      {i.jobTitle && <span> · {i.jobTitle}</span>}
                      <span className="text-gray-400">
                        {" "}
                        · {new Date(i.startTime).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={submitting || (choice === "reassign" && !reassignToUserId)}
                className="bg-red-600 hover:bg-red-700"
              >
                {submitting ? "Deactivating…" : "Deactivate"}
              </Button>
            </div>
          </div>
        )}

        {!loading && error && !impact && (
          <div className="space-y-3">
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
