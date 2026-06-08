"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Share2, MessageSquare, Star, GripVertical, X, CheckCircle2, MoreVertical } from "lucide-react";
import Link from "next/link";
import { ShareCandidateDialog } from "./share-candidate-dialog";

interface KanbanCardProps {
  submission: any;
  onToggleShare: (submissionId: string, shared: boolean) => Promise<void>;
  onRemove?: (submissionId: string) => Promise<void>;
  isDragging?: boolean;
  clientName?: string;
  jobTitle?: string;
}

export function KanbanCard({
  submission,
  onToggleShare,
  onRemove,
  isDragging,
  clientName,
  jobTitle,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: submission.id,
  });

  const [showShareDialog, setShowShareDialog] = useState(false);
  // Diferencia "primer share" (dialog full con note + mail) vs "edit
  // post-share" (dialog reducido, solo checkboxes de docs). Set true
  // cuando se entra desde el menu "Manage shared docs".
  const [editDocsMode, setEditDocsMode] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const candidate = submission.candidate;
  const isShared = submission.isSharedWithClient;
  const clientStage = submission.clientStage;

  async function handleUnshare() {
    if (!confirm("Stop sharing this candidate with the client? They will lose access.")) return;
    setShowMenu(false);
    await onToggleShare(submission.id, false);
  }

  async function handleShareClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isShared) {
      // Already shared — show menu instead of toggling
      setShowMenu((v) => !v);
    } else {
      setEditDocsMode(false);
      setShowShareDialog(true);
    }
  }

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes}>
        <Card
          className={cn(
            "bg-white shadow-sm hover:shadow-md transition-shadow group",
            isDragging && "shadow-lg ring-2 ring-indigo-400 opacity-90"
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <button {...listeners} className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <Link href={`/candidates/${candidate.id}`} className="hover:underline">
                  <h4 className="font-medium text-sm truncate">
                    {candidate.firstName} {candidate.lastName}
                  </h4>
                </Link>
                <p className="text-xs text-gray-500 truncate">
                  {[candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" at ")}
                </p>
                {candidate.location && (
                  <p className="text-xs text-gray-400">{candidate.location}</p>
                )}
              </div>
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(submission.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5 rounded"
                  title="Remove from pipeline"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Client stage pill when shared */}
            {isShared && clientStage && (
              <div className="mt-2 flex items-center gap-1 text-[10px]">
                <span className="text-gray-400">Client:</span>
                <span
                  className="px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${clientStage.color}22`,
                    color: clientStage.color,
                  }}
                >
                  {clientStage.name}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {submission._count?.comments > 0 && (
                  // Clickable shortcut into the candidate's per-job
                  // chat. e.stopPropagation so the kanban card's
                  // drag handler doesn't fire on the same click;
                  // onMouseDown stops dnd-kit which listens on
                  // mousedown not click.
                  <Link
                    href={`/candidates/${candidate.id}?tab=notes&sub=${submission.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5 hover:text-indigo-600 transition-colors"
                    title="Open chat for this submission"
                  >
                    <MessageSquare className="h-3 w-3" /> {submission._count.comments}
                  </Link>
                )}
                {submission._count?.ratings > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3" /> {submission._count.ratings}
                  </span>
                )}
              </div>

              <div className="relative">
                {isShared ? (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-green-50 text-green-700 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Shared
                    </span>
                    <button
                      onClick={handleShareClick}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      title="Options"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleShareClick}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-50 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                    title="Share with client"
                  >
                    <Share2 className="h-3 w-3" />
                    Share with Client
                  </button>
                )}

                {showMenu && isShared && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-7 z-20 bg-white border rounded-lg shadow-lg py-1 w-48">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(false);
                          setEditDocsMode(true);
                          setShowShareDialog(true);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Manage shared docs
                      </button>
                      <button
                        onClick={handleUnshare}
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                      >
                        <X className="h-3.5 w-3.5" />
                        Stop sharing
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ShareCandidateDialog
        open={showShareDialog}
        onOpenChange={(o) => {
          setShowShareDialog(o);
          // Reset al cerrar para que el proximo abrir desde "Share
          // with Client" no quede pegado en edit mode.
          if (!o) setEditDocsMode(false);
        }}
        editDocsOnly={editDocsMode}
        submission={{
          id: submission.id,
          candidate: {
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            currentTitle: candidate.currentTitle,
          },
          job: {
            title: jobTitle || submission.job?.title || "this role",
            client: clientName ? { name: clientName } : submission.job?.client || null,
          },
        }}
        onShared={() => {
          // Tell parent to refresh. The dialog already did the PATCH; we just need to
          // reload the submission state. Calling onToggleShare with the already-true
          // value would make a redundant PATCH, so we call a no-op refetch via the
          // pattern: parent's toggleShare can handle idempotent true→true if it chooses.
          // Simpler: the jobs/[id] page's toggleShare reloads after PATCH, so we call
          // it with current value to trigger a refresh. But that re-shares. Instead,
          // we trigger a custom event the parent can listen to.
          window.dispatchEvent(new CustomEvent("kanban:refresh"));
        }}
      />
    </>
  );
}
