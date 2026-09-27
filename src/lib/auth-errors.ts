// Supabase Auth's error messages are written for developers ("Invalid
// login credentials", "Email not confirmed"). These turn the ones people
// actually hit into plain guidance; anything unrecognized gets `fallback`
// rather than raw technical text.

export type AuthErrorKind = "credentials" | "unconfirmed" | "exists" | "weak_password" | "bad_email" | "rate_limit" | "network" | "other";

export interface FriendlyAuthError {
  kind: AuthErrorKind;
  message: string;
}

export function friendlyAuthError(err: unknown, fallback: string): FriendlyAuthError {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return { kind: "credentials", message: "That email and password don't match. Try again, or reset your password." };
  }
  if (m.includes("email not confirmed")) {
    return { kind: "unconfirmed", message: "Please confirm your email first — check your inbox (and spam folder) for the link." };
  }
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists")) {
    return { kind: "exists", message: "An account with this email already exists. Sign in instead." };
  }
  const min = /at least (\d+) characters/.exec(m);
  if (m.includes("password") && (min || m.includes("weak"))) {
    return { kind: "weak_password", message: min ? `Your password needs at least ${min[1]} characters.` : "Please choose a stronger password." };
  }
  if (m.includes("invalid format") || m.includes("valid email") || (m.includes("email address") && m.includes("invalid"))) {
    return { kind: "bad_email", message: "Please enter a valid email address." };
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes")) {
    return { kind: "rate_limit", message: "Too many attempts. Please wait a minute, then try again." };
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
    return { kind: "network", message: "Can't reach Invyta right now. Check your connection and try again." };
  }
  return { kind: "other", message: fallback };
}
