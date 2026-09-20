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
  // El check de `.code` de arriba NO cubre PrismaClientValidationError
  // ni PrismaClientInitializationError: esos no traen `.code`, asi que
  // caian al `return error.message` del final y devolvian la
  // invocacion entera serializada al cliente — incluido el
  // `organizationId` del caller y la forma del schema. Basta con
  // mandar un `?limit=abc` o un `stageId` numerico para dispararlo.
  if (error.name.startsWith("PrismaClient")) {
    return "Something went wrong. Please try again.";
  }
  // Errores de configuracion de billing: el detalle va al log y a
  // Sentry, nunca al comprador. Ver lib/stripe.ts.
  if (error.name === "BillingConfigError") {
    return "Billing is temporarily unavailable. Please try again shortly or contact support.";
  }
  // QA HIGH #4: Stripe errors filtraban customer IDs ("No such customer:
  // cus_xxx", "No such price: price_xxx", etc.) al frontend porque el
  // Prisma check no los detectaba (Stripe codes son strings tipo
  // "resource_missing", "customer_not_found"). Detectamos Stripe error
  // shape duck-typed para no agregar Stripe SDK import acá.
  // Stripe.errors.StripeError tiene `.type` con valores enum tipo
  // 'StripeInvalidRequestError', 'StripeAPIError', 'StripeCardError'.
  const type = (error as { type?: unknown }).type;
  if (typeof type === "string" && type.startsWith("Stripe")) {
    // Card errors (declined, insufficient_funds, etc.) son seguros y
    // útiles para mostrar al user — Stripe los diseñó para ese fin.
    // El resto (API errors, invalid_request con IDs internos, etc.)
    // los reemplazamos con un genérico.
    if (type === "StripeCardError") {
      return error.message || "Your card was declined. Please try another payment method.";
    }
    return "Billing is temporarily unavailable. Please try again or contact support.";
  }
  return error.message || "Something went wrong. Please try again.";
}

// Mensaje de usuario para un ZodError.
//
// En zod 4 la propiedad es `.issues`; en zod 3 era `.errors`. El repo
// esta en zod 4.3.6, y varios handlers seguian leyendo `.errors[0]`:
// como `.errors` es `undefined`, el acceso `[0]` tiraba un TypeError
// DENTRO del catch, el 400 se perdia y el usuario recibia un 500 con
// body vacio. Pasaba en las cuatro acciones mas usadas del producto
// (crear/editar candidato, crear busqueda, crear cliente).
//
// Centralizado aca para que no haya que acordarse del nombre de la
// propiedad en cada handler.
export function zodErrorMessage(
  error: unknown,
  fallback = "Invalid input. Please check the form and try again."
): string {
  const issues = (error as { issues?: unknown; errors?: unknown })?.issues
    ?? (error as { errors?: unknown })?.errors;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { message?: unknown; path?: unknown };
    if (typeof first?.message === "string" && first.message) {
      // Para campos ausentes zod no usa el mensaje custom del schema
      // ("expected string, received undefined"), asi que anteponemos
      // el campo para que el usuario sepa cual corregir.
      const path = Array.isArray(first.path) ? first.path.join(".") : "";
      return path ? `${path}: ${first.message}` : first.message;
    }
  }
  return fallback;
}
