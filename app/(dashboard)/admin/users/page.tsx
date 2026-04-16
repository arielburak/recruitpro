"use client";

import { useEffect, useState } from "react";
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
  Plus,
  Shield,
  User,
  MoreVertical,
  Mail,
  Clock,
  UserMinus,
  Trash2,
  Send,
  XCircle,
} from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [usersRes, invitesRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/invites"),
    ]);
    const usersData = await usersRes.json();
    const invitesData = await invitesRes.json();
    setUsers(Array.isArray(usersData) ? usersData : []);
    setInvites(Array.isArray(invitesData) ? invitesData : []);
    setLoading(false);
  }

  async function sendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        email: fd.get("email"),
        role: fd.get("role"),
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to send invite");
      setInviteLoading(false);
      return;
    }

    setShowInvite(false);
    setInviteLoading(false);
    setSuccess("Invitation sent!");
    setTimeout(() => setSuccess(""), 3000);
    fetchData();
  }

  async function toggleUserActive(userId: string, currentlyActive: boolean) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: !currentlyActive }),
    });
    if (res.ok) {
      fetchData();
    } else {
      const body = await res.json();
      setError(body.error || "Failed to update user");
      setTimeout(() => setError(""), 3000);
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

  async function removeUser(userId: string, userName: string) {
    if (
      !confirm(
        `Are you sure you want to permanently remove ${userName}? This cannot be undone.`
      )
    )
      return;

    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      setSuccess("User removed");
      setTimeout(() => setSuccess(""), 3000);
      fetchData();
    } else {
      const body = await res.json();
      setError(body.error || "Failed to remove user");
      setTimeout(() => setError(""), 3000);
    }
  }

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
    // Cancel old invite and send a new one
    await fetch("/api/admin/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });

    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, name }),
    });

    if (res.ok) {
      setSuccess("Invite resent!");
      setTimeout(() => setSuccess(""), 3000);
      fetchData();
    }
  }

  const activeUsers = users.filter((u) => u.isActive);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-gray-500">
            {activeUsers.length} active user
            {activeUsers.length !== 1 ? "s" : ""} &middot; $
            {activeUsers.length * 10}/mo
          </p>
        </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  name="name"
                  type="text"
                  placeholder="John Smith"
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
          {/* Active Users */}
          <div className="space-y-2">
            {users.map((u) => (
              <Card
                key={u.id}
                className={!u.isActive ? "opacity-60" : ""}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      {u.role === "ADMIN" ? (
                        <Shield className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <User className="h-5 w-5 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {u.name}
                        {!u.isActive && (
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            (deactivated)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        u.role === "ADMIN" ? "default" : "secondary"
                      }
                    >
                      {u.role === "ADMIN" ? "Admin" : "User"}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {u._count.candidates} candidates
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {u.role === "USER" ? (
                          <DropdownMenuItem
                            onClick={() => changeUserRole(u.id, "ADMIN")}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Promote to Admin
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => changeUserRole(u.id, "USER")}
                          >
                            <User className="mr-2 h-4 w-4" />
                            Demote to User
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            toggleUserActive(u.id, u.isActive)
                          }
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => removeUser(u.id, u.name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            resendInvite(inv.email, inv.role, inv.id, inv.name)
                          }
                          title="Resend invite"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelInvite(inv.id)}
                          title="Cancel invite"
                        >
                          <XCircle className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
