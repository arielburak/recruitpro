"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { monthlyTotalCents } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  User,
  MoreVertical,
  Mail,
  Clock,
  Send,
  XCircle,
  UserPlus,
  ArrowRight,
} from "lucide-react";
import { DeactivateUserDialog } from "@/components/settings/deactivate-user-dialog";
import { ConfirmAddSeatDialog } from "@/components/billing/confirm-add-seat-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Deactivate dialog state: target user + open flag. El dialog
  // hace su propio fetch del impact al abrirse.
  const [deactivateTarget, setDeactivateTarget] = useState<
    { id: string; name: string } | null
  >(null);

  // Estado del billing — necesario para decidir si mostrar el
  // confirm-add-seat dialog al invitar Y para renderizar la strip
  // "Purchased | Assigned | Available" al inicio (estilo LinkedIn
  // Recruiter). Por eso tambien guardamos activeUsersCount.
  const [subscription, setSubscription] = useState<{
    status?: string;
    isComp?: boolean;
    seats?: number;
    activeUsersCount?: number;
  } | null>(null);

  // Confirm-add-seat dialog state. Cuando admin clickea "Send
  // invite" Y la org está ACTIVE, no submiteamos directo — guardamos
  // los form values y mostramos el dialog. Si confirma, ahí
  // disparamos el POST. Si cancela, cerramos el dialog sin enviar.
  const [pendingInvite, setPendingInvite] = useState<{
    name: string;
    email: string;
    role: string;
  } | null>(null);

  // Reactivate dialog state — mismo patrón que pendingInvite pero
  // para reactivar un user deactivated. Antes era PATCH directo sin
  // confirm — el seat se sumaba al billing silencioso. Feedback de
  // Nicolás 2026-06-22: 'no puede reactivar y sumar un seat sin
  // avisarme y sin llevarme a Stripe'. Ahora abre el ConfirmAddSeat
  // Dialog en modo reactivate.
  const [pendingReactivate, setPendingReactivate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);

  // Pool seat model 2026-06-22: si el backend devuelve 402 con
  // seat_pool_full (no hay seats disponibles para el invite),
  // guardamos el mensaje + mostramos banner con CTA "Buy seats"
  // que linka a /settings/billing en lugar del toast genérico.
  const [poolFullError, setPoolFullError] = useState<string | null>(null);

  // Destructive confirms (audit 2026-06-23): cancel invite + role
  // change abren dialog en vez de click único silencioso.
  const [cancelInviteTarget, setCancelInviteTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    id: string;
    name: string;
    newRole: "ADMIN" | "USER";
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [usersRes, invitesRes, subRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/invites"),
      fetch("/api/admin/subscription"),
    ]);
    const usersData = await usersRes.json();
    const invitesData = await invitesRes.json();
    const subData = await subRes.json().catch(() => null);
    setUsers(Array.isArray(usersData) ? usersData : []);
    setInvites(Array.isArray(invitesData) ? invitesData : []);
    setSubscription(subData);
    setLoading(false);
  }

  function sendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const fd = new FormData(e.currentTarget);
    const inviteData = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      role: String(fd.get("role") || "USER"),
    };

    // Decisión 2026-06-22: mostrar el dialog también en TRIAL para
    // setear expectativas del cobro post-trial. Solo COMP skipea el
    // dialog (no aplica billing). El dialog adapta su copy según
    // status (ACTIVE → prorate now / TRIALING → kicks in after trial).
    if (!subscription?.isComp) {
      setPendingInvite(inviteData);
      return;
    }

    void submitInvite(inviteData);
  }

  // Submit real al endpoint. Llamado por sendInvite directo (trial /
  // comp) o por el confirm del seat dialog (ACTIVE paying).
  async function submitInvite(inviteData: {
    name: string;
    email: string;
    role: string;
  }) {
    setInviteLoading(true);
    setError("");
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteData),
    });

    if (!res.ok) {
      const body = await res.json();
      // Pool full → banner especial con CTA Buy seats. El error
      // tradicional (red toast) lo dejamos para el resto de los casos.
      if (body?.code === "seat_pool_full") {
        setPoolFullError(body.error || "All seats are in use.");
        setShowInvite(false);
        setPendingInvite(null);
      } else {
        setError(body.error || "Failed to send invite");
      }
      setInviteLoading(false);
      return;
    }

    setShowInvite(false);
    setPendingInvite(null);
    setInviteLoading(false);
    setSuccess("Invitation sent!");
    setTimeout(() => setSuccess(""), 3000);
    fetchData();
  }

  async function toggleUserActive(
    userId: string,
    currentlyActive: boolean,
    userName: string,
  ) {
    // Deactivate (currentlyActive=true): abrir el dialog con resumen
    // de impacto + opciones para interviews futuras. El click NO toca
    // nada hasta que el admin confirme. Sin esto, un click silencioso
    // dejaba interviews zombie sin nadie atrás.
    if (currentlyActive) {
      setDeactivateTarget({ id: userId, name: userName });
      return;
    }
    // Reactivate (currentlyActive=false): NO submitamos directo. Sumar
    // un seat sin avisar al admin es lo que rompe la confianza —
    // abrimos el ConfirmAddSeatDialog en modo reactivate para mostrar
    // el impacto en billing + opción de cambiar payment method antes.
    if (subscription?.isComp) {
      // COMP: no aplica billing, reactivar directo sin fricción.
      void doReactivate(userId, userName);
      return;
    }
    setPendingReactivate({ id: userId, name: userName });
  }

  // Hace el PATCH real para reactivar. Llamado por toggleUserActive
  // (comp / no-billing path) o por el confirm del dialog (paying path).
  async function doReactivate(userId: string, userName: string) {
    setReactivateLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive: true }),
      });
      if (res.ok) {
        setSuccess(`${userName} reactivated`);
        setTimeout(() => setSuccess(""), 3000);
        fetchData();
      } else {
        const body = await res.json();
        setError(body.error || "Failed to update user");
        setTimeout(() => setError(""), 3000);
      }
    } finally {
      setReactivateLoading(false);
      setPendingReactivate(null);
    }
  }

  async function changeUserRole(userId: string, newRole: "ADMIN" | "USER") {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    if (res.ok) {
      setSuccess(newRole === "ADMIN" ? "User promoted to admin" : "Admin demoted to user");
      setTimeout(() => setSuccess(""), 3000);
      fetchData();
    } else {
      const body = await res.json();
      setError(body.error || "Failed to change role");
      setTimeout(() => setError(""), 3000);
    }
  }

  // "Remove permanently" fue removido del UI a propósito en MVP. La
  // distancia entre "Deactivate" (soft, preservaba historial) y
  // "Remove permanently" (hard-delete con cascada que se llevaba
  // JobAssignments, submissions, comments, interviews) era invisible
  // en el dropdown — un click de más mataba el trabajo de un recruiter
  // entero. Para MVP usamos solo Deactivate; si algún día necesitamos
  // hard-delete genuino (GDPR right-to-be-forgotten, por ejemplo) lo
  // ponemos detrás de un flow específico con doble confirmación + lista
  // explícita de qué se va a borrar. El endpoint /api/admin/users DELETE
  // sigue disponible vía API direct para esos casos puntuales.

  async function cancelInvite(inviteId: string) {
    const res = await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    if (res.ok) {
      fetchData();
    }
  }

  async function resendInvite(email: string, role: string, inviteId: string, name?: string) {
    // Resend dedicado — re-envía el mail sin borrar / recrear el invite.
    // Endpoint abierto a cualquier org member (decisión 2026-06-17).
    // Mantenemos los args (email/role/name) sin uso para no romper el
    // call site existente.
    void email; void role; void name;
    const res = await fetch(`/api/admin/invites/${inviteId}/resend`, {
      method: "POST",
    });

    if (res.ok) {
      setSuccess("Invite resent!");
      setTimeout(() => setSuccess(""), 3000);
      fetchData();
    }
  }

  const activeUsers = users.filter((u) => u.isActive);

  // Trial 7d permite invitar libre — el admin arma su equipo durante
  // el trial. Al subscribirse decide cuántos seats comprar (puede ser
  // menor que el count activo y los extra quedan deactivated).
  // Decisión 2026-06-22 con Nicolás (pivote final).
  const isTrialLimited = false;

  // Licenses strip — patrón LinkedIn Recruiter: tripleta Purchased |
  // Assigned | Available al inicio de la pagina. En TRIAL no aplica
  // "Purchased" (no hay sub paga), asi que solo muestra "Assigned".
  const pool = subscription?.seats ?? 1;
  const inUse = activeUsers.length;
  const available = Math.max(0, pool - inUse);
  const isTrial = subscription?.status === "TRIALING";
  const isCompPlan = subscription?.isComp;
  const showLicensesStrip = !isCompPlan;

  return (
    <div className="space-y-6">
      {/* Licenses strip estilo LinkedIn Recruiter. En TRIAL muestra
          solo Assigned + "Unlimited during trial"; en ACTIVE/CANCELED/
          etc muestra Purchased | Assigned | Available. */}
      {showLicensesStrip && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-6">
              {isTrial ? (
                <>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{inUse}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                      Assigned
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                    Unlimited during trial
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{pool}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                      Purchased
                    </p>
                  </div>
                  <div className="h-8 w-px bg-gray-200" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{inUse}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                      Assigned
                    </p>
                  </div>
                  <div className="h-8 w-px bg-gray-200" />
                  <div>
                    <p className={`text-2xl font-bold ${available === 0 ? "text-amber-600" : "text-gray-900"}`}>
                      {available}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">
                      Available
                    </p>
                  </div>
                </>
              )}
            </div>
            <a
              href="/settings/billing"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
            >
              Manage seats →
            </a>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeUsers.length} active user
          {activeUsers.length !== 1 ? "s" : ""}
          {subscription?.status === "ACTIVE" && !subscription?.isComp && (
            <>
              {" "}
              &middot; ${(monthlyTotalCents(pool) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo
            </>
          )}
        </p>
        <Button onClick={() => setShowInvite(true)}>
          <Mail className="mr-2 h-4 w-4" /> Invite Team Member
        </Button>
      </div>

      {/* Notifications */}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}
      {poolFullError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Mail className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              All seats are in use
            </p>
            <p className="text-sm text-amber-800 mt-1">{poolFullError}</p>
            <div className="mt-3 flex items-center gap-3">
              <a
                href="/settings/billing"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md transition-colors"
              >
                Buy more seats →
              </a>
              <button
                type="button"
                onClick={() => setPoolFullError(null)}
                className="text-xs text-amber-700 hover:text-amber-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={sendInvite} className="space-y-4">
            <p className="text-sm text-gray-500">
              An email invitation will be sent. They can create their own
              account using the link.
            </p>
            {/* Solo ADMIN puede elegir role al invitar; para USER el form
                tiene un campo name a full width y se envia role=USER fijo. */}
            {isAdmin ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    name="name"
                    type="text"
                    placeholder="e.g. María López"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <select
                    name="role"
                    className="w-full border rounded-md px-3 py-2 text-sm h-9"
                    defaultValue="USER"
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  name="name"
                  type="text"
                  placeholder="e.g. María López"
                  required
                />
                <input type="hidden" name="role" value="USER" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                name="email"
                type="email"
                placeholder="colleague@company.com"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={inviteLoading}
            >
              {inviteLoading ? "Sending..." : "Send Invitation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Loading state */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* CTA persistente de growth. Vive arriba de la lista para que
              cada vez que el usuario abre My Team vea el incentivo de
              sumar mas gente. El boton dispara el mismo dialog que el
              boton del header — no duplicamos UI, solo damos otro punto
              de entrada visualmente destacado. */}
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 p-5">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-violet-100 rounded-xl shrink-0">
                <UserPlus className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-violet-900">
                  {users.length === 1
                    ? "Add another seat — your team gets stronger with each search you split."
                    : "Keep growing your team."}
                </p>
                <p className="text-sm text-violet-800/80 mt-0.5">
                  Anyone you add joins this workspace and starts seeing the searches you assign them to.
                  More hands means more candidates moving and faster placements.
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <Button
                    onClick={() => setShowInvite(true)}
                    size="sm"
                    className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                  >
                    Invite teammates
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <span className="text-[11px] font-medium text-violet-700/70">
                    {activeUsers.length} active member{activeUsers.length === 1 ? "" : "s"}
                    {invites.length > 0 ? ` · ${invites.length} pending` : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Users — tabla estilo LinkedIn Recruiter. Cabeceras:
              Member | Role | Seat access | Actions.
              Cambiamos "License type/status" por "Role" y "Seat access"
              para que sea más directo: el header dice exactamente lo que
              importa al admin — quién tiene seat (= acceso al ATS) vs
              quién no. Decisión Nicolás 2026-06-25. */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
              <div className="col-span-5">Member</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-1 text-right" />
            </div>
            {/* Rows */}
            {users.map((u) => {
              const activatedAt = u.createdAt
                ? new Date(u.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null;
              return (
                <div
                  key={u.id}
                  className={`grid grid-cols-12 gap-4 px-4 py-3 items-center border-b border-gray-100 last:border-b-0 ${
                    !u.isActive ? "opacity-60" : ""
                  }`}
                >
                  {/* User details */}
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {u.name
                        ?.split(" ")
                        .map((w: string) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                      {u.role === "ADMIN" && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center ring-2 ring-white"
                          title="Admin"
                        >
                          <Shield className="h-2.5 w-2.5 text-indigo-600" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {u.name}
                      </p>
                      {u.title && (
                        <p className="text-xs text-gray-500 truncate">{u.title}</p>
                      )}
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* License type */}
                  <div className="col-span-3">
                    <Badge
                      variant={u.role === "ADMIN" ? "default" : "secondary"}
                    >
                      {u.role === "ADMIN" ? "Admin" : "User"}
                    </Badge>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {u._count.candidates}{" "}
                      {u._count.candidates === 1 ? "candidate" : "candidates"}
                    </p>
                  </div>

                  {/* Seat access — el badge dice claramente si el user
                      tiene acceso al ATS (= tiene seat asignado) o no.
                      "Has seat" / "No seat" en lugar de "Active /
                      Deactivated" porque el admin piensa en términos
                      de seats, no de license-status. */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          u.isActive ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          u.isActive ? "text-emerald-700" : "text-gray-400"
                        }`}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {activatedAt && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {u.isActive ? "Since" : "Joined"} {activatedAt}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            toggleUserActive(u.id, u.isActive, u.name)
                          }
                          disabled={u.id === (session?.user as any)?.id}
                          title={
                            u.id === (session?.user as any)?.id
                              ? "You can't remove your own seat"
                              : u.isActive
                                ? "Click to deactivate (frees seat)"
                                : "Click to reactivate (uses 1 seat)"
                          }
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            u.isActive ? "bg-emerald-600" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                              u.isActive ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.role === "USER" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleChangeTarget({
                                    id: u.id,
                                    name: u.name,
                                    newRole: "ADMIN",
                                  })
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Promote to Admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleChangeTarget({
                                    id: u.id,
                                    name: u.name,
                                    newRole: "USER",
                                  })
                                }
                              >
                                <User className="mr-2 h-4 w-4" />
                                Demote to User
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending Invites */}
          {invites.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending Invitations
              </h2>
              <div className="space-y-2">
                {invites.map((inv) => (
                  <Card key={inv.id} className="border-dashed">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                          <Mail className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          {inv.name ? (
                            <>
                              <p className="font-medium text-gray-700">{inv.name}</p>
                              <p className="text-xs text-gray-500">{inv.email}</p>
                            </>
                          ) : (
                            <p className="font-medium text-gray-600">{inv.email}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Invited{" "}
                            {new Date(inv.createdAt).toLocaleDateString()}{" "}
                            &middot; Expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{inv.role === "ADMIN" ? "Admin" : "User"}</Badge>
                        {/* Resend abierto a cualquier org member — no es
                            destructivo. Cancel sigue ADMIN-only porque
                            revoca el invite. */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            resendInvite(inv.email, inv.role, inv.id, inv.name)
                          }
                          title="Resend invite"
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Resend
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCancelInviteTarget({
                                id: inv.id,
                                email: inv.email,
                              })
                            }
                            title="Cancel invite"
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Deactivation flow: en lugar de toggle silencioso, abrimos el
          dialog que muestra qué tiene el user en la cancha (assignments,
          owned candidates, active submissions, upcoming interviews) y
          pide qué hacer con las reuniones futuras antes de confirmar. */}
      <DeactivateUserDialog
        userId={deactivateTarget?.id ?? null}
        userName={deactivateTarget?.name ?? ""}
        open={!!deactivateTarget}
        currentSeats={activeUsers.length}
        subscriptionStatus={subscription?.status}
        isComp={!!subscription?.isComp}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onDeactivated={(summary) => {
          const suffix =
            summary.interviewsHandled > 0
              ? ` (${summary.interviewsHandled} interview${
                  summary.interviewsHandled === 1 ? "" : "s"
                } ${summary.choice === "cancel" ? "cancelled" : "reassigned"})`
              : "";
          setSuccess(`${deactivateTarget?.name ?? "User"} deactivated${suffix}`);
          setTimeout(() => setSuccess(""), 3500);
          fetchData();
        }}
      />

      {/* Confirm seat dialog — modo invite (pool model 2026-06-22).
          Muestra usage del pool sin billing impact. Si pool full,
          el dialog cambia el CTA a "Buy more seats" → /settings/billing. */}
      <ConfirmAddSeatDialog
        open={!!pendingInvite}
        onOpenChange={(open) => {
          if (!open) setPendingInvite(null);
        }}
        currentSeats={subscription?.seats ?? 1}
        activeUsers={activeUsers.length}
        status={subscription?.status || "TRIALING"}
        isComp={!!subscription?.isComp}
        teammateName={pendingInvite?.name || undefined}
        mode="invite"
        loading={inviteLoading}
        onConfirm={() => {
          if (pendingInvite) {
            void submitInvite(pendingInvite);
          }
        }}
      />

      {/* Confirm seat dialog — modo reactivate. Aparece cuando el
          admin reactiva un user deactivated. Antes era un click
          silencioso que sumaba seat sin avisar. Fix 2026-06-22. */}
      <ConfirmAddSeatDialog
        open={!!pendingReactivate}
        onOpenChange={(open) => {
          if (!open) setPendingReactivate(null);
        }}
        currentSeats={subscription?.seats ?? 1}
        activeUsers={activeUsers.length}
        status={subscription?.status || "TRIALING"}
        isComp={!!subscription?.isComp}
        teammateName={pendingReactivate?.name || undefined}
        mode="reactivate"
        loading={reactivateLoading}
        onConfirm={() => {
          if (pendingReactivate) {
            void doReactivate(pendingReactivate.id, pendingReactivate.name);
          }
        }}
      />

      {/* Cancel invite confirm — antes era click único silencioso.
          Revoke afecta a un mail real que ya salió; merece un freno
          consciente. Audit 2026-06-23. */}
      <DeleteConfirmDialog
        open={!!cancelInviteTarget}
        onOpenChange={(open) => {
          if (!open) setCancelInviteTarget(null);
        }}
        itemLabel={cancelInviteTarget?.email || "invite"}
        title="Cancel this invitation?"
        description={
          cancelInviteTarget
            ? `The invite for ${cancelInviteTarget.email} will be revoked. They won't be able to use the original link anymore — you'll need to send a new invite if you change your mind.`
            : "The invite will be revoked."
        }
        confirmLabel="Yes, cancel invite"
        onConfirm={async () => {
          if (cancelInviteTarget) {
            await cancelInvite(cancelInviteTarget.id);
            setCancelInviteTarget(null);
          }
        }}
      />

      {/* Role change confirm — single click cambiaba permisos
          de un user sin freno. Promote/Demote tienen impacto real
          (acceso a billing, deletes, etc.). Audit 2026-06-23. */}
      <DeleteConfirmDialog
        open={!!roleChangeTarget}
        onOpenChange={(open) => {
          if (!open) setRoleChangeTarget(null);
        }}
        itemLabel={roleChangeTarget?.name || ""}
        title={
          roleChangeTarget?.newRole === "ADMIN"
            ? `Promote ${roleChangeTarget?.name} to admin?`
            : `Demote ${roleChangeTarget?.name} to user?`
        }
        description={
          roleChangeTarget?.newRole === "ADMIN"
            ? "Admins can manage billing, invite and remove teammates, change roles, and access every job in the workspace."
            : "They'll lose admin powers (billing, member management, full job access). Their job assignments stay intact."
        }
        confirmLabel={
          roleChangeTarget?.newRole === "ADMIN"
            ? "Yes, promote"
            : "Yes, demote"
        }
        onConfirm={async () => {
          if (roleChangeTarget) {
            await changeUserRole(roleChangeTarget.id, roleChangeTarget.newRole);
            setRoleChangeTarget(null);
          }
        }}
      />
    </div>
  );
}
