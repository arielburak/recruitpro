"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon, Upload, Trash2, Lock } from "lucide-react";

type Props = {
  endpoint: string; // e.g. "/api/organization/logo" or "/api/client-portal/logo"
  isAdmin: boolean;
  label?: string;
  helperText?: string;
  accentColor?: "indigo" | "emerald";
};

export function LogoUploader({
  endpoint,
  isAdmin,
  label = "Company Logo",
  helperText = "Optional. Shown next to your name in the portal. PNG, JPG, WEBP or SVG, max 2 MB.",
  accentColor = "indigo",
}: Props) {
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accent =
    accentColor === "emerald"
      ? "text-emerald-600 bg-emerald-50"
      : "text-indigo-600 bg-indigo-50";
  const btnAccent =
    accentColor === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-indigo-600 hover:bg-indigo-700";

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => setLogo(data?.logo || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [endpoint]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        setLogo(data.url);
        // Notify the rest of the app so sidebar refreshes without full reload
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("logo:updated", { detail: { url: data.url } }));
        }
      }
    } catch {
      setError("Something went wrong");
    }
    setUploading(false);
  }

  async function handleRemove() {
    if (!confirm("Remove the company logo?")) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (res.ok) {
        setLogo(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("logo:updated", { detail: { url: null } }));
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to remove");
      }
    } catch {
      setError("Something went wrong");
    }
    setUploading(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className={`h-4 w-4 ${accent.split(" ")[0]}`} />
          {label}
        </CardTitle>
        {!isAdmin && (
          <Badge variant="secondary" className="text-[10px] gap-1 bg-gray-100 text-gray-500">
            <Lock className="h-3 w-3" />
            Admin only
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-gray-500 mb-4">{helperText}</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg mb-3">{error}</div>
        )}

        {loading ? (
          <div className="h-20 bg-gray-50 rounded-lg animate-pulse" />
        ) : logo ? (
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className={`h-16 w-16 rounded-lg bg-white border flex items-center justify-center overflow-hidden ${accent}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Current logo</p>
              <p className="text-xs text-gray-500">Visible next to your name in the portal.</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={uploading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ) : isAdmin ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
          >
            <Upload className="h-6 w-6 text-gray-400 mb-2" />
            <span className="text-sm text-gray-600 font-medium">
              {uploading ? "Uploading..." : "Upload a logo"}
            </span>
            <span className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP or SVG (max 2 MB)</span>
          </button>
        ) : (
          <div className="text-sm text-gray-400 text-center py-6 border border-dashed rounded-lg">
            No logo uploaded yet. Contact an admin to add one.
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />

        {/* Hidden button ref used by Replace */}
        {logo && isAdmin && uploading && (
          <p className="text-xs text-gray-400 mt-2 text-center">Uploading...</p>
        )}
      </CardContent>
    </Card>
  );
}

// Helper used in sidebar/header to listen for logo updates from the uploader.
// Pass an empty string to skip loading (e.g. on public pages).
export function useLogoUrl(endpoint: string): string | null {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoint) {
      setLogo(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(endpoint);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setLogo(data?.logo || null);
        }
      } catch {}
    }
    load();

    function onUpdate(e: Event) {
      const url = (e as CustomEvent).detail?.url;
      setLogo(url ?? null);
    }
    window.addEventListener("logo:updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("logo:updated", onUpdate);
    };
  }, [endpoint]);

  return logo;
}
