import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { LoginForm } from "@/components/auth/login-form";

// Server component a propósito.
//
// Antes toda la página era un client component, así que el HTML que
// servíamos era un div vacío con un skeleton y el contenido aparecía
// recién cuando corría el JS. Para un crawler la página estaba en
// blanco, y ahora que arranca el SEO eso importa.
//
// Ahora el panel de marca (titular, features) viaja en el HTML inicial
// y solo el formulario — que necesita useState / useSearchParams /
// signIn — queda como client island adentro del Suspense.
//
// El Suspense sigue siendo obligatorio: LoginForm usa useSearchParams
// para leer ?error= y ?callbackUrl=, y sin boundary Next tira error de
// prerender.

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Recruiting ATS workspace to manage candidates, jobs and clients.",
};

const FEATURES = [
  "Manage candidates, jobs & clients in one place",
  "Automated pipeline tracking & analytics",
  "Team collaboration with role-based access",
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      <AuthBrandPanel
        headline={
          <>
            The ATS built for
            <br />
            recruiting firms
          </>
        }
        subtitle="Streamline your hiring pipeline from sourcing to placement."
      >
        <div className="space-y-4">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-indigo-200 shrink-0 mt-0.5" />
              <span className="text-indigo-50">{feature}</span>
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
