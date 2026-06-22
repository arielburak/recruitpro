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
