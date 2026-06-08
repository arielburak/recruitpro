"use client";

import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, Lock, Globe, AtSign, Star, MessageSquare, Users } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface MentionUser {
  id: string;
  name: string;
  email: string;
  type: "user" | "client";
  role?: string;
  companyName?: string;
}

interface ChatNotesProps {
  comments: any[];
  candidateId?: string;
  // submissionId is required for the per-job chat (the canonical
  // use). When absent we treat the box as candidate-level: posts
  // only carry `candidateId`, the CLIENT_VISIBLE tab is hidden
  // because there's no client context to share with at this scope.
  submissionId?: string;
  // jobId scopes the thread to a Job (the Notes tab on /jobs/[id]).
  // Distinct from submissionId: those are tied to a candidate-on-job;
  // jobId covers standing notes about the search itself.
  jobId?: string;
  // True when the submission hasn't been shared with the client yet.
  // We still let the user read CLIENT_VISIBLE comments (there might
  // be history from a prior share) but hide the composer and the
  // tab visibility-toggle, with a hint that explains the rule:
  // "Share this candidate to start the conversation". Only applies
  // to the per-submission chat; ignored at job and candidate scope.
  clientChatLocked?: boolean;
  // Name of the client that the CLIENT_VISIBLE tab talks to. Used to
  // render "Shared with AlphaBridge" instead of the generic "Shared
  // with Client" — mirrors the client side, where the tab says
  // "Shared with Morabits" (the firm name). Optional: when missing
  // we fall back to "the client".
  clientName?: string | null;
  onCommentAdded: () => void;
  // Visual override — candidate-level notes usually live above the
  // per-job chat and don't need the full chat height.
  heightClass?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Clock time shown next to every bubble (HH:MM in the viewer's locale,
// 24h since recruiters scan a lot of messages and the colon-separated
// form is faster to parse than AM/PM).
function clockTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Tooltip on the timestamp — full date + time, used as `title`.
function fullTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Day-separator label for the divider between messages from different
// calendar days. "Today" / "Yesterday" / weekday-and-date for the
// current year / full date for older messages.
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
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
  // Estilo "Outlook chip": pill con bg sutil + bold. Variante segun
  // bubble del que vive: en bubbles oscuros (mi voz, bg saturado +
  // texto blanco) usamos bg-white/25 + texto blanco. En bubbles
  // claros (recibido, bg-gray-100) usamos bg-indigo-100 +
  // texto indigo. El resultado lee como un chip claro distinto del
  // texto normal en ambos contextos.
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

function parseComment(c: any) {
  const isClient = !!c.clientUser?.name && !c.user?.name;
  const authorName = c.user?.name || c.clientUser?.name || "Unknown";
  let displayContent = c.content;
  let rating: number | null = null;
  let parsedClientName: string | null = null;
  try {
    const parsed = JSON.parse(c.content);
    if (parsed && typeof parsed === "object") {
      displayContent = parsed.text || "";
      rating = parsed.rating;
      parsedClientName = parsed.clientName;
    }
  } catch {}
  return {
    isClient,
    authorName: parsedClientName || authorName,
    displayContent,
    rating,
    authorId: c.user?.id || c.clientUser?.id || null,
  };
}

// ── Component ──────────────────────────────────────────────────────────

export function ChatNotes({ comments, candidateId, submissionId, jobId, clientChatLocked, clientName, onCommentAdded, heightClass }: ChatNotesProps) {
  const clientLabel = clientName?.trim() || "Client";
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id || "";
  // Candidate-level scope means there's no client to share with, so
  // we lock to the INTERNAL tab and don't render the CLIENT_VISIBLE
  // one at all.
  const candidateScope = !submissionId && !!candidateId;
  const [activeTab, setActiveTab] = useState<"INTERNAL" | "CLIENT_VISIBLE">("INTERNAL");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter comments by active tab
  const filtered = comments.filter((c) => c.type === activeTab);
  const internalCount = comments.filter((c) => c.type === "INTERNAL").length;
  const clientCount = comments.filter((c) => c.type === "CLIENT_VISIBLE").length;

  // Auto-scroll to bottom on new messages or tab switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered.length, activeTab]);

  // ── Mention search ───────────────────────────────────────────────────

  // Mention picker is gated by the currently-active tab:
  //   · INTERNAL → only Users with access to this Job. No clients.
  //     Mentioning a hiring manager from an internal note would
  //     leak private context to them via the notification mail.
  //   · CLIENT_VISIBLE → Users with access to the Job PLUS hiring
  //     contacts of that Job's client only (not every engaged
  //     client). The backend (/api/users/search) does the actual
  //     scoping when we pass jobId/submissionId.
  const searchUsers = useCallback(async (query: string) => {
    try {
      const includeClients = activeTab === "CLIENT_VISIBLE";
      const params = new URLSearchParams({ q: query, includeClients: String(includeClients) });
      if (jobId) params.set("jobId", jobId);
      else if (submissionId) params.set("submissionId", submissionId);
      const res = await fetch(`/api/users/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMentionResults([...data.users, ...(includeClients ? data.clients : [])]);
      }
    } catch {}
  }, [activeTab, jobId, submissionId]);

  useEffect(() => {
    if (!showMentions) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchUsers(mentionQuery), 200);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [mentionQuery, showMentions, searchUsers]);

  // Flipping back from CLIENT_VISIBLE to INTERNAL must also drop
  // any ClientUsers the user had already picked while the comment
  // was client-visible. Without this the submit payload still
  // carries client IDs in `mentions` and the server-side notifier
  // mails them about an internal-only thread. Guarded so it doesn't
  // re-render at mount when mentions is already empty.
  useEffect(() => {
    if (activeTab !== "INTERNAL") return;
    setMentions((prev) => {
      const next = prev.filter((m) => m.type !== "client");
      return next.length === prev.length ? prev : next;
    });
  }, [activeTab]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setText(value);
    setCursorPosition(pos);

    const textBeforeCursor = value.slice(0, pos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setSelectedIndex(0);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(user: MentionUser) {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const textAfterCursor = text.slice(cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const firstName = user.name.split(" ")[0];
    const newText = textBeforeCursor.slice(0, atIndex) + `@${firstName} ` + textAfterCursor;
    setText(newText);
    setShowMentions(false);
    if (!mentions.find((m) => m.id === user.id)) {
      setMentions([...mentions, user]);
    }
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentions && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionResults[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentions(false);
        return;
      }
    }

    // Enter to send (unless shift held or mention dropdown open)
    if (e.key === "Enter" && !e.shiftKey) {
      if (showMentions && mentionResults.length > 0) {
        e.preventDefault();
        insertMention(mentionResults[selectedIndex]);
        return;
      }
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          submissionId: submissionId || undefined,
          candidateId: candidateScope ? candidateId : undefined,
          jobId: jobId || undefined,
          type: activeTab,
          mentions: mentions.map((m) => m.id),
        }),
      });
      setText("");
      setMentions([]);
      onCommentAdded();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Group consecutive messages from same author ──────────────────────

  function shouldShowHeader(index: number): boolean {
    if (index === 0) return true;
    const prev = filtered[index - 1];
    const curr = filtered[index];
    const prevParsed = parseComment(prev);
    const currParsed = parseComment(curr);
    if (prevParsed.authorId !== currParsed.authorId || prevParsed.authorName !== currParsed.authorName) return true;
    // If more than 5 min apart, show header again
    const gap = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return gap > 5 * 60 * 1000;
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col ${heightClass || "h-[400px]"} border border-gray-200 rounded-lg bg-white overflow-hidden`}>
      {/* Tab bar — candidate-scope chats only have INTERNAL, so we
          render a thinner header instead of the full tab strip. */}
      {candidateScope ? (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0 text-xs font-medium text-gray-500">
          <Lock className="h-3.5 w-3.5" />
          Internal candidate notes
          {internalCount > 0 && (
            <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600">
              {internalCount}
            </span>
          )}
        </div>
      ) : (
        <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={() => setActiveTab("INTERNAL")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              activeTab === "INTERNAL"
                ? "border-indigo-600 text-indigo-600 bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            Internal Team
            {internalCount > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === "INTERNAL" ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-600"
              }`}>
                {internalCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("CLIENT_VISIBLE")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              activeTab === "CLIENT_VISIBLE"
                ? "border-emerald-600 text-emerald-600 bg-white"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[200px]" title={`Shared with ${clientLabel}`}>
              Shared with {clientLabel}
            </span>
            {clientCount > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === "CLIENT_VISIBLE" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
              }`}>
                {clientCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
            <MessageSquare className="h-8 w-8 mb-2 text-gray-300" />
            <p>
              {activeTab === "INTERNAL"
                ? "No internal notes yet. Start the conversation."
                : "No client discussion yet. Share notes visible to clients."}
            </p>
          </div>
        ) : (
          filtered.map((c: any, idx: number) => {
            const { isClient, authorName, displayContent, rating, authorId } = parseComment(c);
            // Lado del mensaje por TEAM, no por usuario. Todos los de
            // la agencia (incluido vos) van a la derecha con bubble
            // indigo; los del cliente a la izquierda con emerald.
            // Mismo criterio mirror-ed en el client portal: ahi el
            // lado "mio" pasa a ser el del cliente. Asi el chat lee
            // siempre como "mi equipo a la derecha, los otros a la
            // izquierda" desde cualquiera de los dos portales.
            const isMyOrg = !isClient;
            const showHeader = shouldShowHeader(idx);
            // Day separator: render a centered "Today"/"Yesterday"/date
            // chip the first time we land on a new calendar day, so
            // long-running threads read like a chat-history timeline.
            const prev = idx > 0 ? filtered[idx - 1] : null;
            const showDaySeparator = !prev || !sameDay(prev.createdAt, c.createdAt);
            const isCurrentUser = authorId === currentUserId;

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
                  className={`flex ${isMyOrg ? "justify-end" : "justify-start"} ${showHeader ? "mt-3" : "mt-0.5"}`}
                >
                  <div className={`flex gap-2 max-w-[80%] ${isMyOrg ? "flex-row-reverse" : ""}`}>
                    {/* Avatar — solido para "vos" y para el cliente
                        (matchea el color del bubble). Teammates de la
                        agencia van con la version clara, asi te
                        distinguis del resto del equipo igual. */}
                    {showHeader ? (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                          isMyOrg
                            ? isCurrentUser
                              ? "bg-indigo-600 text-white"
                              : "bg-indigo-100 text-indigo-700"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {initials(authorName)}
                      </div>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}

                    {/* Message body */}
                    <div className={isMyOrg ? "text-right" : ""}>
                      {showHeader && (
                        <div className={`flex items-center gap-2 mb-0.5 ${isMyOrg ? "justify-end" : ""}`}>
                          <span className="text-xs font-semibold text-gray-700">{authorName}</span>
                          {isClient && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1 bg-emerald-50 text-emerald-600 border-emerald-200">
                              Client
                            </Badge>
                          )}
                          <span className="text-[11px] text-gray-400">{relativeTime(c.createdAt)}</span>
                        </div>
                      )}

                      {rating && (
                        <div className={`flex gap-0.5 mb-0.5 ${isMyOrg ? "justify-end" : ""}`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`h-3 w-3 ${n <= rating ? "text-yellow-500 fill-yellow-500" : "text-gray-200"}`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Bubble: lo MIO destaca con color saturado,
                          lo recibido va en gris callado. Es el patron
                          tipo WhatsApp / iMessage donde tu propia voz
                          se distingue, y lo que llega del otro queda
                          como info secundaria. Avatar + "Client" badge
                          ya marcan que el mensaje es del cliente; el
                          color saturado de ese lado generaba mucha
                          competencia visual. */}
                      {displayContent && (
                        <div className={`flex items-end gap-1.5 ${isMyOrg ? "flex-row-reverse" : ""}`}>
                          <div
                            className={`inline-block px-3 py-1.5 rounded-2xl text-sm whitespace-pre-wrap ${
                              isMyOrg
                                ? "bg-indigo-600 text-white rounded-tr-md"
                                : "bg-gray-100 text-gray-800 rounded-tl-md"
                            }`}
                          >
                            {isMyOrg ? renderMentions(displayContent, { onDark: true }) : renderMentions(displayContent)}
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
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Mentioned users chips */}
      {mentions.length > 0 && (
        <div className="px-4 py-1 flex flex-wrap gap-1 border-t border-gray-100">
          {mentions.map((m) => (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                m.type === "client" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
              }`}
            >
              <AtSign className="h-3 w-3" />
              {m.name}
              <button onClick={() => setMentions(mentions.filter((x) => x.id !== m.id))} className="hover:opacity-70 ml-0.5">
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input area. The client chat is gated behind "has this
          candidate been shared with the client yet?" — until then
          the composer is replaced by a hint that points the user
          at the share button. Internal stays open at all times. */}
      {clientChatLocked && activeTab === "CLIENT_VISIBLE" ? (
        <div className="border-t border-gray-200 p-4 bg-gray-50 shrink-0 text-center">
          <p className="text-xs text-gray-600">
            <Globe className="h-3.5 w-3.5 inline-block mr-1 align-text-bottom text-gray-400" />
            Share this candidate to start the conversation with {clientLabel}.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Use the <span className="font-medium">Share with Client</span> button on the candidate to unlock this chat.
          </p>
        </div>
      ) : (
      <div className="border-t border-gray-200 p-3 bg-gray-50 shrink-0 relative">
        {/* Mention dropdown (positioned above input). Avatar +
            label color por equipo: indigo = agencia (mi equipo desde
            esta vista), emerald = cliente. Misma paleta que ya usan
            los chat bubbles para que el cliente y la agencia se
            distingan al toque tambien en el picker. */}
        {showMentions && mentionResults.length > 0 && (
          <div className="absolute bottom-full mb-1 left-3 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {mentionResults.map((user, i) => {
              const isClient = user.type === "client";
              return (
                <button
                  key={`${user.type}-${user.id}`}
                  onClick={() => insertMention(user)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-indigo-50 ${
                    i === selectedIndex ? "bg-indigo-50" : ""
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                      isClient
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-900 truncate">{user.name}</p>
                      <span
                        className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          isClient
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-indigo-50 text-indigo-700"
                        }`}
                      >
                        {isClient ? "Client" : "Team"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {isClient ? user.companyName || user.email : user.role || user.email}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab === "INTERNAL"
                ? "Internal note... @ to mention"
                : `Note to ${clientLabel}... @ to mention`
            }
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 max-h-24 overflow-y-auto"
            onFocus={(e) => {
              e.currentTarget.rows = 2;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.value.trim()) e.currentTarget.rows = 1;
            }}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className={`shrink-0 h-9 w-9 p-0 ${
              activeTab === "CLIENT_VISIBLE"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : ""
            }`}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
            activeTab === "CLIENT_VISIBLE"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-200 text-gray-500"
          }`}>
            {activeTab === "CLIENT_VISIBLE" ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {activeTab === "CLIENT_VISIBLE" ? `Visible to ${clientLabel}` : "Internal only"}
          </span>
          <span className="text-[11px] text-gray-400">Enter to send · Shift+Enter for newline</span>
        </div>
      </div>
      )}
    </div>
  );
}
