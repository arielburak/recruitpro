"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LogoUploader } from "@/components/logo-uploader";
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
  Shield,
  ShieldOff,
  Lock,
  Send,
  UserCheck,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { showToast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm-dialog";

type SettingsTab = "profile" | "organization";

export default function ClientPortalSettingsPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

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
  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN">("USER");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [contactMatch, setContactMatch] = useState<{ name: string; title: string | null; email: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

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

  // When the recruiter types an email into the invite form, debounce
  // and check whether that email already exists as a Contact on the
  // agency side. If so, we pre-fill name/title so they don't retype.
  useEffect(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setContactMatch(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/client-portal/contact-lookup?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.match) {
          setContactMatch(null);
          return;
        }
        setContactMatch(data.match);
        // Only auto-fill empty fields — don't clobber what the user already typed.
        setInviteName((prev) => (prev.trim() ? prev : data.match.name));
        setInviteTitle((prev) => (prev.trim() ? prev : data.match.title || ""));
      } catch {}
    }, 400);
    return () => clearTimeout(handle);
  }, [inviteEmail]);

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
          role: inviteRole,
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
        setInviteRole("USER");
        setContactMatch(null);
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
    const ok = await confirmDialog({
      title: "Remove team member?",
      description: "This cannot be undone.",
      confirmLabel: "Yes, remove",
    });
    if (!ok) return;
    const res = await fetch(`/api/client-portal/team/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to remove");
    }
    setMemberMenu(null);
    fetchTeam();
  }

  async function cancelInvite(memberId: string, email: string) {
    const ok = await confirmDialog({
      title: `Cancel invite for ${email}?`,
      description: "They won't be able to use any previously sent link.",
      confirmLabel: "Yes, cancel",
    });
    if (!ok) return;
    const res = await fetch(`/api/client-portal/team/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to cancel invite");
    }
    setMemberMenu(null);
    fetchTeam();
  }

  async function resendInvite(memberId: string) {
    setResendingId(memberId);
    try {
      const res = await fetch(`/api/client-portal/team/${memberId}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to resend invite");
      } else {
        showToast(data.emailSent ? "Invite resent." : "Invite link refreshed (email delivery failed — copy the link manually).");
      }
    } catch {
      showToast("Something went wrong");
    }
    setResendingId(null);
    setMemberMenu(null);
  }

  async function changeMemberRole(memberId: string, newRole: "ADMIN" | "USER") {
    const res = await fetch(`/api/client-portal/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to change role");
    }
    setMemberMenu(null);
    fetchTeam();
  }

  const isAdmin = profile?.role === "ADMIN";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "organization", label: "Organization", icon: Building2, adminOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your profile, your team and your company in one place.
        </p>
      </div>

      {/* Tabs bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Settings tabs">
          {visibleTabs.map((t) => {
            const active = activeTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`group inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                  active
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* ========== PROFILE TAB ========== */}
          {activeTab === "profile" && (
          <>
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
                  <Label>Permission</Label>
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-gray-50">
                    {profile?.role === "ADMIN" ? (
                      <>
                        <Shield className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-sm font-medium text-gray-700">Admin</span>
                        <span className="text-xs text-gray-400">· Can manage team</span>
                      </>
                    ) : (
                      <>
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">User</span>
                        <span className="text-xs text-gray-400">· Contact an admin to change</span>
                      </>
                    )}
                  </div>
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
          </>
          )}
          {/* ========== END PROFILE TAB ========== */}

          {/* ========== ORGANIZATION TAB ========== */}
          {activeTab === "organization" && (
          <LogoUploader
            endpoint="/api/client-portal/logo"
            isAdmin={isAdmin}
            label="Company Logo"
            helperText="Optional. Shown next to your company name in the portal header. PNG, JPG, WEBP or SVG, max 2 MB."
            accentColor="emerald"
          />
          )}

        </div>

        {/* Right Sidebar — only on Profile tab */}
        {activeTab === "profile" && (
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
                      {profile?.role && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Shield className="h-3.5 w-3.5 text-gray-400" />
                          <Badge variant={profile.role === "ADMIN" ? "default" : "secondary"} className="text-[10px]">
                            {profile.role === "ADMIN" ? "Admin" : "User"}
                          </Badge>
                        </div>
                      )}
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
        )}
      </div>
    </div>
  );
}
