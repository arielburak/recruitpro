import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";

// El adapter de Prisma para Neon abre la conexión via WebSocket. En
// runtimes Node.js (CLI scripts, GitHub Actions, jobs cron de Vercel
// que NO son edge) `WebSocket` no es un global → el adapter tira
// "All attempts to open a WebSocket to connect to the database
// failed". Edge runtime y el browser ya tienen WebSocket nativo, así
// que solo importamos `ws` cuando hace falta.
if (typeof WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebSocketImpl = require("ws");
  neonConfig.webSocketConstructor = WebSocketImpl;
}

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

// El driver serverless de Neon habla su propio protocolo sobre
// WebSocket: contra un Postgres comun (dev local, docker, CI) no
// conecta nunca — falla con "All attempts to open a WebSocket to
// connect to the database failed". Produccion apunta a *.neon.tech y
// sigue yendo por Neon; para cualquier otro host usamos el adapter de
// `pg`, que ya era dependencia del proyecto. Asi se puede levantar el
// repo sin acceso a Neon y sin tocar la base de produccion.
function isNeonConnectionString(url: string) {
  try {
    return new URL(url).hostname.includes("neon.tech");
  } catch {
    return false;
  }
}

function createPrismaClient() {
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
  const adapter = isNeonConnectionString(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
