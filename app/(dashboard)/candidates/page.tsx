"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-gray-500">{total} total candidates</p>
        </div>
        <Link href="/candidates/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add Candidate
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, email, title, company..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">
              {search
                ? "No candidates match your search"
                : "No candidates yet. Add your first candidate to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <Link key={c.id} href={`/candidates/${c.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {c.firstName} {c.lastName}
                        </h3>
                        {c._count.submissions > 0 && (
                          <Badge variant="secondary">
                            {c._count.submissions} job
                            {c._count.submissions !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {[c.currentTitle, c.currentCompany]
                          .filter(Boolean)
                          .join(" at ")}
                      </p>
                      {c.skills.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.skills.slice(0, 4).map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                          {c.skills.length > 4 && (
                            <span className="text-xs text-gray-400">
                              +{c.skills.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-400">
                      <p>{c.location}</p>
                      <p>by {c.owner.name}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
