"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Briefcase, Upload, FileText, X, Loader2 } from "lucide-react";
import { CurrencyPicker } from "@/components/ui/currency-picker";

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Temporary", "Internship"];

export default function PostJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");

  // File upload & parsing state
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState("ON_SITE");
  const descRef = useRef<HTMLTextAreaElement>(null);

  async function handleFileUpload(file: File) {
    setJdFile(file);
    setParsing(true);
    setParseStatus("Extracting text...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/client-portal/parse-document", { method: "POST", body: formData });
      const data = await res.json();

      if (data.text && data.text.trim()) {
        setDescription(data.text.trim());
        // Always overwrite structured fields with the parsed JD — the document
        // is the source of truth, regardless of whatever the user typed before.
        if (data.fields) {
          if (data.fields.title) setTitle(data.fields.title);
          if (data.fields.location) setLocation(data.fields.location);
          if (data.fields.workMode) setWorkMode(data.fields.workMode);
        }
        setParseStatus(`Text extracted (${data.text.trim().length} characters)`);
      } else if (data.error) {
        setParseStatus(`Could not extract text: ${data.error}`);
      } else {
        setParseStatus("No text could be extracted from this file");
      }
    } catch {
      setParseStatus("Failed to parse file");
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/client-portal/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || fd.get("description"),
          requirements: fd.get("requirements"),
          location,
          salaryRange: fd.get("salaryRange"),
          salaryCurrency,
          jobType: fd.get("jobType"),
          workMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create job");
        setLoading(false);
        return;
      }

      const job = await res.json();

      // Upload JD file if one was selected (attach to job as document)
      if (jdFile) {
        try {
          const docForm = new FormData();
          docForm.append("file", jdFile);
          docForm.append("category", "JOB_DESCRIPTION");
          await fetch(`/api/client-portal/jobs/${job.id}/documents`, {
            method: "POST",
            body: docForm,
          });
        } catch (e) {
          console.error("JD upload failed:", e);
          // Don't block navigation — job was created successfully
        }
      }

      router.push(`/client-portal/jobs/${job.id}`);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/client-portal/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Post a Job</h1>
          <p className="text-gray-500 text-sm">Describe the role and invite recruiters to help fill it</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}

        <Card>
          <CardContent className="p-5 space-y-4">
            {/* JD File Upload */}
            <div className="space-y-2">
              <Label>Job Description File</Label>
              {jdFile ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-xs">{jdFile.name}</p>
                      <p className="text-xs text-gray-400">
                        {(jdFile.size / 1024).toFixed(1)} KB
                        {parsing && (
                          <span className="ml-2 text-emerald-500">
                            <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                            Parsing...
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setJdFile(null); setParseStatus(""); }}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Upload Job Description</span>
                  <span className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (max 10MB) — text will be extracted and fill the description</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {parseStatus && !parsing && (
                <p className={`text-xs ${parseStatus.startsWith("Text extracted") ? "text-green-600" : "text-amber-600"}`}>
                  {parseStatus}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">
                Job Title *
                {title && description && <span className="text-xs text-green-600 font-normal ml-2">Auto-filled from document</span>}
              </Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Senior Software Engineer"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Job Description
                {description ? <span className="text-xs text-green-600 font-normal ml-2">Auto-filled from document</span> : ""}
              </Label>
              <Textarea
                ref={descRef}
                id="description"
                name="description"
                rows={description ? 12 : 5}
                placeholder="Describe the role, responsibilities, team structure..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea id="requirements" name="requirements" rows={4} placeholder="Required skills, experience, qualifications..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="e.g. New York, NY"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <CurrencyPicker value={salaryCurrency} onChange={setSalaryCurrency} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salaryRange">Salary Range</Label>
              <Input id="salaryRange" name="salaryRange" placeholder="e.g. 150K - 200K" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jobType">Job Type</Label>
                <select
                  id="jobType"
                  name="jobType"
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  defaultValue="Full-time"
                >
                  {JOB_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workMode">Work Arrangement</Label>
                <select
                  id="workMode"
                  name="workMode"
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                >
                  <option value="ON_SITE">On-site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-400">You can invite recruiting firms after posting</p>
          <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading || parsing}>
            {loading ? "Posting..." : "Post Job"}
          </Button>
        </div>
      </form>
    </div>
  );
}
