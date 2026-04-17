"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Handshake, LayoutGrid, List } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const STAGES = ["LEAD", "QUALIFIED", "PITCHED", "NEGOTIATION", "WON", "LOST"] as const;

const STAGE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  QUALIFIED: "Qualified",
  PITCHED: "Pitched",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-gray-100 text-gray-800",
  QUALIFIED: "bg-blue-100 text-blue-800",
  PITCHED: "bg-purple-100 text-purple-800",
  NEGOTIATION: "bg-yellow-100 text-yellow-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-red-100 text-red-800",
};

const STAGE_COLUMN_COLORS: Record<string, string> = {
  LEAD: "border-t-gray-400",
  QUALIFIED: "border-t-blue-400",
  PITCHED: "border-t-purple-400",
  NEGOTIATION: "border-t-yellow-400",
  WON: "border-t-green-400",
  LOST: "border-t-red-400",
};

export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((data) => {
        setDeals(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load deals");
        setLoading(false);
      });
  }, []);

  const dealsByStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<string, any[]>
  );

  const totalValue = deals
    .filter((d) => d.stage !== "LOST")
    .reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deals</h1>
          <p className="text-gray-500">
            {deals.length} deal{deals.length !== 1 ? "s" : ""} &middot; Pipeline value:{" "}
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                view === "board"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                view === "list"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          <Link href="/deals/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Deal
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      {deals.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Handshake className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No deals yet. Create your first deal to track your BD pipeline.</p>
          </CardContent>
        </Card>
      ) : view === "board" ? (
        <div className="grid grid-cols-6 gap-4 min-h-[500px]">
          {STAGES.map((stage) => (
            <div key={stage} className="space-y-3">
              <div
                className={`border-t-4 ${STAGE_COLUMN_COLORS[stage]} bg-gray-50 rounded-t-lg px-3 py-2`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {STAGE_LABELS[stage]}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {dealsByStage[stage].length}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {dealsByStage[stage].map((deal) => (
                  <Card
                    key={deal.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/deals/${deal.id}`)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <h4 className="font-medium text-sm leading-tight">{deal.title}</h4>
                      <p className="text-xs text-gray-500">{deal.client?.name}</p>
                      {deal.value && (
                        <p className="text-sm font-semibold text-indigo-600">
                          {formatCurrency(Number(deal.value), deal.currency || "USD")}
                        </p>
                      )}
                      {deal.probability != null && (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{deal.probability}%</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/deals/${deal.id}`)}
                  >
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell>{deal.client?.name || "-"}</TableCell>
                    <TableCell>
                      {deal.value ? formatCurrency(Number(deal.value), deal.currency || "USD") : "-"}
                    </TableCell>
                    <TableCell>
                      {deal.probability != null ? `${deal.probability}%` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={STAGE_COLORS[deal.stage]}>
                        {STAGE_LABELS[deal.stage]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
