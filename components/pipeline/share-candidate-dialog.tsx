"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Share2, Building2, User, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: {
    id: string;
    candidate: { firstName: string; lastName: string; currentTitle?: string | null };
    job?: { title: string; client?: { name: string } | null };
  };
  onShared?: () => void;
};

export function ShareCandidateDialog({ open, onOpenChange, submission, onShared }: Props) {
  const [note, setNote] = useState("");
  const [notifyViaEmail, setNotifyViaEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
  const clientName = submission.job?.client?.name;
  const jobTitle = submission.job?.title;

  async function handleShare() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSharedWithClient: true,
          shareNote: note.trim() || undefined,
          notifyViaEmail,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to share");
        setSubmitting(false);
        return;
      }
      setNote("");
      onShared?.();
      onOpenChange(false);
    } catch {
      setError("Something went wrong");
    }
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-emerald-600" />
            Share candidate with client
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preview card */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                {(submission.candidate.firstName[0] || "") + (submission.candidate.lastName[0] || "")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{candidateName}</p>
                {submission.candidate.currentTitle && (
                  <p className="text-[11px] text-gray-500 truncate">{submission.candidate.currentTitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
              <User className="h-3 w-3 text-gray-400" />
              <span className="text-gray-400">for</span>
              <span className="font-medium text-gray-900">{jobTitle}</span>
              {clientName && (
                <>
                  <span className="text-gray-300">·</span>
                  <Building2 className="h-3 w-3 text-gray-400" />
                  <span className="font-medium text-gray-900">{clientName}</span>
                </>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-xs">Note for the client (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this candidate is a great fit, what stands out..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Notify toggle */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyViaEmail}
              onChange={(e) => setNotifyViaEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <p className="text-sm text-gray-900">Send email notification</p>
              <p className="text-[11px] text-gray-500">
                Notifies the hiring manager and admin users of the client portal. They&apos;ll get a link to review.
              </p>
            </div>
          </label>

          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              The candidate will appear in the client portal at <strong>Submitted</strong>. They can move it through
              their own pipeline (Interviewing, Offered, Placed, etc.).
            </span>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Sharing..." : "Share with Client"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
