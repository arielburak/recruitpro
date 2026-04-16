"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  submissionId: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/client-portal/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  }

  useEffect(() => {
    load();
    // Poll every 60s
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAllRead() {
    try {
      await fetch("/api/client-portal/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setUnreadCount(0);
      setNotifications((arr) => arr.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } catch {}
  }

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      try {
        await fetch("/api/client-portal/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [n.id] }),
        });
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((arr) =>
          arr.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
        );
      } catch {}
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No notifications yet.</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => handleClick(n)}
                        className={cn(
                          "block px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0",
                          !n.readAt && "bg-emerald-50/40"
                        )}
                      >
                        <NotificationContent n={n} />
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleClick(n)}
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0",
                          !n.readAt && "bg-emerald-50/40"
                        )}
                      >
                        <NotificationContent n={n} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationContent({ n }: { n: Notification }) {
  return (
    <div className="flex items-start gap-2.5">
      {!n.readAt && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
      <div className={cn("min-w-0 flex-1", n.readAt && "pl-3.5")}>
        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
        {n.body && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.body}</p>}
        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );
}
