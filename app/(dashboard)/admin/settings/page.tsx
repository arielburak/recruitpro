"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

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
