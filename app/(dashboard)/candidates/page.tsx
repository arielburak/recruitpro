"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin,
  Briefcase,
} from "lucide-react";

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  skills: string[];
  createdAt: string;
  owner: { name: string };
  _count: { submissions: number };
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCandidates();
  }, [page, search]);

  async function fetchCandidates() {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      mine: "false",
    });
    const res = await fetch(`/api/candidates?${params}`);
    const data = await res.json();
    setCandidates(data.candidates || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <Link href="/candidates/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Candidate
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, email, title, company..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-10 h-9 text-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search
              ? "No candidates match your search"
              : "No candidates yet. Add your first candidate to get started."}
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_140px_100px_80px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Name</div>
            <div>Title / Company</div>
            <div>Location</div>
            <div>Owner</div>
            <div className="text-right">Jobs</div>
          </div>

          {/* Rows */}
          {candidates.map((c, i) => (
            <Link key={c.id} href={`/candidates/${c.id}`}>
              <div className={`grid grid-cols-[1fr_1fr_140px_100px_80px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                i < candidates.length - 1 ? "border-b border-gray-100" : ""
              }`}>
                {/* Name + email */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                    {c.firstName[0]}{c.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    {c.email && (
                      <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                    )}
                  </div>
                </div>

                {/* Title / Company */}
                <div className="min-w-0">
                  {c.currentTitle || c.currentCompany ? (
                    <p className="text-sm text-gray-600 truncate">
                      {c.currentTitle}
                      {c.currentTitle && c.currentCompany && (
                        <span className="text-gray-400"> at </span>
                      )}
                      {c.currentCompany && (
                        <span className="text-gray-500">{c.currentCompany}</span>
                      )}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Location */}
                <div className="min-w-0">
                  {c.location ? (
                    <p className="text-xs text-gray-500 truncate">{c.location}</p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Owner */}
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{c.owner.name}</p>
                </div>

                {/* Submissions count */}
                <div className="text-right">
                  {c._count.submissions > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {c._count.submissions}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-gray-500 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
