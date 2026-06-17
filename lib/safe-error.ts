// Wrapper de error.message para que los endpoints devuelvan algo legible
// al user en vez de mensajes técnicos de Prisma / Node.
//
// Prisma errors tienen un `.code` tipo "P2002" (unique violation), "P2025"
// (record not found), etc. Esos mensajes son utilísimos para debuggear
// pero exponerlos al user del frontend filtra estructura del schema y
// queda raro ("Foreign key constraint violated on the constraint
// `User_organizationId_fkey`"). Para esos casos devolvemos un genérico.
//
// Los errores que tira el propio endpoint a mano (`throw new Error("Email
// is required")`) NO tienen `.code` — devolvemos su `.message` tal cual
// porque ya están pensados como copy al user.

export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong. Please try again.";
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.startsWith("P")) {
    // Prisma error — mensaje técnico, devolvemos genérico
    return "Something went wrong. Please try again.";
  }
  return error.message || "Something went wrong. Please try again.";
}
