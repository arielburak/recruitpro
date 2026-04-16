"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";

interface KanbanBoardProps {
  stages: any[];
  submissions: any[];
  onMove: (submissionId: string, stageId: string) => Promise<void>;
  onToggleShare: (submissionId: string, shared: boolean) => Promise<void>;
  onRemove?: (submissionId: string) => Promise<void>;
  clientName?: string;
  jobTitle?: string;
}

export function KanbanBoard({ stages, submissions, onMove, onToggleShare, onRemove, clientName, jobTitle }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeSubmission = submissions.find((s) => s.id === activeId);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const submissionId = active.id as string;
    const targetStageId = over.id as string;

    const submission = submissions.find((s) => s.id === submissionId);
    if (!submission || submission.stageId === targetStageId) return;

    // Check if dropping on a stage
    const isStage = stages.some((s) => s.id === targetStageId);
    if (isStage) {
      await onMove(submissionId, targetStageId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {stages.map((stage) => {
          const stageSubmissions = submissions.filter(
            (s) => s.stageId === stage.id
          );
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              submissions={stageSubmissions}
              onToggleShare={onToggleShare}
              onRemove={onRemove}
              clientName={clientName}
              jobTitle={jobTitle}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeSubmission ? (
          <KanbanCard
            submission={activeSubmission}
            onToggleShare={onToggleShare}
            isDragging
            clientName={clientName}
            jobTitle={jobTitle}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
