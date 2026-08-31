import { Suspense } from "react";
import type { Metadata } from "next";
import { Globe, Sparkles, UserPlus, Users } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { RegisterForm } from "@/components/auth/register-form";
import { TRIAL_DAYS } from "@/lib/constants";

// Server component — mismo motivo que /login: antes toda la página era
// client y el HTML servido venía vacío. Ver components/auth/auth-brand-panel.
//
// El form queda como client island adentro del Suspense (usa
// useSearchParams para el ?plan= y el ?email= de las invitaciones).

export const metadata: Metadata = {
  title: "Start your free trial",
  description: `Create your Recruiting ATS workspace and try it free for ${TRIAL_DAYS} days. No credit card required.`,
};

const FEATURES = [
  { icon: UserPlus, label: "Unlimited candidates & job postings" },
  { icon: Globe, label: "Built-in client portal" },
  { icon: Users, label: "Team collaboration & permissions" },
  { icon: Sparkles, label: `${TRIAL_DAYS}-day trial — no credit card required` },
];

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      <AuthBrandPanel
        headline={
          <>
            A modern ATS
            <br />
            for boutique firms
          </>
        }
        subtitle="Everything you need to run a recruiting operation — without the enterprise bloat."
      >
        <div className="space-y-5">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-indigo-200" />
              </div>
              <span className="text-indigo-50">{label}</span>
            </div>
          ))}
        </div>
      </AuthBrandPanel>

      <Suspense
        fallback={
          <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
            <div className="w-full max-w-md h-64 rounded-xl bg-gray-50 animate-pulse" />
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}
