"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { PhoneInput } from "@/components/ui/phone-input";
import { CurrencyPicker, getCurrency } from "@/components/ui/currency-picker";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import Link from "next/link";

type TeamMember = { id: string; name: string; email: string };

export default function EditCandidatePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id || "";
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [candidate, setCandidate] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");
  // Owner state is its own thing — we hydrate from the candidate
  // once it loads, then let the user re-assign freely. Changing the
  // owner is forward-looking: existing placements keep their
  // recruiterId, so this won't rewrite historical credit.
  const [ownerId, setOwnerId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetch(`/api/candidates/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setCandidate(data);
        setSkills(data.skills || []);
        setPhone(data.phone || "");
        setSalaryCurrency(data.salaryCurrency || "USD");
        setOwnerId(data.ownerId || "");
        setFetching(false);
      });
  }, [params.id]);

  // Load team members for the Owner picker.
  useEffect(() => {
    fetch("/api/users/search?q=")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((data) => setTeamMembers(Array.isArray(data.users) ? data.users : []))
      .catch(() => setTeamMembers([]));
  }, []);

  function addSkill() {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const data = {
      firstName: fd.get("firstName") as string,
      lastName: fd.get("lastName") as string,
      email: fd.get("email") as string,
      phone,
      linkedIn: fd.get("linkedIn") as string,
      location: fd.get("location") as string,
      currentTitle: fd.get("currentTitle") as string,
      currentCompany: fd.get("currentCompany") as string,
      currentSalary: fd.get("currentSalary")
        ? Number(fd.get("currentSalary"))
        : null,
      desiredSalary: fd.get("desiredSalary")
        ? Number(fd.get("desiredSalary"))
        : null,
      salaryCurrency,
      source: fd.get("source") as string,
      summary: fd.get("summary") as string,
      skills,
      ownerId: ownerId || undefined,
    };

    const res = await fetch(`/api/candidates/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Update failed");
      setLoading(false);
      return;
    }

    router.push(`/candidates/${params.id}`);
  }

  if (fetching) {
    return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <BackButton fallback={`/candidates/${params.id}`} />
        <h1 className="text-2xl font-bold">Edit Candidate</h1>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input name="firstName" defaultValue={candidate.firstName} required />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input name="lastName" defaultValue={candidate.lastName} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={candidate.email || ""} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL</Label>
              <Input name="linkedIn" defaultValue={candidate.linkedIn || ""} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input name="location" defaultValue={candidate.location || ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Title</Label>
                <Input name="currentTitle" defaultValue={candidate.currentTitle || ""} />
              </div>
              <div className="space-y-2">
                <Label>Current Company</Label>
                <Input name="currentCompany" defaultValue={candidate.currentCompany || ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <CurrencyPicker
                name="salaryCurrency"
                value={salaryCurrency}
                onChange={setSalaryCurrency}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Salary ({getCurrency(salaryCurrency).symbol})</Label>
                <Input name="currentSalary" type="number" defaultValue={candidate.currentSalary || ""} />
              </div>
              <div className="space-y-2">
                <Label>Desired Salary ({getCurrency(salaryCurrency).symbol})</Label>
                <Input name="desiredSalary" type="number" defaultValue={candidate.desiredSalary || ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerId">Owner</Label>
              <SearchableSelect
                value={ownerId}
                onChange={setOwnerId}
                includeAll={false}
                placeholder={
                  teamMembers.length === 0 ? "Loading team…" : "Select an owner"
                }
                searchPlaceholder="Search teammates…"
                minWidth={0}
                className="w-full"
                options={teamMembers.map<SearchableSelectOption>((m) => ({
                  value: m.id,
                  label:
                    (m.name || m.email) +
                    (m.id === currentUserId ? " (you)" : ""),
                  meta: m.name && m.email ? m.email : undefined,
                }))}
              />
              <p className="text-[10.5px] text-gray-400">
                Recruiter that owns this candidate going forward. Past
                placements keep their own recruiter, so reporting on
                historical deals stays accurate.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Input name="source" defaultValue={candidate.source || ""} />
            </div>
            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addSkill(); }
                  }}
                  placeholder="Type a skill and press Enter"
                />
                <Button type="button" variant="outline" onClick={addSkill}>Add</Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {skills.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-sm">
                      {s}
                      <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Summary / Notes</Label>
              <Textarea name="summary" rows={4} defaultValue={candidate.summary || ""} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href={`/candidates/${params.id}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
