import { Briefcase } from "lucide-react";

// Panel de marca de las pantallas de auth (login / register).
//
// Es un server component a propósito. Antes vivía adentro del client
// component de la página, así que el HTML que servía /login y /register
// era un esqueleto vacío: el texto aparecía recién cuando corría el JS.
// Google indexaba una página en blanco y cualquiera con conexión lenta
// veía un flash gris.
//
// Sacándolo acá, el titular y las features viajan en el HTML inicial y
// la parte interactiva (el form) queda aislada en su propio island.
//
// La lista de features va por `children` en vez de por prop: login la
// muestra con checks y register con íconos por feature. Meter las dos
// variantes adentro del componente sería agregar un flag para algo que
// la composición resuelve sola — el shell (gradiente, logo, titular)
// se comparte, la lista queda donde difiere.
//
// Ojo: es `hidden lg:flex`, no se ve en mobile. Eso no le quita valor —
// el contenido igual está en el HTML que leen los crawlers.

type Props = {
  headline: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthBrandPanel({ headline, subtitle, children }: Props) {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex-col justify-between p-12">
      <div>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold">Recruiting ATS</span>
        </div>

        <h1 className="text-4xl font-bold leading-tight mb-4">{headline}</h1>
        <p className="text-indigo-100 text-lg mb-10">{subtitle}</p>

        {children}
      </div>
    </div>
  );
}
