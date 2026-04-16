"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowUp, ArrowDown, Lock, Workflow, Check, X } from "lucide-react";

type Stage = {
  id: string;
  name: string;
  order: number;
  color: string;
  isTerminal: boolean;
  kind: string | null;
};

const DEFAULT_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#ef4444", // red
  "#6b7280", // gray
  "#ec4899", // pink
  "#14b8a6", // teal
];

type Props = {
  isAdmin: boolean;
};

export function PipelineStagesManager({ isAdmin }: Props) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; color: string; isTerminal: boolean; kind: string | null }>({
    name: "",
    color: "#f59e0b",
    isTerminal: false,
    kind: null,
  });

  // Add form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#f59e0b");
  const [newIsTerminal, setNewIsTerminal] = useState(false);
  const [newKind, setNewKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/client-portal/pipeline-stages");
      if (res.ok) setStages(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(stage: Stage) {
    setEditingId(stage.id);
    setEditForm({
      name: stage.name,
      color: stage.color,
      isTerminal: stage.isTerminal,
      kind: stage.kind,
    });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/client-portal/pipeline-stages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        load();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Something went wrong");
    }
    setBusy(false);
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/client-portal/pipeline-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          color: newColor,
          isTerminal: newIsTerminal,
          kind: newKind,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setNewName("");
        setNewColor("#f59e0b");
        setNewIsTerminal(false);
        setNewKind(null);
        load();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add");
      }
    } catch {
      setError("Something went wrong");
    }
    setBusy(false);
  }

  async function deleteStage(id: string) {
    if (!confirm("Delete this stage? Any candidates in it must be moved first.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/client-portal/pipeline-stages/${id}`, { method: "DELETE" });
      if (res.ok) {
        load();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete");
      }
    } catch {
      setError("Something went wrong");
    }
    setBusy(false);
  }

  async function moveStage(id: string, direction: "up" | "down") {
    const idx = stages.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/client-portal/pipeline-stages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: targetIdx }),
      });
      if (res.ok) {
        load();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to reorder");
      }
    } catch {}
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Workflow className="h-4 w-4 text-emerald-500" />
          Candidate Pipeline
        </CardTitle>
        {isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setAdding(!adding)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stage
          </Button>
        ) : (
          <Badge variant="secondary" className="text-[10px] gap-1 bg-gray-100 text-gray-500">
            <Lock className="h-3 w-3" />
            Admin only
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-4">
          The pipeline your team uses to review and track candidates shared with you.
          Shared candidates start at the first stage.
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg mb-3">{error}</div>
        )}

        {isAdmin && adding && (
          <div className="mb-4 p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
            <form onSubmit={addStage} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Second Round"
                    className="text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-1 items-center h-9">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? "ring-2 ring-offset-1 ring-gray-400 scale-110" : "hover:scale-110"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={newIsTerminal}
                    onChange={(e) => setNewIsTerminal(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Terminal stage (end of pipeline)
                </label>
                {newIsTerminal && (
                  <select
                    value={newKind || ""}
                    onChange={(e) => setNewKind(e.target.value || null)}
                    className="text-xs border rounded px-2 py-1 h-7"
                  >
                    <option value="">Neutral</option>
                    <option value="positive">Positive (placed/hired)</option>
                    <option value="negative">Negative (lost/rejected)</option>
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                  {busy ? "Adding..." : "Add Stage"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded-md animate-pulse" />
            ))}
          </div>
        ) : stages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No stages yet.</p>
        ) : (
          <div className="space-y-2">
            {stages.map((stage, idx) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-colors"
              >
                {editingId === stage.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex gap-1 items-center">
                      {DEFAULT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, color: c })}
                          className={`w-4 h-4 rounded-full ${editForm.color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-8 text-sm flex-1"
                    />
                    <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={editForm.isTerminal}
                        onChange={(e) => setEditForm({ ...editForm, isTerminal: e.target.checked, kind: e.target.checked ? editForm.kind : null })}
                        className="h-3.5 w-3.5"
                      />
                      Terminal
                    </label>
                    {editForm.isTerminal && (
                      <select
                        value={editForm.kind || ""}
                        onChange={(e) => setEditForm({ ...editForm, kind: e.target.value || null })}
                        className="text-[11px] border rounded px-1.5 py-1 h-7"
                      >
                        <option value="">Neutral</option>
                        <option value="positive">Positive</option>
                        <option value="negative">Negative</option>
                      </select>
                    )}
                    <Button size="sm" onClick={() => saveEdit(stage.id)} disabled={busy} className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busy} className="h-7 px-2">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-medium text-gray-900 flex-1">
                      {stage.name}
                      {stage.isTerminal && (
                        <Badge
                          variant="secondary"
                          className={`ml-2 text-[9px] ${
                            stage.kind === "positive"
                              ? "bg-green-100 text-green-700"
                              : stage.kind === "negative"
                                ? "bg-red-50 text-red-600"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          Terminal{stage.kind ? ` · ${stage.kind}` : ""}
                        </Badge>
                      )}
                    </span>
                    {isAdmin && (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => moveStage(stage.id, "up")}
                          disabled={idx === 0 || busy}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveStage(stage.id, "down")}
                          disabled={idx === stages.length - 1 || busy}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startEdit(stage)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 px-2"
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteStage(stage.id)}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                          disabled={busy}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
