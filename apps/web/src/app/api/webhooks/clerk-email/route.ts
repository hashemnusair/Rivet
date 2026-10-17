import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { createTranslator } from "@/lib/i18n/core";
import { rivetSender } from "@/lib/release/beta";
import { renderBrandedEmail, type RenderedEmail } from "../../../../../convex/emailTemplate";

export const runtime = "nodejs";

const INVITATION_SLUGS = new Set(["invitation", "organization_invitation"]);

/**
 * RIVET's own version of an email that carries a code or a link, or `null` to
 * send Clerk's rendered email as it is. The code or link is the point of the
 * message, so anything else (an unknown template, a missing, empty or
 * non-string field, a link that is not http(s), or a render that somehow lost
 * it) falls back to Clerk's body rather than send an email without it.
 *
 * The event names no language, so this is English, and no gym, so the footer
 * has no gym email-preferences link.
 */
function brandedEmail(slug: string | null | undefined, data: Record<string, unknown> | null | undefined, subject: string): RenderedEmail | null {
  const code = typeof data?.otp_code === "string" ? data.otp_code.trim() : "";
  const link = typeof data?.action_url === "string" ? data.action_url.trim() : "";
  const t = createTranslator("en");
  const base = { language: "en", audience: "member", paragraphs: [] as string[] } as const;
  try {
    if (code) {
      const rendered = renderBrandedEmail(subject, {
        ...base,
        headline: t(slug === "reset_password_code" ? "auth.email.resetCodeHeadline" : "auth.email.codeHeadline"),
        rows: [{ label: t("auth.email.codeLabel"), value: code, mono: true }],
        note: t("auth.email.codeNote"),
      });
      return rendered.text.includes(code) && rendered.html.includes(code) ? rendered : null;
    }
    if (/^https?:\/\//i.test(link)) {
      const invitation = INVITATION_SLUGS.has(slug ?? "");
      const rendered = renderBrandedEmail(subject, {
        ...base,
        // Another link email (a magic link, say) is named by Clerk's own subject.
        headline: invitation ? t("auth.email.invitationHeadline") : subject,
        button: { label: t(invitation ? "auth.email.invitationButton" : "auth.email.linkButton"), href: link },
      });
      return rendered.text.includes(link) ? rendered : null;
    }
  } catch {
    // Fall through to Clerk's email; never log what it carried.
  }
  return null;
}

/** Clerk owns identity, invitation links and verification codes. Resend only
 * transports the signed event's email: RIVET's branded version when it carries
 * a code or link, otherwise Clerk's rendered body. Never log/persist either in
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
  const branded = brandedEmail(email.slug, email.data, email.subject);
  const html = branded ? branded.html : email.body;
  const text = branded ? branded.text : email.body_plain;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `clerk-email/${email.id}`,
      },
      body: JSON.stringify({
        from: rivetSender(from),
        to: [email.to_email_address],
        subject: email.subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
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
