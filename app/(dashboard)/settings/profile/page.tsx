"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { User, Building2, Users, Shield, KeyRound, Check, AlertCircle, Mail, Calendar, Plug, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export default function StaffingProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Profile form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Password form
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Google integration
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  async function fetchGoogleStatus() {
    try {
      const res = await fetch("/api/integrations/google/status");
      if (res.ok) setGoogleStatus(await res.json());
    } catch {}
  }

  async function disconnectGoogle() {
    const ok = await confirmDialog({
      title: "Disconnect Google?",
      description: "You'll need to reconnect to create Meet links.",
      confirmLabel: "Yes, disconnect",
    });
    if (!ok) return;
    setDisconnectingGoogle(true);
    try {
      await fetch("/api/integrations/google/status", { method: "DELETE" });
      await fetchGoogleStatus();
    } catch {}
    setDisconnectingGoogle(false);
  }

  function cancelPasswordChange() {
    setShowPasswordForm(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordStatus(null);
  }

  useEffect(() => {
    fetchProfile();
    fetchTeam();
    fetchGoogleStatus();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setName(data.name || "");
        setTitle(data.title || "");
        setRole(data.role || "");
      }
    } catch {}
    setLoading(false);
  }

  async function fetchTeam() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        const all = Array.isArray(data) ? data : data.users || [];
        // El endpoint devuelve users activos + deactivated (lo usa
        // tambien /settings/team para poder reactivar). Aca el card
        // "Your Team" solo debe mostrar los activos — un user
        // deactivado no es del equipo. Feedback Nicolas 2026-06-24.
        setTeamMembers(all.filter((u: { isActive?: boolean }) => u.isActive !== false));
      }
    } catch {}
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, title }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile((prev: any) => ({ ...(prev || {}), ...updated }));
        // Refresh the NextAuth session so sidebar and other consumers
        // of session.user.name / session.user.role update immediately.
        await updateSession({ name: updated.name, role: updated.role });
        setProfileStatus({ type: "success", message: "Profile updated" });
        setTimeout(() => setProfileStatus(null), 3000);
      } else {
        const data = await res.json();
        setProfileStatus({ type: "error", message: data.error || "Failed to update" });
      }
    } catch {
      setProfileStatus({ type: "error", message: "Something went wrong" });
    }
    setSavingProfile(false);
  }

  const canSave = name.trim().length > 0 && !savingProfile;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "Passwords do not match" });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordStatus({ type: "success", message: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setShowPasswordForm(false), 1500);
      } else {
        const data = await res.json();
        setPasswordStatus({ type: "error", message: data.error || "Failed to change password" });
      }
    } catch {
      setPasswordStatus({ type: "error", message: "Something went wrong" });
    }
    setSavingPassword(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Profile + Password */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-500" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Recruiter"
                  />
                  <p className="text-xs text-gray-400">Your role at the company (displayed under your name)</p>
                </div>
                <div className="space-y-2">
                  <Label>Permission</Label>
                  <Input
                    value={role === "ADMIN" ? "Admin" : "User"}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-400">
                    {role === "ADMIN"
                      ? "You can manage the team and billing. Only other admins can change your role."
                      : "Contact an admin to change your role."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || (session?.user as any)?.email || ""} disabled className="bg-gray-50" />
                  <p className="text-xs text-gray-400">Contact your admin to change your email</p>
                </div>
                <div className="flex items-center justify-between pt-2">
                  {profileStatus && (
                    <p className={`text-xs flex items-center gap-1 ${profileStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                      {profileStatus.type === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {profileStatus.message}
                    </p>
                  )}
                  <Button type="submit" disabled={!canSave} className="ml-auto">
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-500" />
                Password
              </CardTitle>
              {!showPasswordForm && (
                <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>
                  Change Password
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!showPasswordForm ? (
                <p className="text-sm text-gray-500">
                  Keep your account secure. Change your password regularly.
                </p>
              ) : (
                <form onSubmit={changePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>New Password</Label>
                      <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm New</Label>
                      <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 gap-2">
                    {passwordStatus && (
                      <p className={`text-xs flex items-center gap-1 ${passwordStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                        {passwordStatus.type === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {passwordStatus.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 ml-auto">
                      <Button type="button" variant="ghost" onClick={cancelPasswordChange} disabled={savingPassword}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={savingPassword}>
                        {savingPassword ? "Changing..." : "Save New Password"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Integrations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plug className="h-4 w-4 text-indigo-500" />
                Integrations
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Connect your own calendar and meeting tools. Each teammate connects their own accounts.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Google Calendar + Meet */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-white border flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="h-6 w-6">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm">Google Calendar + Meet</h3>
                        {googleStatus?.connected ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px]">Connected</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
                        )}
                      </div>
                      {googleStatus?.connected && googleStatus.email ? (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          <span className="text-gray-400">as</span> <strong className="text-gray-700">{googleStatus.email}</strong>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Auto-create Meet links and calendar events when scheduling interviews.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {googleStatus?.connected ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => { window.location.href = "/api/integrations/google/connect"; }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Switch account
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={disconnectGoogle}
                        disabled={disconnectingGoogle}
                      >
                        {disconnectingGoogle ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                      onClick={() => { window.location.href = "/api/integrations/google/connect"; }}
                    >
                      <Plug className="h-3.5 w-3.5" />
                      Connect Google
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Account Info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {(() => {
                const displayName = profile?.name || session?.user?.name || "";
                const displayEmail = profile?.email || (session?.user as any)?.email || "";
                const displayTitle = profile?.title;
                const displayRole = profile?.role || (session?.user as any)?.role;
                const displayOrg = profile?.organizationName || (session?.user as any)?.organizationName || "";
                const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <>
                    <div className="flex items-center gap-3 pb-3 border-b">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-full flex items-center justify-center font-bold">
                        {initials || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{displayName || "—"}</p>
                        {displayTitle && <p className="text-[11px] text-gray-500 truncate">{displayTitle}</p>}
                        <p className="text-xs text-gray-400 truncate">{displayEmail}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      {displayRole && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Shield className="h-3.5 w-3.5 text-gray-400" />
                          <span>Role: <Badge variant={displayRole === "ADMIN" ? "default" : "secondary"} className="text-[10px]">{displayRole === "ADMIN" ? "Admin" : "User"}</Badge></span>
                        </div>
                      )}
                      {displayOrg && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          <span className="truncate">{displayOrg}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>Joined {profile?.createdAt ? formatDate(profile.createdAt) : "—"}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                Your Team
              </CardTitle>
              {profile?.role === "ADMIN" && (
                <Link href="/admin/users">
                  <Button variant="ghost" size="sm" className="text-xs h-7">Manage</Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No team members</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.slice(0, 6).map((m: any) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                        {m.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 truncate">{m.name}</p>
                        {m.title && <p className="text-[10px] text-gray-500 truncate">{m.title}</p>}
                        <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                      </div>
                      {m.role && (
                        <Badge variant={m.role === "ADMIN" ? "default" : "secondary"} className="text-[9px] shrink-0">
                          {m.role === "ADMIN" ? "Admin" : "User"}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {teamMembers.length > 6 && (
                    <p className="text-[10px] text-gray-400 text-center pt-1">+{teamMembers.length - 6} more</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
