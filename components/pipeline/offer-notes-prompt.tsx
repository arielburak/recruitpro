"use client";

import { useEffect, useRef, useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens automatically when a submission transitions to the "Offered"
// stage. Saves the recruiter's offer details as an INTERNAL comment
// on the same submission so the offer is captured at the moment it
// actually happens — instead of weeks later when the placement is
// being put together. Skip-friendly: closing without saving leaves
// the stage on "Offered" and just doesn't post a comment.
//
// Visibility: the comment is INTERNAL. Offer details often include
// negotiation context the agency doesn't want the client to see in
// the shared timeline; the explicit "log to client chat" path is
// the existing chat-notes component.

const TEMPLATE = `Base salary:
Bonus / variable:
Equity / stock:
Start date:
Other benefits:
Notes / verbal feedback:`;

type Props = {
  submissionId: string;
  candidateName: string;
  jobTitle: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function OfferNotesPrompt({
  submissionId,
  candidateName,
  jobTitle,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState(TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus + place caret at the end of the first line ("Base salary:")
  // so the recruiter can start typing right away instead of arrowing
  // through the template.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const firstLineEnd = TEMPLATE.indexOf("\n");
    if (firstLineEnd > 0) {
      ta.setSelectionRange(firstLineEnd, firstLineEnd);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          type: "INTERNAL",
          content: trimmed,
          mentions: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save note");
        setSaving(false);
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      setError("Failed to save note");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col">
        <div className="border-b border-gray-100 px-5 py-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-violet-50 text-violet-600">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900 leading-tight">
              Log offer details
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {candidateName} · {jobTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">
            Saved as an internal note on this submission. Skip if you'd
            rather log it later.
          </p>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            className="w-full text-sm font-mono px-3 py-2 rounded-md border border-gray-200 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-violet-200"
            placeholder={TEMPLATE}
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Skip
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            type="button"
            className="bg-violet-600 hover:bg-violet-700"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save note"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
