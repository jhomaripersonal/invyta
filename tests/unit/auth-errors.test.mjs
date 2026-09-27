// Sign-in/sign-up error messages (src/lib/auth-errors.ts): Supabase Auth's
// developer-facing messages become plain guidance, and nothing unknown is
// shown raw. Run: pnpm test:unit
import { friendlyAuthError } from "../../src/lib/auth-errors.ts";

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${extra ? "  — " + extra : ""}`);
};

const cases = [
  ["Invalid login credentials", "credentials", "don't match"],
  ["Email not confirmed", "unconfirmed", "confirm your email"],
  ["User already registered", "exists", "already exists"],
  ["Password should be at least 6 characters.", "weak_password", "at least 6 characters"],
  ["Password is known to be weak and easy to guess, please choose a different one.", "weak_password", "stronger password"],
  ["Unable to validate email address: invalid format", "bad_email", "valid email"],
  ["Email rate limit exceeded", "rate_limit", "wait a minute"],
  ["For security purposes, you can only request this after 42 seconds.", "rate_limit", "wait a minute"],
  ["Failed to fetch", "network", "connection"],
  ["Load failed", "network", "connection"],
];
for (const [raw, kind, phrase] of cases) {
  const r = friendlyAuthError(new Error(raw), "FALLBACK");
  check(`"${raw}" → ${kind}`, r.kind === kind && r.message.includes(phrase), `${r.kind}: ${r.message}`);
}
const unknown = friendlyAuthError(new Error("Database error saving new user"), "Couldn't create your account.");
check("unknown errors use the fallback, not raw text", unknown.kind === "other" && unknown.message === "Couldn't create your account.");
check("non-Error values are handled", friendlyAuthError(undefined, "F").message === "F" && friendlyAuthError("Invalid login credentials", "F").kind === "credentials");

console.log(`\n${failures === 0 ? "ALL" : failures + " OF"} ${passes + failures} AUTH ERROR CHECKS ${failures === 0 ? "PASS" : "FAILED"}`);
if (failures) process.exit(1);
