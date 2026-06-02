"use client";

// Read-only pipeline view for the client portal job page. Mirrors the
// agency's kanban layout (one column per pipeline stage, cards inside)
// but never moves a candidate — pipeline ownership lives on the
// agency side for MVP. The recruiter's stage moves are mirrored into
// the client's pipeline via the submission PATCH endpoint, so the
// columns here always reflect what the firm is doing.
//
// We filter columns to "post-Submitted" only. Sourced / Internal
// Review are agency-internal — the client should never see candidates
// in those buckets anyway (they're not shared yet), but filtering the
// columns out keeps the layout cleaner.

import Link from "next/link";
import { CLIENT_VISIBLE_STAGE_SET } from "@/lib/constants";

type Stage = {
  id: string;
  name: string;
  color: string;
  isTerminal: boolean;
  kind: string | null;
  order: number;
};

// Matches the flat shape returned by /api/client-portal/candidates?flat=true
type SubmissionRow = {
  submissionId: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    currentTitle: string | null;
    currentCompany: string | null;
    location: string | null;
  };
  firm: { id: string; name: string };
  stage: { id: string; name: string; color: string } | null;
  clientStage: { id: string; name: string; color: string } | null;
  recruiterStage: { id: string; name: string; color: string } | null;
};

export function ReadOnlyPipeline({
  stages,
  submissions,
}: {
  stages: Stage[];
  submissions: SubmissionRow[];
}) {
  // Columns: client pipeline stages, but only the ones the client is
  // actually allowed to see. Order by `order` so the columns line up
  // with the agency's left-to-right flow.
  const visibleStages = stages
    .filter((s) => CLIENT_VISIBLE_STAGE_SET.has(s.name))
    .sort((a, b) => a.order - b.order);

  // Bucket each submission into the column whose id matches its
  // clientStageId. Submissions whose clientStage hasn't been
  // mirrored yet fall back to matching by name (agency stage name →
  // client column with same name) so we don't lose anyone in a stale-
  // data window.
  const byStageId = new Map<string, SubmissionRow[]>();
  for (const s of visibleStages) byStageId.set(s.id, []);

  for (const sub of submissions) {
    let target: Stage | undefined;
    // Prefer the explicit clientStage (set by auto-mirror on the
    // agency PATCH). If the row predates the mirror, fall back to
    // matching the recruiter's stage NAME against a client column
    // with the same name — keeps stale rows visible instead of
    // dumping them in a hidden bucket.
    if (sub.clientStage?.id) {
      target = visibleStages.find((s) => s.id === sub.clientStage!.id);
    }
    const fallbackName = sub.recruiterStage?.name || sub.stage?.name;
    if (!target && fallbackName) {
      target = visibleStages.find(
        (s) => s.name.toLowerCase() === fallbackName.toLowerCase()
      );
    }
    if (!target) continue;
    byStageId.get(target.id)!.push(sub);
  }

  if (visibleStages.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">
        Pipeline stages haven&apos;t been set up yet.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
      {visibleStages.map((stage) => {
        const items = byStageId.get(stage.id) || [];
        return (
          <div
            key={stage.id}
            className="flex flex-col shrink-0 w-[320px] bg-gray-50 rounded-xl border border-gray-200"
          >
            <div
              className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
              style={{ borderTop: `4px solid ${stage.color}`, borderTopLeftRadius: 11, borderTopRightRadius: 11 }}
            >
              <span className="text-sm font-semibold text-gray-800 truncate">
                {stage.name}
              </span>
              <span className="ml-auto text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                {items.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-2 min-h-[140px]">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  No candidates here yet.
                </p>
              ) : (
                items.map((sub) => {
                  const name = `${sub.candidate.firstName} ${sub.candidate.lastName}`.trim();
                  return (
                    <Link
                      key={sub.submissionId}
                      href={`/client-portal/candidates/${sub.submissionId}`}
                      className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-emerald-300 hover:shadow-sm transition"
                    >
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {name}
                      </p>
                      {sub.candidate.currentTitle && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {sub.candidate.currentTitle}
                          {sub.candidate.currentCompany ? ` @ ${sub.candidate.currentCompany}` : ""}
                        </p>
                      )}
                      {(sub.candidate.location || sub.firm?.name) && (
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                          {sub.candidate.location && (
                            <span className="truncate">{sub.candidate.location}</span>
                          )}
                          {sub.firm?.name && (
                            <span className="ml-auto truncate text-emerald-600 shrink-0">
                              via {sub.firm.name}
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
