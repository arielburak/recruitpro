"use client";

// Chat-style notes thread for a ClientJob on the client portal. Same
// visual vocabulary as the agency-side ChatNotes and the per-candidate
// CandidateChat — bubble per message, day separators, HH:MM next to
// each message — so the experience is uniform across the ATS.
//
// Hard-locked to CLIENT_INTERNAL: the agency never sees these rows.
// That's why there's no tab switcher here, just a thin header
// signalling the privacy contract.

import { Fragment, useEffect, useRef, useState } from "react";
import { Lock, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Comment = {
  id: string;
  content: string;
  type: string;
  mentions: string[];
  createdAt: string;
  clientUserId: string | null;
  clientUser?: { id: string; name: string; title?: string | null } | null;
};

type Props = {
  jobId: string;
  comments: Comment[];
  onCommentAdded: () => void;
  currentClientUserId: string;
};

// ── Helpers (same vocabulary as ChatNotes / CandidateChat) ────────────

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ClientJobChat({ jobId, comments, onCommentAdded, currentClientUserId }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sorted = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sorted.length]);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/client-portal/jobs/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setText("");
        onCommentAdded();
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-[400px] border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header — single privacy line, no tab strip since this scope
          only ever holds CLIENT_INTERNAL rows. */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0 text-xs font-medium text-gray-600">
        <Lock className="h-3.5 w-3.5" />
        <span>Notes</span>
        <span className="text-gray-400 font-normal">Private to your team · the recruiting firm never sees this</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
            <MessageSquare className="h-8 w-8 mb-2 text-gray-300" />
            <p>No notes yet. Start the conversation with your team.</p>
          </div>
        ) : (
          sorted.map((c, idx) => {
            const authorName = c.clientUser?.name || "Team member";
            const authorTitle = c.clientUser?.title;
            const isCurrentUser = c.clientUserId === currentClientUserId;
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const showDaySeparator = !prev || !sameDay(prev.createdAt, c.createdAt);
            const showHeader =
              !prev ||
              prev.clientUserId !== c.clientUserId ||
              new Date(c.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000 ||
              showDaySeparator;

            return (
              <Fragment key={c.id}>
                {showDaySeparator && (
                  <div className="flex items-center gap-2 my-3" aria-hidden="true">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[11px] font-medium text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">
                      {dayLabel(c.createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <div
                  className={cn(
                    "flex",
                    isCurrentUser ? "justify-end" : "justify-start",
                    showHeader ? "mt-3" : "mt-0.5"
                  )}
                >
                  <div
                    className={cn(
                      "flex gap-2 max-w-[80%]",
                      isCurrentUser ? "flex-row-reverse" : ""
                    )}
                  >
                    {showHeader ? (
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                          isCurrentUser
                            ? "bg-emerald-600 text-white"
                            : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {initials(authorName)}
                      </div>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                    <div className={isCurrentUser ? "text-right" : ""}>
                      {showHeader && (
                        <div
                          className={cn(
                            "flex items-center gap-2 mb-0.5",
                            isCurrentUser ? "justify-end" : ""
                          )}
                        >
                          <span className="text-xs font-semibold text-gray-700">
                            {authorName}
                          </span>
                          {authorTitle && (
                            <span className="text-[11px] text-gray-400">{authorTitle}</span>
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-end gap-1.5",
                          isCurrentUser ? "flex-row-reverse" : ""
                        )}
                      >
                        <div
                          className={cn(
                            "inline-block px-3 py-1.5 rounded-2xl text-sm whitespace-pre-wrap",
                            isCurrentUser
                              ? "bg-emerald-600 text-white rounded-tr-md"
                              : "bg-gray-100 text-gray-800 rounded-tl-md"
                          )}
                        >
                          {c.content}
                        </div>
                        <span
                          className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap pb-0.5"
                          title={fullTimestamp(c.createdAt)}
                        >
                          {clockTime(c.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="border-t bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Note for your team — HM preferences, scheduling quirks, budget caveats…"
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[36px] max-h-32"
          />
          <Button
            onClick={send}
            disabled={!text.trim() || sending}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
