"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Share2,
  CheckCircle2,
  MessageSquare,
  Star,
  X,
  Mail,
  Phone,
  ChevronDown,
} from "lucide-react";
import { ShareCandidateDialog } from "./share-candidate-dialog";

// Notion-style list view of a job's pipeline. Same data and same
// transitions as the board — `onMove` runs through `moveSubmission`,
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
              <th className="text-left px-4 py-2 font-medium">Visible to client</th>
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

                  {/* Visibility to client: binary state up front, share
                      timestamp + client's stage are secondary details
                      revealed in the popover so the column never reads
                      like another internal stage. */}
                  <td className="px-4 py-2.5">
                    <div className="relative inline-block">
                      {isShared ? (
                        <button
                          onClick={() => handleShareClick(s)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-50 text-green-700 font-medium hover:bg-green-100"
                          title={s.sharedAt ? `Shared on ${new Date(s.sharedAt).toLocaleString()}` : "Shared with client"}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>
                            Shared
                            {s.sharedAt && (
                              <>
                                {" · "}
                                {formatDistanceToNow(new Date(s.sharedAt), { addSuffix: false })} ago
                              </>
                            )}
                          </span>
                          <ChevronDown className="h-3 w-3 ml-0.5 text-green-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleShareClick(s)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                        >
                          <Share2 className="h-3 w-3" />
                          Share with client
                        </button>
                      )}
                      {menuOpenFor === s.id && isShared && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenFor(null)}
                          />
                          <div className="absolute right-0 top-7 z-20 bg-white border rounded-lg shadow-lg py-2 w-56">
                            {s.sharedAt && (
                              <div className="px-3 pb-2 mb-1 border-b border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Shared</p>
                                <p className="text-xs text-gray-700">{new Date(s.sharedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
                              </div>
                            )}
                            {s.clientStage && (
                              <div className="px-3 pb-2 mb-1 border-b border-gray-100">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Client's stage</p>
                                <p
                                  className="text-xs font-medium"
                                  style={{ color: s.clientStage.color }}
                                >
                                  {s.clientStage.name}
                                </p>
                              </div>
                            )}
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
                        <Link
                          href={`/candidates/${s.candidate.id}?tab=notes&sub=${s.id}`}
                          className="flex items-center gap-0.5 hover:text-indigo-600 transition-colors"
                          title="Open chat for this submission"
                        >
                          <MessageSquare className="h-3 w-3" />
                          {s._count.comments}
                        </Link>
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
