"use client";

// Organization-wide settings. Admin only.

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoUploader } from "@/components/logo-uploader";

export default function OrganizationSettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-gray-500">
          Organization settings are only visible to admins.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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

      <LogoUploader
        endpoint="/api/organization/logo"
        isAdmin={isAdmin}
        label="Organization Logo"
        helperText="Optional. Shown next to your firm's name in the sidebar. PNG, JPG, WEBP or SVG, max 2 MB."
        accentColor="indigo"
      />
    </div>
  );
}
