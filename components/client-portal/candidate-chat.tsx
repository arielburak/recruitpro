"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
  // Name of the firm that shared this candidate. Drives the "Shared
  // with [firm]" tab + composer labels, same way the client-portal
  // Job chat names its agency-side tabs. Falls back to "the
  // recruiter" when missing.
  firmName?: string | null;
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

// Clock time (HH:MM, 24h) shown alongside every message — matches the
// agency-side ChatNotes so the experience is uniform across the ATS.
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

// Day-separator label for the divider rendered between messages from
// different calendar days. Same vocabulary as the agency side.
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

function renderMentions(text: string, opts: { onDark?: boolean } = {}) {
  // Only style the @-prefixed first name. Trying to also consume a second
  // word was over-greedy and swallowed normal text following a mention
  // (e.g. "@Ariel tambien" rendered as one styled chunk). The mentioned
  // userId is stored separately on the comment, so using first-name-only
  // here doesn't break notification routing.
  //
  // Estilo "Outlook chip": pill con bg sutil + bold. Mirror del helper
  // en components/chat-notes.tsx — bubble oscuro (mi voz, emerald-600
  // en client view) usa bg-white/25 + texto blanco; bubble claro
  // (recibido de la agencia, bg-gray-100) usa bg-indigo-100 + indigo
  // texto.
  const chipClass = opts.onDark
    ? "bg-white/25 text-white font-semibold px-1.5 py-px rounded"
    : "bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-px rounded";
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className={chipClass}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export function CandidateChat({ submissionId, comments, onCommentAdded, firmName }: CandidateChatProps) {
  const firmLabel = firmName?.trim() || "the recruiter";
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id || "";
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
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={`Shared with ${firmLabel}`}>
            Shared with {firmLabel}
          </span>
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
            Visible to your team and {firmLabel}.
          </>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 max-h-[480px] min-h-[200px]"
      >
        {tabComments.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-center">
            <div>
              <Briefcase className="block h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                {activeTab === "CLIENT_INTERNAL"
                  ? "No internal messages yet."
                  : "No messages with the recruiter yet."}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Be the first to post below.</p>
            </div>
          </div>
        ) : (
          (() => {
            const sorted = [...tabComments].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            return sorted.map((c, idx) => {
              const isStaffing = !!c.user?.name && !c.clientUser?.name;
              const authorName = c.user?.name || c.clientUser?.name || "Unknown";
              const authorTitle = c.clientUser?.title;
              // Mirror exacto de chat-notes.tsx: lados POR EQUIPO, no
              // por usuario individual. Desde el client portal, mi
              // equipo (cliente) va a la derecha con bubble emerald;
              // la agencia a la izquierda con bubble indigo. Colores
              // por equipo son los mismos que del lado agencia,
              // sides invertidos.
              const isMyOrg = !isStaffing;
              const isCurrentUser = !!currentUserId && c.clientUser?.id === currentUserId;
              // Day separator before the first message of each calendar day.
              const prev = idx > 0 ? sorted[idx - 1] : null;
              const showDaySeparator = !prev || !sameDay(prev.createdAt, c.createdAt);
              const prevSameAuthor = prev && (
                (prev.user?.id && prev.user.id === c.user?.id) ||
                (prev.clientUser?.id && prev.clientUser.id === c.clientUser?.id)
              );
              const showHeader = !prev || !prevSameAuthor || !sameDay(prev.createdAt, c.createdAt);
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
                      isMyOrg ? "justify-end" : "justify-start",
                      showHeader ? "mt-3" : "mt-0.5"
                    )}
                  >
                    <div className={cn("flex gap-2 max-w-[80%]", isMyOrg && "flex-row-reverse")}>
                      {/* Avatar — solido para "vos" y para la agencia
                          (matchea el color del bubble). Teammates del
                          mismo cliente van con la version clara, asi
                          te distinguis del resto del equipo igual. */}
                      {showHeader ? (
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                            isMyOrg
                              ? isCurrentUser
                                ? "bg-emerald-600 text-white"
                                : "bg-emerald-100 text-emerald-700"
                              : "bg-indigo-600 text-white"
                          )}
                        >
                          {initials(authorName)}
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}

                      {/* Message body */}
                      <div className={isMyOrg ? "text-right" : ""}>
                        {showHeader && (
                          <div className={cn("flex items-center gap-2 mb-0.5 flex-wrap", isMyOrg && "justify-end")}>
                            <span className="text-xs font-semibold text-gray-700">{authorName}</span>
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
                            <span className="text-[11px] text-gray-400">{relativeTime(c.createdAt)}</span>
                          </div>
                        )}

                        {/* Bubble: lo MIO destaca con color saturado,
                            lo recibido va en gris callado. Mirror del
                            criterio en chat-notes.tsx (agency side):
                            ahi el cliente se ve en gris; aca la
                            agencia se ve en gris. Mismo patron en
                            ambos portales: tu voz dominante, la del
                            otro como info secundaria. */}
                        {c.content && (
                          <div className={cn("flex items-end gap-1.5", isMyOrg && "flex-row-reverse")}>
                            <div
                              className={cn(
                                "inline-block px-3 py-1.5 rounded-2xl text-sm whitespace-pre-wrap",
                                isMyOrg
                                  ? "bg-emerald-600 text-white rounded-tr-md"
                                  : "bg-gray-100 text-gray-800 rounded-tl-md"
                              )}
                            >
                              {isMyOrg ? renderMentions(c.content, { onDark: true }) : renderMentions(c.content)}
                            </div>
                            <span
                              className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap pb-0.5"
                              title={fullTimestamp(c.createdAt)}
                            >
                              {clockTime(c.createdAt)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            });
          })()
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-white rounded-b-xl relative">
        {/* Mention autocomplete */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-72 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto z-10">
            {mentionResults.map((u) => {
              const isStaffing = u.kind === "staffing";
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pickMention(u)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      isStaffing
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-emerald-100 text-emerald-700"
                    )}
                  >
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-900 truncate">{u.name}</p>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0",
                          isStaffing
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {isStaffing ? "Recruiter" : "Team"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {u.title ? u.title : isStaffing ? "Agency" : "Client team"}
                    </p>
                  </div>
                </button>
              );
            })}
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
                : `Message ${firmLabel}... use @ to mention`
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
