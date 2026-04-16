"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { User, Building2, Users, Shield, KeyRound, Check, AlertCircle, Mail, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function StaffingProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Profile form
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
      }
    } catch {}
    setLoading(false);
  }

  async function fetchTeam() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(Array.isArray(data) ? data : data.users || []);
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
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProfileStatus({ type: "success", message: "Profile updated" });
        fetchProfile();
      } else {
        const data = await res.json();
        setProfileStatus({ type: "error", message: data.error || "Failed to update" });
      }
    } catch {
      setProfileStatus({ type: "error", message: "Something went wrong" });
    }
    setSavingProfile(false);
  }

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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <User className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile & Account</h1>
          <p className="text-gray-500 text-sm">Manage your personal info and account settings</p>
        </div>
      </div>

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
                  <Label>Email</Label>
                  <Input value={profile?.email || ""} disabled className="bg-gray-50" />
                  <p className="text-xs text-gray-400">Contact your admin to change your email</p>
                </div>
                <div className="flex items-center justify-between pt-2">
                  {profileStatus && (
                    <p className={`text-xs flex items-center gap-1 ${profileStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                      {profileStatus.type === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {profileStatus.message}
                    </p>
                  )}
                  <Button type="submit" disabled={savingProfile} className="ml-auto">
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-500" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
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
                <div className="flex items-center justify-between pt-2">
                  {passwordStatus && (
                    <p className={`text-xs flex items-center gap-1 ${passwordStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                      {passwordStatus.type === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {passwordStatus.message}
                    </p>
                  )}
                  <Button type="submit" disabled={savingPassword} className="ml-auto">
                    {savingPassword ? "Changing..." : "Change Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Account Info */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-full flex items-center justify-center font-bold">
                  {profile?.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{profile?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="h-3.5 w-3.5 text-gray-400" />
                  <span>Role: <Badge variant="secondary" className="text-[10px]">{profile?.role}</Badge></span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Building2 className="h-3.5 w-3.5 text-gray-400" />
                  <span className="truncate">{profile?.organizationName}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <span>Joined {profile?.createdAt ? formatDate(profile.createdAt) : "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                Your Team
              </CardTitle>
              {(profile?.role === "ADMIN" || profile?.role === "PARTNER") && (
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
                        <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                      </div>
                      {m.role && <Badge variant="secondary" className="text-[9px] shrink-0">{m.role}</Badge>}
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
