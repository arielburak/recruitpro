"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Send,
  Share2,
  Building2,
  User,
  FileText,
  Loader2,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: {
    id: string;
    candidate: { firstName: string; lastName: string; currentTitle?: string | null };
    job?: { title: string; client?: { name: string } | null };
  };
  // True cuando el candidato ya esta shared y el dialog se abre solo
  // para ajustar la seleccion de documentos (kebab "Manage shared
  // docs"). Hace que la accion principal sea "Update", oculta la
  // nota + el toggle de mail (que solo tienen sentido en el primer
  // share), y solo dispara un PUT a /documents en vez del PATCH
  // completo de share.
  editDocsOnly?: boolean;
  onShared?: () => void;
};

type DocRow = {
  id: string;
  name: string;
  type: string;
  size: number;
  category: string | null;
  createdAt: string;
  isShared: boolean;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ShareCandidateDialog({
  open,
  onOpenChange,
  submission,
  editDocsOnly = false,
  onShared,
}: Props) {
  const [note, setNote] = useState("");
  const [notifyViaEmail, setNotifyViaEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
  const clientName = submission.job?.client?.name;
  const jobTitle = submission.job?.title;

  // Trae los docs del candidate cuando se abre el dialog. Defaults:
  // - Primer share (ningun doc shared todavia): pre-marcamos TODOS.
  //   El recruiter solo desmarca lo que no quiera exponer.
  // - Re-share / edit: pre-marcamos los que ya estaban shared para
  //   que el state inicial refleje lo que el cliente ve hoy.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDocsLoading(true);
    setError("");
    fetch(`/api/submissions/${submission.id}/documents`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: DocRow[] = Array.isArray(data?.documents) ? data.documents : [];
        setDocs(list);
        const anyShared = list.some((d) => d.isShared);
        setSelectedIds(
          new Set(
            anyShared
              ? list.filter((d) => d.isShared).map((d) => d.id)
              : list.map((d) => d.id),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setDocs([]);
          setSelectedIds(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, submission.id]);

  function toggleDoc(id: string) {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(docs.map((d: DocRow) => d.id)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      if (editDocsOnly) {
        // Re-edit puro de la seleccion de docs. PUT al endpoint
        // dedicado evita reenviar email + re-disparar la logica de
        // first-share del PATCH (que ya corrio cuando se compartio
        // originalmente).
        const res = await fetch(`/api/submissions/${submission.id}/documents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds: Array.from(selectedIds) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to update");
          setSubmitting(false);
          return;
        }
      } else {
        const res = await fetch(`/api/submissions/${submission.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isSharedWithClient: true,
            shareNote: note.trim() || undefined,
            notifyViaEmail,
            // Siempre mandamos el array; backend valida e ignora ids
            // ajenos. Empty array = ningun doc visible.
            selectedDocumentIds: Array.from(selectedIds),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to share");
          setSubmitting(false);
          return;
        }
        setNote("");
      }
      onShared?.();
      onOpenChange(false);
    } catch {
      setError("Something went wrong");
    }
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-emerald-600" />
            {editDocsOnly ? "Manage shared documents" : "Share candidate with client"}
          </DialogTitle>
        </DialogHeader>

        {/* Body con scroll propio — el footer (Cancel/Confirm) queda
            siempre visible abajo. Sin esto, cuando el list de docs
            crece, el item de abajo se cortaba contra los botones. */}
        <div className="space-y-4 px-6 py-2 overflow-y-auto flex-1 min-h-0">
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

          {/* Documents selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Documents to share
                {docs.length > 0 && (
                  <span className="ml-1.5 text-gray-400 font-normal">
                    ({selectedIds.size} of {docs.length})
                  </span>
                )}
              </Label>
              {docs.length > 1 && (
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-indigo-600 hover:underline"
                  >
                    All
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="text-gray-500 hover:underline"
                  >
                    None
                  </button>
                </div>
              )}
            </div>
            {docsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-3 border border-dashed border-gray-200 rounded-lg">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading documents…
              </div>
            ) : docs.length === 0 ? (
              <div className="text-xs text-gray-500 px-2 py-3 border border-dashed border-gray-200 rounded-lg">
                No documents uploaded for this candidate yet. The client
                will see the submission without attachments.
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {docs.map((doc: DocRow) => {
                  const checked = selectedIds.has(doc.id);
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50 border border-emerald-200"
                          : "bg-white border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDoc(doc.id)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${checked ? "text-emerald-600" : "text-gray-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{doc.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {doc.category ? `${doc.category} · ` : ""}
                          {formatBytes(doc.size)}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Note + notify solo en primer share — re-edit no
              re-dispara el mail. Mas compacto que antes para que el
              picker de docs sea lo dominante: textarea de 2 filas,
              info bg sacada (la promesa "you can adjust later" la
              cubre el menu Manage shared docs), notify pasa a una
              linea simple. */}
          {!editDocsOnly && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Note for the client (optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
                  placeholder="Why this candidate is a great fit..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={notifyViaEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotifyViaEmail(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Send email notification to client contacts on this job
              </label>
            </>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting
              ? editDocsOnly
                ? "Updating..."
                : "Sharing..."
              : editDocsOnly
                ? "Update documents"
                : "Share with Client"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
