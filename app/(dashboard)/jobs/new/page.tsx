"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, FileText, X, Loader2, Search, Check } from "lucide-react";
import Link from "next/link";

function NewJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [description, setDescription] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Fee terms state (auto-filled from client defaults)
  const [currency, setCurrency] = useState("USD");
  const [feeType, setFeeType] = useState("PERCENTAGE");
  const [feeAmount, setFeeAmount] = useState("");
  const [termsAutoFilled, setTermsAutoFilled] = useState(false);

  // Client search combobox state
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId);
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  const filteredClients = clientSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    setClientDropdownOpen(false);
    setClientSearch("");
    // Auto-fill fee terms from client defaults
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      if (client.defaultCurrency) setCurrency(client.defaultCurrency);
      if (client.defaultFeeType) setFeeType(client.defaultFeeType);
      if (client.defaultFeeAmount) {
        setFeeAmount(String(Number(client.defaultFeeAmount)));
        setTermsAutoFilled(true);
      }
    }
  }

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        setClients(data);
        // Auto-fill if preselected client
        if (preselectedClientId) {
          const client = data.find((c: any) => c.id === preselectedClientId);
          if (client) {
            if (client.defaultCurrency) setCurrency(client.defaultCurrency);
            if (client.defaultFeeType) setFeeType(client.defaultFeeType);
            if (client.defaultFeeAmount) {
              setFeeAmount(String(Number(client.defaultFeeAmount)));
              setTermsAutoFilled(true);
            }
          }
        }
      });
  }, []);

  async function handleFileUpload(file: File) {
    setJdFile(file);
    setParsing(true);
    setParseStatus("Extracting text...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-document", { method: "POST", body: formData });
      const data = await res.json();

      if (data.text && data.text.trim()) {
        setDescription(data.text.trim());
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: description || fd.get("description"),
        clientId: selectedClientId,
        location: fd.get("location"),
        workMode: fd.get("workMode"),
        currency,
        salary: fd.get("salary"),
        feeType,
        feeAmount: feeAmount ? Number(feeAmount) : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create job");
      setLoading(false);
      return;
    }

    const job = await res.json();

    // Upload JD file if one was selected (to keep it as a downloadable document too)
    if (jdFile) {
      try {
        const docForm = new FormData();
        docForm.append("file", jdFile);
        docForm.append("category", "JOB_DESCRIPTION");
        await fetch(`/api/jobs/${job.id}/documents`, { method: "POST", body: docForm });
      } catch (e) {
        console.error("JD upload failed:", e);
      }
    }

    router.push(`/jobs/${job.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/jobs">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Create Job</h1>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader><CardTitle>Job Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

            {/* JD File Upload — first, so it fills description below */}
            <div className="space-y-2">
              <Label>Job Description File</Label>
              {jdFile ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-xs">{jdFile.name}</p>
                      <p className="text-xs text-gray-400">
                        {(jdFile.size / 1024).toFixed(1)} KB
                        {parsing && <span className="ml-2 text-indigo-500"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Parsing...</span>}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setJdFile(null); setParseStatus(""); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Upload Job Description</span>
                  <span className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (max 10MB) — text will be extracted and fill the description</span>
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }} />
                </label>
              )}
              {parseStatus && !parsing && (
                <p className={`text-xs ${parseStatus.startsWith("Text extracted") ? "text-green-600" : "text-amber-600"}`}>
                  {parseStatus}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Job Title *</Label>
              <Input name="title" placeholder="Senior Software Engineer" required />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <input type="hidden" name="clientId" value={selectedClientId} />
              <div ref={clientRef} className="relative">
                {selectedClient && !clientDropdownOpen ? (
                  <button
                    type="button"
                    onClick={() => { setClientDropdownOpen(true); setClientSearch(""); }}
                    className="flex items-center justify-between w-full border rounded-md px-3 py-2 text-sm text-left bg-background hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium">{selectedClient.name}</span>
                    <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setSelectedClientId(""); setClientSearch(""); setCurrency("USD"); setFeeType("PERCENTAGE"); setFeeAmount(""); setTermsAutoFilled(false); }} />
                  </button>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Search clients..."
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setClientDropdownOpen(true); }}
                      onFocus={() => setClientDropdownOpen(true)}
                      autoFocus={clientDropdownOpen}
                    />
                  </div>
                )}
                {clientDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {clientSearch ? "No clients match your search" : "No clients found"}
                      </div>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-indigo-50 transition-colors ${c.id === selectedClientId ? "bg-indigo-50 text-indigo-700" : ""}`}
                          onClick={() => selectClient(c.id)}
                        >
                          <span>{c.name}</span>
                          {c.id === selectedClientId && <Check className="h-4 w-4 text-indigo-600" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {clients.length === 0 && (
                <p className="text-xs text-gray-400">
                  <Link href="/clients/new" className="text-indigo-600 hover:underline">Add a client first</Link>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input name="location" placeholder="New York, NY" />
              </div>
              <div className="space-y-2">
                <Label>Work Mode</Label>
                <select name="workMode" className="w-full border rounded-md px-3 py-2 text-sm" defaultValue="ON_SITE">
                  <option value="ON_SITE">On-site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Salary Range</Label>
                <Input name="salary" placeholder="$150K - $180K" />
              </div>
              <div className="space-y-2">
                <Label>Currency {termsAutoFilled && <span className="text-xs text-green-600 font-normal">· from client</span>}</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fee Type {termsAutoFilled && <span className="text-xs text-green-600 font-normal">· from client</span>}</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat Fee</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Fee Amount {termsAutoFilled && <span className="text-xs text-green-600 font-normal">· from client</span>}</Label>
                <Input type="number" step="0.01" placeholder="25" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description {description ? <span className="text-xs text-green-600 font-normal ml-2">Auto-filled from document</span> : ""}</Label>
              <Textarea
                ref={descRef}
                name="description"
                rows={description ? 12 : 4}
                placeholder="Job description, requirements..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href="/jobs"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={loading || parsing}>{loading ? "Creating..." : "Create Job"}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
      <NewJobContent />
    </Suspense>
  );
}
