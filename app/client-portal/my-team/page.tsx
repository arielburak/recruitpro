"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Users2,
  UserPlus,
  Mail,
  Copy,
  Check,
  Send,
  Shield,
  ShieldOff,
  UserX,
  CheckCircle,
  X,
  UserCheck,
  MoreHorizontal,
} from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { showToast } from "@/components/ui/toast";

// Standalone page for the client team — surfaced as a first-class
// nav item ("My Team") rather than buried in /settings. The flow is
// open to any portal user (not only ADMINs); the server route applies
// a domain match against the inviter so this can't be used to bring
// strangers into the workspace.

type Member = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: "ADMIN" | "USER";
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
};

export default function MyTeamPage() {
  // Session for the client portal doesn't carry `role` on the token
  // (auth-options.ts clears it for ClientUser sessions) — we have to
  // pull it from /api/profile to know if the viewer is ADMIN. Without
  // this the kebab menu (promote / demote / remove) stays hidden even
  // for legitimate admins.
  const [profile, setProfile] = useState<{ role?: string } | null>(null);
  const isAdmin = profile?.role === "ADMIN";

  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN">("USER");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    type: "success" | "error";
    message: string;
    link?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [contactMatch, setContactMatch] = useState<{
    name: string;
    title: string | null;
    email: string;
  } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<{ id: string; name: string } | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState<{ id: string; email: string } | null>(null);

  async function fetchTeam() {
    try {
      const res = await fetch("/api/client-portal/team");
      if (res.ok) setTeam(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchTeam();
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProfile(data))
      .catch(() => setProfile(null));
  }, []);

  // Live contact lookup — pre-fill the form when the email matches a
  // Contact on the agency side, so the recruiter doesn't have to
  // re-type a name they already curated.
  useEffect(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setContactMatch(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/client-portal/contact-lookup?email=${encodeURIComponent(email)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.match) {
          setContactMatch(null);
          return;
        }
        setContactMatch(data.match);
        setInviteName((prev) => (prev.trim() ? prev : data.match.name));
        setInviteTitle((prev) => (prev.trim() ? prev : data.match.title || ""));
      } catch {}
    }, 400);
    return () => clearTimeout(handle);
  }, [inviteEmail]);

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
          message: data.reactivated ? "Team member reactivated." : "Invitation sent.",
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
    const res = await fetch(`/api/client-portal/team/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Failed to remove");
    }
    setMemberMenu(null);
    fetchTeam();
  }

  async function cancelInvite(memberId: string) {
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
      const res = await fetch(`/api/client-portal/team/${memberId}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to resend invite");
      } else {
        showToast(
          data.emailSent
            ? "Invite resent."
            : "Invite link refreshed (email delivery failed — copy the link manually)."
        );
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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Users2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Team</h1>
          <p className="text-sm text-gray-500">
            Everyone with access to your client portal workspace.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Team Members
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Members added here get portal access only — share specific jobs
              with them from each Job&apos;s access panel.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              setShowInvite(!showInvite);
              setInviteResult(null);
            }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Member
          </Button>
        </CardHeader>
        <CardContent>
          {showInvite && (
            <div className="mb-4 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
              {contactMatch && (
                <div className="mb-3 flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">
                      {contactMatch.name} is already a contact on file
                      {contactMatch.title ? ` (${contactMatch.title})` : ""}.
                    </p>
                    <p className="text-blue-700/80 mt-0.5">
                      We pre-filled their info. Submitting will give them portal
                      access too.
                    </p>
                  </div>
                </div>
              )}
              <form onSubmit={inviteMember} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. María López"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Job Title</Label>
                    <Input
                      value={inviteTitle}
                      onChange={(e) => setInviteTitle(e.target.value)}
                      placeholder="Hiring Manager"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="john@company.com"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Permission</Label>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as "USER" | "ADMIN")
                      }
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      title={
                        !isAdmin
                          ? "Only admins can grant the Admin role"
                          : undefined
                      }
                    >
                      <option value="USER">User</option>
                      {isAdmin && <option value="ADMIN">Admin</option>}
                    </select>
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  disabled={inviting}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
              {inviteResult && (
                <div
                  className={`mt-3 text-xs p-2.5 rounded-lg ${
                    inviteResult.type === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  <p>{inviteResult.message}</p>
                  {inviteResult.link && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteResult.link}
                        className="flex-1 bg-white border rounded px-2 py-1 text-[11px] text-gray-600 truncate"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteResult.link!);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }}
                        className="shrink-0 p-1 rounded hover:bg-green-100"
                      >
                        {copiedLink ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {team.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No team members yet. Click &quot;Add Member&quot; to invite a
              teammate at your email domain.
            </p>
          ) : (
            <div className="space-y-2">
              {team
                // Defensive: hide leftover dedup'd ClientUser rows so a
                // partial cleanup never leaks junk into the roster.
                .filter((member) => !member.email?.includes("+dedup-"))
                .map((member) => {
                  const isPending = member.isActive && member.hasPassword === false;
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                        {member.name
                          ?.split(" ")
                          .map((w: string) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {member.name}
                        </p>
                        {member.title && (
                          <p className="text-[11px] text-gray-500 truncate">
                            {member.title}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 truncate">
                          {member.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={member.role === "ADMIN" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {member.role === "ADMIN" ? "Admin" : "User"}
                        </Badge>
                        {isPending && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200"
                          >
                            Pending
                          </Badge>
                        )}
                        {!member.isActive && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-gray-100 text-gray-500"
                          >
                            Inactive
                          </Badge>
                        )}
                        {/* The kebab menu (promote, deactivate, remove) is
                            still admin-only — opening it up would let any
                            user demote or boot teammates, which is a sharper
                            edge than the invite-anyone path. */}
                        {isAdmin && (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setMemberMenu(memberMenu === member.id ? null : member.id)
                              }
                              className="p-1 rounded hover:bg-gray-200"
                            >
                              <MoreHorizontal className="h-4 w-4 text-gray-400" />
                            </button>
                            {memberMenu === member.id && (
                              <div className="absolute right-0 top-8 z-10 bg-white border rounded-lg shadow-lg py-1 w-44">
                                {isPending ? (
                                  <>
                                    <button
                                      onClick={() => resendInvite(member.id)}
                                      disabled={resendingId === member.id}
                                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                                    >
                                      <Send className="h-3.5 w-3.5" />{" "}
                                      {resendingId === member.id
                                        ? "Resending..."
                                        : "Resend invite"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setMemberMenu(null);
                                        setCancellingInvite({ id: member.id, email: member.email });
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <X className="h-3.5 w-3.5" /> Cancel invite
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {member.role === "USER" ? (
                                      <button
                                        onClick={() =>
                                          changeMemberRole(member.id, "ADMIN")
                                        }
                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                      >
                                        <Shield className="h-3.5 w-3.5" /> Promote
                                        to Admin
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          changeMemberRole(member.id, "USER")
                                        }
                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                      >
                                        <ShieldOff className="h-3.5 w-3.5" /> Demote
                                        to User
                                      </button>
                                    )}
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
                                        <CheckCircle className="h-3.5 w-3.5" />{" "}
                                        Reactivate
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setMemberMenu(null);
                                        setRemovingMember({ id: member.id, name: member.name || member.email || "this team member" });
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                      <X className="h-3.5 w-3.5" /> Remove
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={!!removingMember}
        onOpenChange={(open) => { if (!open) setRemovingMember(null); }}
        itemLabel={removingMember?.name || ""}
        onConfirm={async () => {
          if (removingMember) await removeMember(removingMember.id);
          setRemovingMember(null);
        }}
        confirmLabel="Yes, remove from team"
      />

      <DeleteConfirmDialog
        open={!!cancellingInvite}
        onOpenChange={(open) => { if (!open) setCancellingInvite(null); }}
        itemLabel={`the invitation to ${cancellingInvite?.email || ""}`}
        onConfirm={async () => {
          if (cancellingInvite) await cancelInvite(cancellingInvite.id);
          setCancellingInvite(null);
        }}
        confirmLabel="Yes, cancel invitation"
      />
    </div>
  );
}
