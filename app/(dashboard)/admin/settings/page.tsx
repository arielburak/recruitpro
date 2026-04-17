"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Video, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { FEATURES } from "@/lib/feature-flags";
import { LogoUploader } from "@/components/logo-uploader";

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto space-y-6"><h1 className="text-2xl font-bold">Settings</h1><div className="h-40 bg-gray-50 rounded-lg animate-pulse" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState(false);

  // Google Calendar integration
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    email: string | null;
    connectedAt: string | null;
  } | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // Check for callback result
  const googleParam = searchParams.get("google");

  useEffect(() => {
    fetchGoogleStatus();
  }, []);

  async function fetchGoogleStatus() {
    setLoadingGoogle(true);
    try {
      const res = await fetch("/api/integrations/google/status");
      if (res.ok) {
        setGoogleStatus(await res.json());
      }
    } catch { /* silent */ }
    setLoadingGoogle(false);
  }

  async function disconnectGoogle() {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/google/status", { method: "DELETE" });
      setGoogleStatus({ connected: false, email: null, connectedAt: null });
    } catch { /* silent */ }
    setDisconnecting(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Callback notifications */}
      {googleParam === "connected" && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 p-3 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4" />
          Google Calendar connected successfully! Interviews will now auto-generate Google Meet links.
        </div>
      )}
      {googleParam === "denied" && (
        <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 p-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" />
          Google Calendar connection was cancelled. You can try again anytime.
        </div>
      )}
      {googleParam === "error" && (
        <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          <XCircle className="h-4 w-4" />
          Failed to connect Google Calendar. Please try again.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Organization Name</Label>
            <Input defaultValue={session?.user?.organizationName || ""} disabled />
            <p className="text-xs text-gray-400">
              Contact support to change your organization name.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Logo (optional, admin only) */}
      <LogoUploader
        endpoint="/api/organization/logo"
        isAdmin={session?.user?.role === "ADMIN"}
        label="Organization Logo"
        helperText="Optional. Shown next to your firm's name in the sidebar. PNG, JPG, WEBP or SVG, max 2 MB."
        accentColor="indigo"
      />

      {/* Calendar Integrations — hidden while Google OAuth verification is pending */}
      {FEATURES.calendarIntegrations && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Calendar Integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Google Calendar / Meet */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white border flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" fill="#4285F4"/>
                    <path d="M12 2v10l8.66 5A10 10 0 0012 2z" fill="#34A853"/>
                    <path d="M12 12l8.66 5A10 10 0 0112 22V12z" fill="#FBBC05"/>
                    <path d="M12 12V2a10 10 0 00-10 10h10z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-sm">Google Calendar + Meet</h3>
                  <p className="text-xs text-gray-500">
                    Auto-create Google Meet links when scheduling interviews
                  </p>
                </div>
              </div>
              {loadingGoogle ? (
                <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
              ) : googleStatus?.connected ? (
                <Badge className="bg-green-100 text-green-700">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>

            {googleStatus?.connected ? (
              <div className="bg-green-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-800">
                    Connected as <strong>{googleStatus.email}</strong>
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  When you schedule an interview with Google Meet, a calendar event will be created automatically in your Google Calendar with a Meet link. All participants will receive an invite.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={disconnectGoogle}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Connect your Google account to automatically generate Google Meet links and create calendar events when scheduling interviews. The event will appear in your Google Calendar and invites will be sent to all participants.
                </p>
                <Button
                  onClick={() => {
                    window.location.href = "/api/integrations/google/connect";
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                  size="sm"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2" fill="white">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Connect Google Calendar
                </Button>
              </div>
            )}
          </div>

          {/* Microsoft Teams (future) */}
          <div className="border rounded-lg p-4 space-y-3 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white border flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#6264A7">
                    <path d="M20.625 7.875h-3.75V5.25a1.875 1.875 0 00-1.875-1.875h-6a1.875 1.875 0 00-1.875 1.875v2.625h-3.75A1.875 1.875 0 001.5 9.75v6a1.875 1.875 0 001.875 1.875h3.75v2.625A1.875 1.875 0 009 22.125h6a1.875 1.875 0 001.875-1.875v-2.625h3.75A1.875 1.875 0 0022.5 15.75v-6a1.875 1.875 0 00-1.875-1.875z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-sm">Microsoft Teams</h3>
                  <p className="text-xs text-gray-500">
                    Auto-create Teams meetings when scheduling interviews
                  </p>
                </div>
              </div>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Default Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Default stages applied to new jobs: Sourced, Contacted, Submitted,
            Interview, Offer, Placed. Each job can customize its own stages.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client Portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Generate shareable links for clients from any job&apos;s detail page.
            Client users can also be invited with login credentials from the
            client detail page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
