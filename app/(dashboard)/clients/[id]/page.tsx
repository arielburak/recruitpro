"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Phone, Globe, ExternalLink } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

export default function ClientDetailPage() {
  const params = useParams();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${params.id}`)
      .then((r) => r.json())
      .then((data) => { setClient(data); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  if (!client) return <p className="text-gray-500">Client not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            {client.industry && <p className="text-gray-500">{client.industry}</p>}
          </div>
        </div>
        <Link href={`/jobs/new?clientId=${client.id}`}>
          <Button>Create Job for {client.name}</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {client.contactName && <p className="text-sm font-medium">{client.contactName}</p>}
            {client.contactEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${client.contactEmail}`} className="text-indigo-600 hover:underline">{client.contactEmail}</a>
              </div>
            )}
            {client.contactPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-gray-400" /> {client.contactPhone}
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-gray-400" />
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {client.website}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Client Portal Users</CardTitle></CardHeader>
          <CardContent>
            {client.clientUsers?.length === 0 ? (
              <p className="text-sm text-gray-400">No portal users yet.</p>
            ) : (
              <div className="space-y-2">
                {client.clientUsers?.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <span>{u.name} ({u.email})</span>
                    <Badge variant={u.isActive ? "default" : "secondary"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Jobs / Searches</CardTitle></CardHeader>
        <CardContent>
          {client.jobs?.length === 0 ? (
            <p className="text-sm text-gray-400">No jobs yet for this client.</p>
          ) : (
            <div className="space-y-2">
              {client.jobs?.map((j: any) => (
                <Link key={j.id} href={`/jobs/${j.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                    <div>
                      <h3 className="font-medium">{j.title}</h3>
                      <p className="text-sm text-gray-500">{j._count.submissions} candidates</p>
                    </div>
                    <Badge className={JOB_STATUS_COLORS[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
