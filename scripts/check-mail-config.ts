/**
 * Read-only diagnostic for outbound-mail config. Prints which env
 * vars are set / unset and what lib/email.ts will actually do with
 * them, without ever logging the secret values.
 *
 * Run once per environment to confirm staging/prod can actually
 * send mail before doing live tests:
 *   npx tsx scripts/check-mail-config.ts
 *
 * Or against a specific Vercel env file:
 *   dotenv -e .env.staging -- npx tsx scripts/check-mail-config.ts
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

function present(name: string): "set" | "unset" {
  const v = process.env[name];
  return v && v.length > 0 ? "set" : "unset";
}

function mask(name: string) {
  const v = process.env[name] || "";
  if (!v) return "(unset)";
  if (v.length <= 6) return "***";
  return `${v.slice(0, 3)}…${v.slice(-2)} (len ${v.length})`;
}

const apiKey = present("RESEND_API_KEY");
const from = process.env.EMAIL_FROM || "(unset → noreply@recruitingats.com default)";
const disabled =
  process.env.DISABLE_OUTBOUND_EMAIL === "1" ||
  process.env.DISABLE_OUTBOUND_EMAIL === "true";
const allowlistRaw = process.env.EMAIL_ALLOWLIST || "";
const allowlist = allowlistRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("============================================");
console.log(" Mail config diagnostic");
console.log("============================================");
console.log(` NODE_ENV               ${process.env.NODE_ENV || "(unset)"}`);
console.log(` VERCEL_ENV             ${process.env.VERCEL_ENV || "(unset)"}`);
console.log(` RESEND_API_KEY         ${apiKey} ${apiKey === "set" ? mask("RESEND_API_KEY") : ""}`);
console.log(` EMAIL_FROM             ${from}`);
console.log(` DISABLE_OUTBOUND_EMAIL ${disabled ? "1 (DROPS ALL MAIL)" : "(unset → mail can go out)"}`);
console.log(` EMAIL_ALLOWLIST        ${allowlist.length === 0 ? "(unset → no restriction)" : allowlist.join(", ")}`);
console.log("");

// Translate the booleans above into the actual behavior of
// lib/email.ts so the user sees "what will happen" instead of
// having to mentally re-execute the conditions.
let verdict: string;
if (disabled) {
  verdict = "DROPPED. Every send is logged but nothing goes out. Unset DISABLE_OUTBOUND_EMAIL to fix.";
} else if (apiKey === "unset") {
  verdict =
    "DROPPED. No RESEND_API_KEY → email.ts logs the body and returns skipped:'no_key'. Set RESEND_API_KEY.";
} else if (allowlist.length > 0) {
  verdict =
    `RESTRICTED. Only ${allowlist.length} address(es) get mail: ${allowlist.join(", ")}. Everything else dropped.`;
} else {
  verdict = "LIVE. Mail goes to any recipient via Resend.";
}
console.log(`Verdict: ${verdict}`);
