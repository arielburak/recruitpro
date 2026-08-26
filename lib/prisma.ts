import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
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

function createPrismaClient() {
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
