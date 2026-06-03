"use client";

// Chat-style notes thread for a ClientJob on the client portal. Same
// visual vocabulary as the agency-side ChatNotes — bubble per message,
// day separators, HH:MM — so the experience is uniform across the ATS.
//
// Two tabs, same shape as the agency side:
//   · Internal team — CLIENT_INTERNAL, only the client team reads it.
//   · Shared with Agency — CLIENT_VISIBLE, the recruiting firm reads
//     and can reply from /jobs/[id] Notes on their side.

import { Fragment, useEffect, useRef, useState } from "react";
import { Lock, Globe, Send, MessageSquare } from "lucide-react";
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
  // Set when staffing posted the row (CLIENT_VISIBLE replies from
  // the recruiter side). The client portal then shows the agency
  // person's name + a "Recruiter" tag.
  userId?: string | null;
  user?: { id: string; name: string } | null;
  // For CLIENT_VISIBLE rows: which agency-side Job the message is
  // attached to. The client portal groups the "Shared with [firm]"
  // tabs by this. Null on CLIENT_INTERNAL.
  jobId?: string | null;
};

// One per accepted FirmEngagement on this ClientJob. Drives the
// "Shared with [firm]" tabs.
export type SharedAgencyTab = {
  agencyJobId: string;
  organizationId: string;
  organizationName: string;
};

type Props = {
  jobId: string;
  comments: Comment[];
  onCommentAdded: () => void;
  currentClientUserId: string;
  // One per accepted FirmEngagement. Empty array → no agency yet,
  // we hide the Shared tabs entirely. One entry → single "Shared
  // with X" tab. Many → one tab per firm so the client can address
  // each agency separately (each firm only sees its own thread).
  agencyTabs?: SharedAgencyTab[];
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

type MentionUser = {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  kind: "client";
};

export function ClientJobChat({
  jobId,
  comments,
  onCommentAdded,
  currentClientUserId,
  agencyTabs = [],
}: Props) {
  // Active tab can be:
  //   "INTERNAL"                       — Internal team chat
  //   { agencyJobId: string }          — one of the "Shared with [firm]" threads
  // Single state covers both cases. Default starts on Internal so the
  // client never lands on a Shared tab they didn't choose.
  type ActiveTab =
    | { kind: "internal" }
    | { kind: "shared"; agencyJobId: string };
  const [activeTab, setActiveTab] = useState<ActiveTab>({ kind: "internal" });
  const isInternal = activeTab.kind === "internal";
  const activeAgencyJobId =
    activeTab.kind === "shared" ? activeTab.agencyJobId : null;
  const activeAgencyName = activeAgencyJobId
    ? agencyTabs.find((t) => t.agencyJobId === activeAgencyJobId)?.organizationName ??
      "the agency"
    : null;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention picker state. Search scope is driven by the active tab:
  //   · Internal → only members of THIS ClientJob (no staffing).
  //   · Shared with Agency → also include the recruiters on the
  //     accepted engagement, so the client can arrobar a specific
  //     person at the firm.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [pickedMentions, setPickedMentions] = useState<Record<string, MentionUser>>({});

  const internalComments = comments.filter((c) => c.type === "CLIENT_INTERNAL");
  // CLIENT_VISIBLE rows grouped by agency-side jobId. One bucket per
  // engagement — the "Shared with [firm]" tabs each render their own
  // bucket so the client sees a separate thread per firm.
  const sharedByAgency = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.type !== "CLIENT_VISIBLE") continue;
    const key = c.jobId || "__unscoped__";
    const bucket = sharedByAgency.get(key);
    if (bucket) bucket.push(c);
    else sharedByAgency.set(key, [c]);
  }
  const activeBucket = isInternal
    ? internalComments
    : (activeAgencyJobId && sharedByAgency.get(activeAgencyJobId)) || [];
  const sorted = [...activeBucket].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sorted.length, activeAgencyJobId, isInternal]);

  // Debounced mention search — fires whenever the user is typing into
  // an @query at the tail of the input.
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const scope = isInternal ? "internal" : "shared";
    const qs = new URLSearchParams({
      scope,
      clientJobId: jobId,
      q: mentionQuery,
    });
    // When the Shared tab is anchored on a specific firm (the common
    // case once we render per-engagement tabs), pass agencyJobId so
    // the staffing-side users come scoped to that firm's assignees.
    if (!isInternal && activeAgencyJobId) {
      qs.set("agencyJobId", activeAgencyJobId);
    }
    const url = `/api/client-portal/mentions/search?${qs.toString()}`;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url);
        if (res.ok) setMentionResults(await res.json());
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, [mentionQuery, jobId, isInternal, activeAgencyJobId]);

  function handleTextChange(value: string) {
    setText(value);
    const match = value.match(/@(\w*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(u: MentionUser) {
    const firstName = u.name.split(" ")[0];
    const newVal = text.replace(/@\w*$/, `@${firstName} `);
    setText(newVal);
    setPickedMentions((prev) => ({ ...prev, [u.id]: u }));
    setMentionQuery(null);
    setMentionResults([]);
    textareaRef.current?.focus();
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    // Only ship the picked mentions whose @name still appears in the
    // text — the user may have deleted one before sending.
    const mentionIds = Object.values(pickedMentions)
      .filter((m) => content.includes(`@${m.name.split(" ")[0]}`))
      .map((m) => m.id);
    try {
      const res = await fetch(`/api/client-portal/jobs/${jobId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mentions: mentionIds,
          type: isInternal ? "CLIENT_INTERNAL" : "CLIENT_VISIBLE",
          // Route the message to the firm whose tab is active. The
          // server validates that this jobId really is one of the
          // ClientJob's accepted engagements before stamping.
          ...(activeAgencyJobId ? { targetAgencyJobId: activeAgencyJobId } : {}),
        }),
      });
      if (res.ok) {
        setText("");
        setPickedMentions({});
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
      {/* Tab strip. "Internal team" always shown; one "Shared with
          [firm]" tab per accepted engagement. With 2+ firms each
          tab is its own private thread — what the client posts on
          "Shared with Morabits" is invisible to "Shared with
          ConsultRecruit" and vice versa. Scroll horizontally if the
          strip overflows (rare; typical JO has 1–2 firms). */}
      <div className="flex border-b border-gray-200 bg-gray-50 shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab({ kind: "internal" })}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 shrink-0",
            isInternal
              ? "border-emerald-600 text-emerald-700 bg-white"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100",
          )}
        >
          <Lock className="h-3.5 w-3.5" />
          Internal team
          {internalComments.length > 0 && (
            <span
              className={cn(
                "ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                isInternal ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600",
              )}
            >
              {internalComments.length}
            </span>
          )}
        </button>
        {agencyTabs.map((tab) => {
          const isActive = activeAgencyJobId === tab.agencyJobId;
          const count = sharedByAgency.get(tab.agencyJobId)?.length ?? 0;
          return (
            <button
              key={tab.agencyJobId}
              type="button"
              onClick={() =>
                setActiveTab({ kind: "shared", agencyJobId: tab.agencyJobId })
              }
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 shrink-0",
                isActive
                  ? "border-indigo-600 text-indigo-700 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px]">
                Shared with {tab.organizationName}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                    isActive
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-200 text-gray-600",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
            // CLIENT_VISIBLE rows can be authored by either side.
            // Staffing-posted rows carry user.* and no clientUser,
            // so we pick whichever is set. The badge below labels
            // recruiters explicitly so the client can tell at a
            // glance who sent the message.
            const isStaffingAuthor = !c.clientUserId && !!c.userId;
            const authorName =
              c.clientUser?.name || c.user?.name || "Team member";
            const authorTitle = c.clientUser?.title;
            const isCurrentUser = c.clientUserId === currentClientUserId;
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const prevAuthor = prev?.clientUserId || prev?.userId || null;
            const currentAuthor = c.clientUserId || c.userId || null;
            const showDaySeparator = !prev || !sameDay(prev.createdAt, c.createdAt);
            const showHeader =
              !prev ||
              prevAuthor !== currentAuthor ||
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
                          {isStaffingAuthor ? (
                            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              Recruiter
                            </span>
                          ) : (
                            authorTitle && (
                              <span className="text-[11px] text-gray-400">{authorTitle}</span>
                            )
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
      <div className="border-t bg-white p-3 relative">
        {/* Mention autocomplete — anchored above the textarea. Only
            shows people who can see this Job (the search endpoint
            applies the access filter) so we can't @ someone who'd be
            blocked from reading the thread anyway. */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-10">
            {mentionResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickMention(u)}
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center gap-2 text-sm"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {u.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() || "")
                    .join("")}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{u.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {u.title ? `${u.title} · ` : ""}
                    {u.email}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInternal
                ? "Note for your team — type @ to mention someone with access to this job"
                : `Message to ${activeAgencyName} — type @ to mention a teammate or recruiter`
            }
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[36px] max-h-32"
          />
          <Button
            onClick={send}
            disabled={!text.trim() || sending}
            size="sm"
            className={cn(
              "text-white shrink-0",
              isInternal
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-indigo-600 hover:bg-indigo-700",
            )}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded",
              isInternal ? "bg-gray-200 text-gray-500" : "bg-indigo-100 text-indigo-700",
            )}
          >
            {isInternal ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            {isInternal ? "Internal only" : `Visible to ${activeAgencyName}`}
          </span>
          <span className="text-[11px] text-gray-400">Enter to send · Shift+Enter for newline</span>
        </div>
      </div>
    </div>
  );
}
