"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Share2,
  CheckCircle2,
  MessageSquare,
  Star,
  X,
  MoreVertical,
  Mail,
  Phone,
} from "lucide-react";
import { ShareCandidateDialog } from "./share-candidate-dialog";

// Notion-style list view of a job's pipeline. Same data and same
// transitions as the kanban — `onMove` runs through `moveSubmission`,
// which fires the share / placement / interview dialogs on the
// relevant stage changes. The list is denser, lets the recruiter
// scan + change stages with a dropdown instead of dragging across
// columns.

type Stage = {
  id: string;
  name: string;
  color: string;
};

type Submission = {
  id: string;
  stageId: string;
  isSharedWithClient: boolean;
  sharedAt?: string | null;
  clientStage?: { name: string; color: string } | null;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    currentTitle?: string | null;
    currentCompany?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  _count?: { comments?: number; ratings?: number };
};

interface Props {
  stages: Stage[];
  submissions: Submission[];
  onMove: (submissionId: string, stageId: string) => Promise<void>;
  onToggleShare: (submissionId: string, shared: boolean) => Promise<void>;
  onRemove?: (submissionId: string) => Promise<void>;
  clientName?: string;
  jobTitle?: string;
}

export function SubmissionsListView({
  stages,
  submissions,
  onMove,
  onToggleShare,
  onRemove,
  clientName,
  jobTitle,
}: Props) {
  const [shareDialogFor, setShareDialogFor] = useState<Submission | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  if (submissions.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-gray-400 bg-white">
        No candidates in this pipeline yet.
      </div>
    );
  }

  function stageById(id: string): Stage | undefined {
    return stages.find((s) => s.id === id);
  }

  async function handleShareClick(submission: Submission) {
    if (submission.isSharedWithClient) {
      setMenuOpenFor(menuOpenFor === submission.id ? null : submission.id);
    } else {
      setShareDialogFor(submission);
    }
  }

  async function handleUnshare(submission: Submission) {
    if (!confirm("Stop sharing this candidate with the client? They will lose access.")) return;
    setMenuOpenFor(null);
    await onToggleShare(submission.id, false);
  }

  return (
    <>
      <div className="border rounded-lg bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Candidate</th>
              <th className="text-left px-4 py-2 font-medium">Contact</th>
              <th className="text-left px-4 py-2 font-medium">Stage</th>
              <th className="text-left px-4 py-2 font-medium">Client</th>
              <th className="text-left px-4 py-2 font-medium">Activity</th>
              <th className="text-right px-4 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {submissions.map((s) => {
              const stage = stageById(s.stageId);
              const candidate = s.candidate;
              const isShared = s.isSharedWithClient;
              return (
                <tr key={s.id} className="hover:bg-gray-50 group">
                  {/* Candidate */}
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/candidates/${candidate.id}`}
                      className="font-medium text-gray-900 hover:text-indigo-600 hover:underline"
                    >
                      {candidate.firstName} {candidate.lastName}
                    </Link>
                    {(candidate.currentTitle || candidate.currentCompany) && (
                      <p className="text-xs text-gray-500 truncate max-w-xs">
                        {[candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" at ")}
                      </p>
                    )}
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-2.5">
                    <div className="space-y-0.5">
                      {candidate.email && (
                        <a
                          href={`mailto:${candidate.email}`}
                          className="flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-600 truncate max-w-[180px]"
                          title={candidate.email}
                        >
                          <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="truncate">{candidate.email}</span>
                        </a>
                      )}
                      {candidate.phone && (
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                          {candidate.phone}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Stage dropdown */}
                  <td className="px-4 py-2.5">
                    <select
                      value={s.stageId}
                      onChange={(e) => {
                        if (e.target.value !== s.stageId) {
                          void onMove(s.id, e.target.value);
                        }
                      }}
                      className="text-xs border rounded-md px-2 py-1 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      style={{ color: stage?.color }}
                    >
                      {stages.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Client share status */}
                  <td className="px-4 py-2.5">
                    <div className="relative inline-block">
                      {isShared ? (
                        <button
                          onClick={() => handleShareClick(s)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-50 text-green-700 font-medium hover:bg-green-100"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {s.clientStage?.name || "Shared"}
                          <MoreVertical className="h-3 w-3 ml-0.5 text-green-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleShareClick(s)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Share2 className="h-3 w-3" />
                          Share
                        </button>
                      )}
                      {menuOpenFor === s.id && isShared && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenFor(null)}
                          />
                          <div className="absolute right-0 top-7 z-20 bg-white border rounded-lg shadow-lg py-1 w-40">
                            <button
                              onClick={() => handleUnshare(s)}
                              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <X className="h-3.5 w-3.5" />
                              Stop sharing
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Activity counters */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {s._count?.comments ? (
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {s._count.comments}
                        </span>
                      ) : null}
                      {s._count?.ratings ? (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3" />
                          {s._count.ratings}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Remove */}
                  <td className="px-4 py-2.5 text-right">
                    {onRemove && (
                      <button
                        onClick={() => onRemove(s.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded"
                        title="Remove from pipeline"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shareDialogFor && (
        <ShareCandidateDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setShareDialogFor(null);
          }}
          submission={{
            id: shareDialogFor.id,
            candidate: {
              firstName: shareDialogFor.candidate.firstName,
              lastName: shareDialogFor.candidate.lastName,
              currentTitle: shareDialogFor.candidate.currentTitle,
            },
            job: {
              title: jobTitle || "this role",
              client: clientName ? { name: clientName } : null,
            },
          }}
          onShared={() => {
            setShareDialogFor(null);
            // Trigger the same refresh the kanban uses so the parent re-fetches.
            window.dispatchEvent(new CustomEvent("kanban:refresh"));
          }}
        />
      )}
    </>
  );
}
