import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/** Clerk owns identity, invitation links and verification codes. Resend only
 * transports the signed event's rendered email. Never log/persist its body in
 * the staff-visible operational outbox: it can contain authentication tokens. */
export async function POST(request: NextRequest): Promise<Response> {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim()) {
    return new Response("Email webhook is not configured", { status: 503 });
  }
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }
  if (event.type !== "email.created") return new Response("Ignored", { status: 200 });
  const email = event.data;
  // Prevent a duplicate during per-template cutover or rollback.
  if (email.delivered_by_clerk === true) return new Response("Handled by Clerk", { status: 200 });
  if (email.delivered_by_clerk !== false || !email.id || !email.to_email_address || !email.subject || (!email.body && !email.body_plain)) {
    return new Response("Incomplete email event", { status: 400 });
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (process.env.RIVET_AUTH_EMAIL_PROVIDER !== "resend" || !apiKey || !from) {
    // Acknowledge only accepted sends. Clerk/Svix can retry an outage or a
    // misconfigured cutover instead of silently losing a sign-in email.
    return new Response("Authentication email delivery is not configured", { status: 503 });
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `clerk-email/${email.id}`,
      },
      body: JSON.stringify({
        from,
        to: [email.to_email_address],
        subject: email.subject,
        ...(email.body ? { html: email.body } : {}),
        ...(email.body_plain ? { text: email.body_plain } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return new Response("Email provider did not accept the message", { status: 502 });
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) {
      return new Response("Email provider response is incomplete", { status: 502 });
    }
    return new Response("Accepted", { status: 200 });
  } catch {
    return new Response("Email provider is unavailable", { status: 502 });
  }
}
