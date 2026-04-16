"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Building2,
  Users,
  Mail,
  KeyRound,
  Check,
  AlertCircle,
  Calendar,
  UserPlus,
  Copy,
  X,
  MoreHorizontal,
  CheckCircle,
  UserX,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function ClientPortalSettingsPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Password form
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function cancelPasswordChange() {
    setShowPasswordForm(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordStatus(null);
  }

  // Team management
  const [team, setTeam] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
    fetchTeam();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setName(data.name || "");
        setTitle(data.title || "");
      }
    } catch {}
    setLoading(false);
  }

  async function fetchTeam() {
    try {
      const res = await fetch("/api/client-portal/team");
      if (res.ok) setTeam(await res.json());
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
        // Update local state immediately for snappy UX
        setProfile((prev: any) => ({ ...(prev || {}), ...updated }));
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

  // Enable save when name is present (title is optional)
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

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/client-portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          title: inviteTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteResult({ type: "error", message: data.error || "Failed to invite" });
      } else {
        setInviteResult({
          type: "success",
          message: data.reactivated ? "Team member reactivated!" : "Invitation created!",
          link: data.inviteLink,
        });
        setInviteName("");
        setInviteTitle("");
        setInviteEmail("");
        fetchTeam();
      }
    } catch {
      setInviteResult({ type: "error", message: "Something went wrong" });
    }
    setInviting(false);
  }

  async function toggleMember(memberId: string, isActive: boolean) {
    await fetch(`/api/client-portal/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setMemberMenu(null);
    fetchTeam();
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this team member? This cannot be undone.")) return;
    await fetch(`/api/client-portal/team/${memberId}`, { method: "DELETE" });
    setMemberMenu(null);
    fetchTeam();
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <User className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile & Settings</h1>
          <p className="text-gray-500 text-sm">Manage your account and team</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-500" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. VP of Engineering" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || (session?.user as any)?.email || ""} disabled className="bg-gray-50" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  {profileStatus && (
                    <p className={`text-xs flex items-center gap-1 ${profileStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                      {profileStatus.type === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {profileStatus.message}
                    </p>
                  )}
                  <Button type="submit" disabled={!canSave} className="ml-auto bg-emerald-600 hover:bg-emerald-700">
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
                <KeyRound className="h-4 w-4 text-emerald-500" />
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
                      <Button type="submit" disabled={savingPassword} className="bg-emerald-600 hover:bg-emerald-700">
                        {savingPassword ? "Changing..." : "Save New Password"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-500" />
                Team Members
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {showInvite && (
                <div className="mb-4 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                  <form onSubmit={inviteMember} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="John Smith" className="text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Job Title</Label>
                        <Input value={inviteTitle} onChange={(e) => setInviteTitle(e.target.value)} placeholder="Hiring Manager" className="text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email *</Label>
                      <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="john@company.com" className="text-sm" required />
                    </div>
                    <Button type="submit" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5" disabled={inviting}>
                      <Mail className="h-3.5 w-3.5" />
                      {inviting ? "Sending..." : "Send Invitation"}
                    </Button>
                  </form>
                  {inviteResult && (
                    <div className={`mt-3 text-xs p-2.5 rounded-lg ${inviteResult.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      <p>{inviteResult.message}</p>
                      {inviteResult.link && (
                        <div className="mt-2 flex items-center gap-2">
                          <input readOnly value={inviteResult.link} className="flex-1 bg-white border rounded px-2 py-1 text-[11px] text-gray-600 truncate" />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(inviteResult.link!);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }}
                            className="shrink-0 p-1 rounded hover:bg-green-100"
                          >
                            {copiedLink ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {team.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No team members yet. Click &quot;Add Member&quot; to invite colleagues.
                </p>
              ) : (
                <div className="space-y-2">
                  {team.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                        {member.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                        {member.title && <p className="text-[11px] text-gray-500 truncate">{member.title}</p>}
                        <p className="text-xs text-gray-400 truncate">{member.email}</p>
                      </div>
                      {!member.isActive && <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-500">Inactive</Badge>}
                      <div className="relative">
                        <button
                          onClick={() => setMemberMenu(memberMenu === member.id ? null : member.id)}
                          className="p-1 rounded hover:bg-gray-200"
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-400" />
                        </button>
                        {memberMenu === member.id && (
                          <div className="absolute right-0 top-8 z-10 bg-white border rounded-lg shadow-lg py-1 w-40">
                            {member.isActive ? (
                              <button
                                onClick={() => toggleMember(member.id, false)}
                                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <UserX className="h-3.5 w-3.5" /> Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => toggleMember(member.id, true)}
                                className="w-full text-left px-3 py-1.5 text-sm text-emerald-600 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <CheckCircle className="h-3.5 w-3.5" /> Reactivate
                              </button>
                            )}
                            <button
                              onClick={() => removeMember(member.id)}
                              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <X className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                const displayCompany = profile?.companyName || (session?.user as any)?.clientName || "";
                const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <>
                    <div className="flex items-center gap-3 pb-3 border-b">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center font-bold">
                        {initials || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{displayName || "—"}</p>
                        {displayTitle && <p className="text-[11px] text-gray-500 truncate">{displayTitle}</p>}
                        <p className="text-xs text-gray-400 truncate">{displayEmail}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs">
                      {displayCompany && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          <span className="truncate">{displayCompany}</span>
                        </div>
                      )}
                      {profile?.industry && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Badge variant="secondary" className="text-[10px]">{profile.industry}</Badge>
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
        </div>
      </div>
    </div>
  );
}
