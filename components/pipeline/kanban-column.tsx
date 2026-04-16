"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";

interface KanbanColumnProps {
  stage: any;
  submissions: any[];
  onToggleShare: (submissionId: string, shared: boolean) => Promise<void>;
  onRemove?: (submissionId: string) => Promise<void>;
  clientName?: string;
  jobTitle?: string;
}

export function KanbanColumn({ stage, submissions, onToggleShare, onRemove, clientName, jobTitle }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-72 bg-gray-100 rounded-lg flex flex-col",
        isOver && "ring-2 ring-indigo-400 bg-indigo-50"
      )}
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-sm">{stage.name}</h3>
        </div>
        <span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">
          {submissions.length}
        </span>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
        {submissions.map((sub) => (
          <KanbanCard
            key={sub.id}
            submission={sub}
            onToggleShare={onToggleShare}
            onRemove={onRemove}
            clientName={clientName}
            jobTitle={jobTitle}
          />
        ))}
        {submissions.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
            Drop candidates here
          </div>
        )}
      </div>
    </div>
  );
}
