"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Paperclip, Upload, FileText, X, Download } from "lucide-react";

// Attachments panel for an interview — list of files pinned to it
// plus an upload button. Shared MIME/size policy with the other
// document endpoints, surfaced as a 10MB cap in the helper text.
// Errors come from the server (file too large, type not allowed,
// blob not configured) and render inline rather than alerting so
// the rest of the form stays usable.
//
// Used from both InterviewDialog (job + candidate pages) and the
// /calendar EditInterviewModal so attachments work uniformly across
// every surface where an interview can be opened.

type Doc = { id: string; name: string; size: number; type: string; createdAt: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function InterviewAttachments({ interviewId }: { interviewId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/documents`);
      if (res.ok) setDocs(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  async function upload(file: File) {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/interviews/${interviewId}/documents`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Upload failed");
        return;
      }
      await load();
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this attachment?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" />
          Attachments
        </Label>
        <label className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer">
          <Upload className="h-3 w-3" />
          {uploading ? "Uploading…" : "Add file"}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-md p-2">{error}</p>
      )}
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Agenda, prep doc, NDA — anything the interviewer should have on hand. PDF/DOCX/XLSX/TXT/CSV/PNG/JPG, max 10MB.
        </p>
      ) : (
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-40 overflow-y-auto">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <a
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate hover:text-indigo-600 hover:underline"
                title={d.name}
              >
                {d.name}
              </a>
              <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(d.size)}</span>
              <a
                href={`/api/documents/${d.id}?download=1`}
                download
                className="p-1 rounded text-gray-400 hover:text-gray-700"
                title="Download"
              >
                <Download className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="p-1 rounded text-gray-400 hover:text-red-600"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
