"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Share2, MessageSquare, Star, GripVertical, X } from "lucide-react";
import Link from "next/link";

interface KanbanCardProps {
  submission: any;
  onToggleShare: (submissionId: string, shared: boolean) => Promise<void>;
  onRemove?: (submissionId: string) => Promise<void>;
  isDragging?: boolean;
}

export function KanbanCard({ submission, onToggleShare, onRemove, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: submission.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const candidate = submission.candidate;

  return (
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
                {[candidate.currentTitle, candidate.currentCompany]
                  .filter(Boolean)
                  .join(" at ")}
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

          <div className="flex items-center justify-between mt-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {submission._count?.comments > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" /> {submission._count.comments}
                </span>
              )}
              {submission._count?.ratings > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3" /> {submission._count.ratings}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleShare(submission.id, !submission.isSharedWithClient);
              }}
              className={cn(
                "flex items-center gap-1 text-xs px-2 py-1 rounded",
                submission.isSharedWithClient
                  ? "bg-green-50 text-green-600"
                  : "bg-gray-50 text-gray-400 hover:text-gray-600"
              )}
              title={submission.isSharedWithClient ? "Shared with client" : "Share with client"}
            >
              <Share2 className="h-3 w-3" />
              {submission.isSharedWithClient ? "Shared" : "Share"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
