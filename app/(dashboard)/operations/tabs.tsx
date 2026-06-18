"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Building2, Users, DollarSign, AlertTriangle, Activity, TrendingUp, CheckCircle, ExternalLink } from "lucide-react";

type OpsData = {
  ceo: {
    totalAgencies: number;
    activeAgencies: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    totalSeats: number;
    recentSignups: number;
  };
  coo: {
    totalClientOrgs: number;
    totalAgencyUsers: number;
    totalClientUsers: number;
    activeJobs: number;
    totalCandidates: number;
    placementsThisMonth: number;
    silentAgencies: number;
  };
  tech: {
    activitiesLast24h: number;
    pendingInvites: number;
  };
};

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: "good" | "warn" | "bad" }) {
  const accentClass =
    accent === "good"
      ? "text-emerald-600"
      : accent === "warn"
      ? "text-amber-600"
      : accent === "bad"
      ? "text-red-600"
      : "text-gray-900";
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</p>
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function PanelLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
    >
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-gray-400" />
    </a>
  );
}

export function OperationsTabs({ data, userEmail }: { data: OpsData; userEmail: string }) {
  const [tab, setTab] = useState<"ceo" | "coo" | "tech">("ceo");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="ceo">🎩 CEO</TabsTrigger>
        <TabsTrigger value="coo">⚙️ COO</TabsTrigger>
        <TabsTrigger value="tech">🔧 Tech</TabsTrigger>
      </TabsList>

      {/* ───── CEO ───── */}
      <TabsContent value="ceo" className="space-y-4 mt-4">
        <p className="text-sm text-gray-500">Foco estratégico — números del negocio.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi
            label="Agencies totales"
            value={data.ceo.totalAgencies}
            hint={`${data.ceo.activeAgencies} con actividad última 30d`}
          />
          <Kpi
            label="Subscripciones activas"
            value={data.ceo.activeSubscriptions}
            hint={data.ceo.pastDueSubscriptions > 0 ? `${data.ceo.pastDueSubscriptions} past due ⚠️` : "todo al día"}
            accent={data.ceo.pastDueSubscriptions > 0 ? "warn" : "good"}
          />
          <Kpi
            label="Seats vendidos"
            value={data.ceo.totalSeats}
            hint="total seats facturados"
          />
          <Kpi
            label="Signups últimos 30d"
            value={data.ceo.recentSignups}
            hint="agencies nuevas"
            accent={data.ceo.recentSignups > 0 ? "good" : undefined}
          />
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">📋 Para reuniones con Ari</p>
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Sprint Notion (9 jun) cerrado 100%</li>
              <li>Pre-launch: queda decisión de billing client portal</li>
              <li>Foco: agency-first, hiring co lo recibe gratis (revisar a 6 meses)</li>
              <li>Documentos: <a href="/roadmap" className="text-indigo-600 hover:underline">ROADMAP</a></li>
            </ul>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ───── COO ───── */}
      <TabsContent value="coo" className="space-y-4 mt-4">
        <p className="text-sm text-gray-500">Operaciones — día a día del producto.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi
            label="Client orgs"
            value={data.coo.totalClientOrgs}
            hint="hiring companies"
          />
          <Kpi
            label="Agency users"
            value={data.coo.totalAgencyUsers}
            hint="recruiters activos"
          />
          <Kpi
            label="Client users"
            value={data.coo.totalClientUsers}
            hint="usuarios del client portal"
          />
          <Kpi
            label="Jobs abiertos"
            value={data.coo.activeJobs}
            hint="OPEN / ACTIVE"
          />
          <Kpi
            label="Candidates"
            value={data.coo.totalCandidates}
            hint="totales en la plataforma"
          />
          <Kpi
            label="Placements del mes"
            value={data.coo.placementsThisMonth}
            hint="cierres reales"
            accent={data.coo.placementsThisMonth > 0 ? "good" : undefined}
          />
          <Kpi
            label="Agencies silenciosas"
            value={data.coo.silentAgencies}
            hint="sin actividad última semana"
            accent={data.coo.silentAgencies > 0 ? "warn" : "good"}
          />
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">🎯 Customer success — esta semana</p>
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Revisar las {data.coo.silentAgencies} agencies silenciosas → mail proactivo</li>
              <li>Pulse-check con los primeros 3 clientes (NPS / qué mejorar)</li>
              <li>Mirar jobs con 14+ días sin candidates nuevos</li>
            </ul>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ───── Tech ───── */}
      <TabsContent value="tech" className="space-y-4 mt-4">
        <p className="text-sm text-gray-500">Salud del sistema — observabilidad.</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Kpi
            label="Actividad últimas 24h"
            value={data.tech.activitiesLast24h}
            hint="eventos en la plataforma"
          />
          <Kpi
            label="Invites pendientes"
            value={data.tech.pendingInvites}
            hint="esperando aceptación"
          />
          <Kpi label="Errores Sentry" value="—" hint="ver en panel externo →" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PanelLink
            href="https://recruiting-ats.sentry.io/issues/"
            label="🐛 Sentry — Errores en vivo"
            sub="Cualquier error real que pasen los users"
          />
          <PanelLink
            href="https://vercel.com/dashboard"
            label="🚀 Vercel — Deploys"
            sub="Status del último deploy + env vars"
          />
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">🔔 Rutina diaria — 5 min</p>
            <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>Abrir Sentry. ¿Hay issues nuevos hoy?</li>
              <li>Real → Copialo y mandáselo a Claude</li>
              <li>Ruido → click "Resolve"</li>
              <li>Vercel → último deploy "Ready"</li>
            </ol>
          </CardContent>
        </Card>
      </TabsContent>

      <div className="text-xs text-gray-400 mt-6">
        Logueado como <span className="font-mono">{userEmail}</span> · Datos en vivo desde la DB
      </div>
    </Tabs>
  );
}
