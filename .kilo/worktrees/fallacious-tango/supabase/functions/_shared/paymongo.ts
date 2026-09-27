// Minimal PayMongo client for hosted Checkout Sessions, plus webhook
// signature verification. Plain Web APIs only (fetch, crypto.subtle), so
// it runs unchanged in Supabase Edge Functions (Deno) and in Node tests.
// API reference: https://developers.paymongo.com/reference

const API = "https://api.paymongo.com/v1";

function authHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

// deno-lint-ignore no-explicit-any
type Json = any;

async function call(secretKey: string, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader(secretKey), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayMongo ${res.status}: ${JSON.stringify(body?.errors ?? body)}`);
  return body;
}

export interface CheckoutParams {
  amountCentavos: number;
  name: string;
  description: string;
  paymentMethodTypes: string[];
  successUrl: string;
  cancelUrl: string;
  referenceNumber: string;
  // PayMongo metadata values must be strings.
  metadata: Record<string, string>;
}

export async function createCheckoutSession(secretKey: string, p: CheckoutParams): Promise<{ id: string; checkoutUrl: string }> {
  const body = await call(secretKey, "/checkout_sessions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ currency: "PHP", amount: p.amountCentavos, name: p.name, quantity: 1 }],
          payment_method_types: p.paymentMethodTypes,
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
          description: p.description,
          reference_number: p.referenceNumber,
          metadata: p.metadata,
          show_description: true,
          show_line_items: true,
          send_email_receipt: false,
        },
      },
    }),
  });
  return { id: body.data.id, checkoutUrl: body.data.attributes.checkout_url };
}

export async function retrieveCheckoutSession(secretKey: string, id: string): Promise<Json> {
  const body = await call(secretKey, `/checkout_sessions/${encodeURIComponent(id)}`);
  return body.data;
}

export interface PaidInfo {
  amountCentavos: number;
  providerPaymentId: string;
  paymentMethod: string | null;
}

// The successful payment inside a checkout session, if there is one.
export function paidPaymentFromSession(session: Json): PaidInfo | null {
  const payments: Json[] = session?.attributes?.payments ?? [];
  const paid = payments.find((p) => p?.attributes?.status === "paid");
  if (!paid) return null;
  return {
    amountCentavos: paid.attributes.amount,
    providerPaymentId: paid.id,
    paymentMethod: paid.attributes.source?.type ?? session.attributes?.payment_method_used ?? null,
  };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// PayMongo signs each webhook: header "Paymongo-Signature: t=<ts>,te=<sig>,li=<sig>",
// where sig = HMAC-SHA256("<ts>.<raw body>", webhook secret) — `te` for
// test-mode events, `li` for live ones. Must be checked against the raw
// request body, before any JSON parsing.
export async function verifyWebhookSignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => {
    const i = kv.indexOf("=");
    return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
  }));
  if (!parts.t) return false;
  let livemode = false;
  try {
    livemode = JSON.parse(rawBody)?.data?.attributes?.livemode === true;
  } catch {
    return false;
  }
  const provided = livemode ? parts.li : parts.te;
  if (!provided) return false;
  const expected = await hmacSha256Hex(secret, `${parts.t}.${rawBody}`);
  return timingSafeEqual(expected, provided);
}
