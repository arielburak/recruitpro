"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Lock, Globe, Send, AtSign } from "lucide-react";

interface MentionUser {
  id: string;
  name: string;
  email: string;
  type: "user" | "client";
  role?: string;
  companyName?: string;
}

interface MentionInputProps {
  onSubmit: (data: { content: string; type: "INTERNAL" | "CLIENT_VISIBLE"; mentions: string[] }) => Promise<void>;
  placeholder?: string;
  allowClients?: boolean;
  submitting?: boolean;
}

export function MentionInput({ onSubmit, placeholder = "Add a note... Use @ to mention someone", allowClients = true, submitting = false }: MentionInputProps) {
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&includeClients=${allowClients}`);
      if (res.ok) {
        const data = await res.json();
        setMentionResults([...data.users, ...data.clients]);
      }
    } catch {}
  }, [allowClients]);

  useEffect(() => {
    if (!showMentions) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchUsers(mentionQuery), 200);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [mentionQuery, showMentions, searchUsers]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setText(value);
    setCursorPosition(pos);

    // Detect @ trigger
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
    const newText = textBeforeCursor.slice(0, atIndex) + `@${user.name} ` + textAfterCursor;
    setText(newText);
    setShowMentions(false);
    if (!mentions.find((m) => m.id === user.id)) {
      setMentions([...mentions, user]);
    }
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMentions || mentionResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, mentionResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(mentionResults[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  }

  async function handleSubmit() {
    if (!text.trim()) return;
    await onSubmit({
      content: text,
      type: isPublic ? "CLIENT_VISIBLE" : "INTERNAL",
      mentions: mentions.map((m) => m.id),
    });
    setText("");
    setMentions([]);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />

        {showMentions && mentionResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full mb-1 left-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
          >
            {mentionResults.map((user, i) => (
              <button
                key={`${user.type}-${user.id}`}
                onClick={() => insertMention(user)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-indigo-50 ${
                  i === selectedIndex ? "bg-indigo-50" : ""
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0">
                  {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {user.type === "client" ? `Client · ${user.companyName || ""}` : user.role || user.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mentions.map((m) => (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                m.type === "client" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
              }`}
            >
              <AtSign className="h-3 w-3" />
              {m.name}
              <button
                onClick={() => setMentions(mentions.filter((x) => x.id !== m.id))}
                className="hover:opacity-70 ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsPublic(!isPublic)}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition ${
            isPublic
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {isPublic ? "Visible to client" : "Internal only"}
        </button>

        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          {submitting ? "Adding..." : "Add Note"}
        </Button>
      </div>
    </div>
  );
}
