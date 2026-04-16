"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Building2, Briefcase, MapPin } from "lucide-react";
import { RatingStars } from "./rating-stars";

export type CandidateRow = {
  submissionId: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    currentTitle: string | null;
    currentCompany: string | null;
    location: string | null;
  };
  job: { id: string; title: string };
  firm: { id: string; name: string };
  stage: { id: string; name: string; order: number; color: string } | null;
  sharedBy: string | null;
  sharedAt: string;
  myRating: number | null;
  avgRating: number | null;
  ratingCount: number;
};

type Props = {
  row: CandidateRow;
  showJob?: boolean;
  showFirm?: boolean;
  onRated?: () => void;
};

function formatDateShort(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CandidateTableRow({ row, showJob = true, showFirm = true, onRated }: Props) {
  const [myRating, setMyRating] = useState<number | null>(row.myRating);
  const [savingRating, setSavingRating] = useState(false);

  async function setRating(score: number) {
    const prev = myRating;
    setMyRating(score);
    setSavingRating(true);
    try {
      const res = await fetch(`/api/client-portal/candidates/${row.submissionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        setMyRating(prev);
      } else {
        onRated?.();
      }
    } catch {
      setMyRating(prev);
    }
    setSavingRating(false);
  }

  const fullName = `${row.candidate.firstName} ${row.candidate.lastName}`.trim();
  const initials = (row.candidate.firstName[0] || "") + (row.candidate.lastName[0] || "");

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell>
        <Link
          href={`/client-portal/candidates/${row.submissionId}`}
          className="flex items-center gap-2.5 min-w-0 group"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-emerald-600">
              {fullName}
            </p>
            {row.candidate.currentTitle && (
              <p className="text-[11px] text-gray-500 truncate">
                {row.candidate.currentTitle}
                {row.candidate.currentCompany ? ` · ${row.candidate.currentCompany}` : ""}
              </p>
            )}
          </div>
        </Link>
      </TableCell>

      {showJob && (
        <TableCell>
          <Link
            href={`/client-portal/jobs/${row.job.id}`}
            className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-emerald-600"
          >
            <Briefcase className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="truncate max-w-[140px]">{row.job.title}</span>
          </Link>
        </TableCell>
      )}

      <TableCell>
        {row.stage ? (
          <Badge
            className="text-[10px] border-0"
            style={{
              backgroundColor: `${row.stage.color}22`,
              color: row.stage.color,
            }}
          >
            {row.stage.name}
          </Badge>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </TableCell>

      {showFirm && (
        <TableCell>
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="truncate max-w-[120px]">{row.firm.name}</span>
          </span>
        </TableCell>
      )}

      <TableCell>
        {row.candidate.location ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="truncate max-w-[100px]">{row.candidate.location}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <RatingStars value={myRating} onChange={setRating} size="sm" />
          {savingRating && <span className="text-[10px] text-gray-400">…</span>}
          {row.avgRating !== null && row.ratingCount > 1 && (
            <span className="text-[10px] text-gray-400" title={`Team average from ${row.ratingCount} ratings`}>
              ({row.avgRating.toFixed(1)})
            </span>
          )}
        </div>
      </TableCell>

      <TableCell className="text-xs text-gray-500 whitespace-nowrap">
        {formatDateShort(row.sharedAt)}
      </TableCell>
    </TableRow>
  );
}
