"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, DollarSign, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PlacementDialog } from "@/components/placements/placement-dialog";

type JobOption = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientPaymentTerms: number | null;
  clientFeeAmount: string | null;
  clientFeeType: "PERCENTAGE" | "FLAT" | null;
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
};

function isWithin30Days(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [editingPlacement, setEditingPlacement] = useState<any | null>(null);

  function reloadPlacements() {
    fetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        setPlacements(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load placements");
        setLoading(false);
      });
  }

  useEffect(() => {
    reloadPlacements();
  }, []);

  function openNewDialog() {
    // Lazy-load job options the first time the dialog opens — keeps the
    // initial /placements render light.
    if (jobOptions.length === 0) {
      fetch("/api/placements/job-options")
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && setJobOptions(data))
        .catch(() => {});
    }
    setShowNewDialog(true);
  }

  // Calculate revenue this quarter
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
  const revenueThisQuarter = placements
    .filter((p) => {
      const d = new Date(p.createdAt);
      return d >= quarterStart && d <= quarterEnd;
    })
    .reduce((sum, p) => sum + (Number(p.feeAmount) || 0), 0);

  const paidThisQuarter = placements
    .filter((p) => {
      const d = new Date(p.createdAt);
      return d >= quarterStart && d <= quarterEnd && p.invoiceStatus === "PAID";
    })
    .reduce((sum, p) => sum + (Number(p.feeAmount) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Placements</h1>
          <p className="text-gray-500">
            {placements.length} placement{placements.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openNewDialog} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" />
          New Placement
        </Button>
      </div>

      <PlacementDialog
        mode="manual"
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        jobOptions={jobOptions}
        onSuccess={reloadPlacements}
      />

      {editingPlacement && (
        <PlacementDialog
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingPlacement(null);
          }}
          placementId={editingPlacement.id}
          candidateName={
            editingPlacement.submission?.candidate
              ? `${editingPlacement.submission.candidate.firstName} ${editingPlacement.submission.candidate.lastName}`
              : "Candidate"
          }
          jobTitle={editingPlacement.job?.title || "—"}
          clientName={editingPlacement.client?.name}
          initial={{
            estimatedStartDate: editingPlacement.estimatedStartDate,
            startDate: editingPlacement.startDate,
            agreedSalary: editingPlacement.salary,
            feeAmount: editingPlacement.feeAmount,
            feeType: editingPlacement.feeType,
            paymentTerms: editingPlacement.paymentTerms,
            paymentDueDate: editingPlacement.paymentDueDate,
            guaranteePeriod: editingPlacement.guaranteePeriod,
            notes: editingPlacement.notes,
            invoiceStatus: editingPlacement.invoiceStatus,
          }}
          onSuccess={() => {
            setEditingPlacement(null);
            reloadPlacements();
          }}
        />
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* Revenue stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                <DollarSign className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Revenue This Quarter</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {formatCurrency(revenueThisQuarter)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Collected This Quarter</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(paidThisQuarter)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {placements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No placements yet. Placements are created when candidates are placed on jobs.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Fee Amount</TableHead>
                  <TableHead>Invoice Status</TableHead>
                  <TableHead>Guarantee Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {placements.map((p) => {
                  const candidateName = p.submission?.candidate
                    ? `${p.submission.candidate.firstName} ${p.submission.candidate.lastName}`
                    : "Unknown";
                  const guaranteeExpiry = p.guaranteeExpiry;
                  const expiringSoon = isWithin30Days(guaranteeExpiry);
                  const expired = isExpired(guaranteeExpiry);

                  return (
                    <TableRow
                      key={p.id}
                      onClick={() => setEditingPlacement(p)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <TableCell className="font-medium">{candidateName}</TableCell>
                      <TableCell>{p.job?.title || "-"}</TableCell>
                      <TableCell>{p.client?.name || "-"}</TableCell>
                      <TableCell>
                        {p.startDate ? formatDate(p.startDate) : "-"}
                      </TableCell>
                      <TableCell>
                        {p.feeAmount ? formatCurrency(Number(p.feeAmount), p.job?.currency || "USD") : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={INVOICE_STATUS_COLORS[p.invoiceStatus]}>
                          {INVOICE_STATUS_LABELS[p.invoiceStatus] || p.invoiceStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {guaranteeExpiry ? (
                          <span
                            className={
                              expired
                                ? "text-gray-400 line-through"
                                : expiringSoon
                                  ? "text-red-600 font-semibold"
                                  : ""
                            }
                          >
                            {formatDate(guaranteeExpiry)}
                            {expiringSoon && !expired && (
                              <span className="ml-1 text-xs">(expiring soon)</span>
                            )}
                            {expired && (
                              <span className="ml-1 text-xs text-gray-400">(expired)</span>
                            )}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
