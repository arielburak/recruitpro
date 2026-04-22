"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Globe, Send, AtSign, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────
type Comment = {
  id: string;
  content: string;
  type: "CLIENT_VISIBLE" | "CLIENT_INTERNAL" | string;
  mentions?: string[];
  createdAt: string;
  clientUser: { id: string; name: string; title: string | null } | null;
  user: { id: string; name: string } | null;
};

type MentionUser = {
  id: string;
  name: string;
  email: string;
  kind: "client" | "staffing";
  title?: string | null;
};

type CandidateChatProps = {
  submissionId: string;
  comments: Comment[];
  onCommentAdded: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderMentions(text: string) {
  // Only style the @-prefixed first name. Trying to also consume a second
  // word was over-greedy and swallowed normal text following a mention
  // (e.g. "@Ariel tambien" rendered as one styled chunk). The mentioned
  // userId is stored separately on the comment, so using first-name-only
  // here doesn't break notification routing.
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-emerald-700 font-medium bg-emerald-50 px-0.5 rounded">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function CandidateChat({ submissionId, comments, onCommentAdded }: CandidateChatProps) {
  const [activeTab, setActiveTab] = useState<"CLIENT_INTERNAL" | "CLIENT_VISIBLE">("CLIENT_VISIBLE");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<Record<string, MentionUser>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter comments by tab
  const tabComments = comments.filter((c) => c.type === activeTab);
  const internalCount = comments.filter((c) => c.type === "CLIENT_INTERNAL").length;
  const sharedCount = comments.filter((c) => c.type === "CLIENT_VISIBLE").length;

  // Auto-scroll to latest on tab switch / new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTab, tabComments.length]);

  // Mentions search
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const scope = activeTab === "CLIENT_INTERNAL" ? "internal" : "shared";
    const url = `/api/client-portal/mentions/search?scope=${scope}&submissionId=${submissionId}&q=${encodeURIComponent(
      mentionQuery
    )}`;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          setMentionResults(await res.json());
        }
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, [mentionQuery, activeTab, submissionId]);

  const handleInputChange = (value: string) => {
    setInput(value);
    // Detect trailing @query
    const match = value.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const pickMention = (u: MentionUser) => {
    // Replace trailing @query with @Name
    const newVal = input.replace(/@\w*$/, `@${u.name.split(" ")[0]} `);
    setInput(newVal);
    setSelectedMentions((prev) => ({ ...prev, [u.id]: u }));
    setMentionQuery(null);
    setMentionResults([]);
    inputRef.current?.focus();
  };

  const send = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    // Only send mentions that are actually in the text
    const mentionIds = Object.values(selectedMentions)
      .filter((m) => input.includes(`@${m.name.split(" ")[0]}`))
      .map((m) => m.id);

    try {
      const res = await fetch(`/api/client-portal/candidates/${submissionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: input.trim(),
          type: activeTab,
          mentions: mentionIds,
        }),
      });
      if (res.ok) {
        setInput("");
        setSelectedMentions({});
        onCommentAdded();
      }
    } catch {}
    setSending(false);
  }, [input, sending, submissionId, activeTab, selectedMentions, onCommentAdded]);

  return (
    <div className="flex flex-col border rounded-xl bg-white">
      {/* Tabs */}
      <div className="flex border-b bg-gray-50 rounded-t-xl">
        <button
          type="button"
          onClick={() => setActiveTab("CLIENT_INTERNAL")}
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors rounded-tl-xl",
            activeTab === "CLIENT_INTERNAL"
              ? "border-amber-500 text-amber-700 bg-white"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          <Lock className="h-3.5 w-3.5" />
          Internal (Our Team)
          {internalCount > 0 && (
            <span
              className={cn(
                "ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                activeTab === "CLIENT_INTERNAL"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-200 text-gray-600"
              )}
            >
              {internalCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CLIENT_VISIBLE")}
          className={cn(
            "flex-1 px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors rounded-tr-xl",
            activeTab === "CLIENT_VISIBLE"
              ? "border-emerald-600 text-emerald-700 bg-white"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          Shared with Recruiter
          {sharedCount > 0 && (
            <span
              className={cn(
                "ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                activeTab === "CLIENT_VISIBLE"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-200 text-gray-600"
              )}
            >
              {sharedCount}
            </span>
          )}
        </button>
      </div>

      {/* Context hint */}
      <div
        className={cn(
          "px-4 py-1.5 text-[11px] flex items-center gap-1.5",
          activeTab === "CLIENT_INTERNAL"
            ? "bg-amber-50/50 text-amber-700 border-b border-amber-100"
            : "bg-emerald-50/40 text-emerald-700 border-b border-emerald-100"
        )}
      >
        {activeTab === "CLIENT_INTERNAL" ? (
          <>
            <Lock className="h-3 w-3" />
            Only your team can see these messages. The recruiter is NOT notified.
          </>
        ) : (
          <>
            <Globe className="h-3 w-3" />
            Visible to both your team and the recruiting firm.
          </>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[480px] min-h-[200px]"
      >
        {tabComments.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-center">
            <div>
              <Briefcase className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {activeTab === "CLIENT_INTERNAL"
                  ? "No internal messages yet."
                  : "No messages with the recruiter yet."}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Be the first to post below.</p>
            </div>
          </div>
        ) : (
          [...tabComments]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((c) => {
              const isStaffing = !!c.user?.name && !c.clientUser?.name;
              const authorName = c.user?.name || c.clientUser?.name || "Unknown";
              const authorTitle = c.clientUser?.title;
              return (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0",
                      isStaffing
                        ? "bg-gradient-to-br from-indigo-500 to-violet-600"
                        : "bg-gradient-to-br from-emerald-500 to-teal-600"
                    )}
                  >
                    {initials(authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{authorName}</p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[9px] h-4 px-1.5",
                          isStaffing
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {isStaffing ? "Recruiter" : "Team"}
                      </Badge>
                      {authorTitle && !isStaffing && (
                        <span className="text-[11px] text-gray-500">{authorTitle}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{relativeTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">
                      {renderMentions(c.content)}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-white rounded-b-xl relative">
        {/* Mention autocomplete */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-72 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto z-10">
            {mentionResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickMention(u)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0",
                    u.kind === "staffing"
                      ? "bg-gradient-to-br from-indigo-500 to-violet-600"
                      : "bg-gradient-to-br from-emerald-500 to-teal-600"
                  )}
                >
                  {initials(u.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {u.title ? `${u.title} · ` : ""}
                    {u.kind === "staffing" ? "Recruiter" : "Team"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="p-3 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && mentionResults.length === 0) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              activeTab === "CLIENT_INTERNAL"
                ? "Internal note for your team... use @ to mention"
                : "Message the recruiter... use @ to mention"
            }
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[40px] max-h-32"
          />
          <button
            type="button"
            onClick={() => {
              setInput((v) => v + "@");
              setMentionQuery("");
              inputRef.current?.focus();
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            title="Mention someone"
          >
            <AtSign className="h-4 w-4" />
          </button>
          <Button
            onClick={send}
            disabled={!input.trim() || sending}
            size="sm"
            className={cn(
              "gap-1.5",
              activeTab === "CLIENT_INTERNAL"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
