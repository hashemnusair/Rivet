// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { POST } from "./route";

// Public fixture only; never a provider credential.
const signingFixture = `whsec_${Buffer.from("clerk-email-test-fixture").toString("base64")}`;
const event = {
  object: "event", type: "email.created", timestamp: Date.now(),
  data: { object: "email", id: "ema_test", delivered_by_clerk: false, to_email_address: "recipient@example.test", subject: "RIVET invitation", body: '<p>Use <a href="https://example.test/invitation">this invitation</a>.</p>', body_plain: "Use https://example.test/invitation" },
};
function signedRequest(payload: unknown = event, key = signingFixture) {
  const body = JSON.stringify(payload);
  const timestamp = new Date();
  const id = "msg_fixture";
  return new NextRequest("https://www.rivetjo.com/api/webhooks/clerk-email", {
    method: "POST", body,
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": `${Math.floor(timestamp.getTime() / 1000)}`, "svix-signature": new Webhook(key).sign(id, timestamp, body) },
  });
}

beforeEach(() => {
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", signingFixture);
  vi.stubEnv("RIVET_AUTH_EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test_fixture");
  vi.stubEnv("RESEND_FROM_EMAIL", "noreply@rivetjo.com");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ id: "resend_fixture" })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Clerk authentication email through Resend", () => {
  it("forwards the rendered invitation exactly with the configured sender and a stable retry key", async () => {
    expect((await POST(signedRequest())).status).toBe(200);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.headers).toMatchObject({ "Idempotency-Key": "clerk-email/ema_test" });
    expect(JSON.parse(String(options?.body))).toEqual({ from: "noreply@rivetjo.com", to: ["recipient@example.test"], subject: event.data.subject, html: event.data.body, text: event.data.body_plain });
    expect((await POST(signedRequest())).status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).toEqual(options?.headers);
  });

  it("preserves Arabic content and supports plain-text authentication email", async () => {
    expect((await POST(signedRequest({ ...event, data: { ...event.data, subject: "رمز التحقق", body: null, body_plain: "رمز تحقق تجريبي" } }))).status).toBe(200);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({ subject: "رمز التحقق", text: "رمز تحقق تجريبي" });
    expect(payload).not.toHaveProperty("html");
  });

  it("rejects a forged signature without sending or logging authentication content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const forged = `whsec_${Buffer.from("different-public-fixture").toString("base64")}`;
    expect((await POST(signedRequest(event, forged))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("does not duplicate Clerk-owned templates during cutover or rollback", async () => {
    expect((await POST(signedRequest({ ...event, data: { ...event.data, delivered_by_clerk: true } }))).status).toBe(200);
    expect((await POST(signedRequest({ ...event, type: "user.created", data: { id: "user_fixture" } }))).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["CLERK_WEBHOOK_SIGNING_SECRET", "RIVET_AUTH_EMAIL_PROVIDER", "RESEND_API_KEY", "RESEND_FROM_EMAIL"])("requests retry when %s is missing", async (key) => {
    vi.stubEnv(key, "");
    expect((await POST(signedRequest())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an incomplete email instead of acknowledging it as sent", async () => {
    expect((await POST(signedRequest({ ...event, data: { ...event.data, to_email_address: undefined } }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([429, 500, 403])("allows webhook retries on provider HTTP %s", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("Private provider diagnostic", { status }));
    const response = await POST(signedRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("Private");
  });

  it("allows retries for network and incomplete provider responses without echoing their data", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Private provider error"));
    const response = await POST(signedRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("Private");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
    expect((await POST(signedRequest())).status).toBe(502);
  });
});

describe("RIVET-branded authentication email", () => {
  const clerkBody = "<p>Clerk-rendered body</p>";
  const clerkText = "Clerk plain body";
  const clerkEvent = (slug: string | null, data: unknown, subject = "Your RIVET sign-in email") => ({
    ...event,
    data: { ...event.data, slug, subject, body: clerkBody, body_plain: clerkText, data },
  });
  const sent = () => JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as { from: string; to: string[]; subject: string; html?: string; text?: string };

  it("sends a reset code in RIVET's own email with the code, a plain note and Clerk's subject and sender", async () => {
    expect((await POST(signedRequest(clerkEvent("reset_password_code", { otp_code: "482913" })))).status).toBe(200);
    const email = sent();
    expect(email).toMatchObject({ from: "noreply@rivetjo.com", to: ["recipient@example.test"], subject: "Your RIVET sign-in email" });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({ "Idempotency-Key": "clerk-email/ema_test" });
    expect(email.html).toContain("482913");
    expect(email.html).toContain("Your password reset code");
    expect(email.html).toContain("If you did not ask for this code, ignore this email.");
    expect(email.html).toContain("/brand/rivet-lockup.png");
    // No gym is named, so there is no gym email-preferences link to offer.
    expect(email.html).not.toContain("/settings?section=email");
    expect(email.html).not.toContain(clerkBody);
    expect(email.text).toContain("Code: 482913");
    expect(email.text).toContain("If you did not ask for this code, ignore this email.");
    expect(email.text).not.toContain(clerkText);
  });

  it.each(["verification_code", "a_future_clerk_code_template"])("treats %s as a code email whenever it carries a code", async (slug) => {
    expect((await POST(signedRequest(clerkEvent(slug, { otp_code: "000111" })))).status).toBe(200);
    const email = sent();
    expect(email.html).toContain("Your verification code");
    expect(email.html).toContain("000111");
    expect(email.text).toContain("000111");
    expect(email.html).not.toContain(clerkBody);
  });

  it("sends an invitation with one button to its link, escaped in the HTML and untouched in the text", async () => {
    const link = "https://accounts.rivetjo.com/invite?ticket=abc&redirect=1";
    expect((await POST(signedRequest(clerkEvent("organization_invitation", { action_url: link })))).status).toBe(200);
    const email = sent();
    expect(email.subject).toBe("Your RIVET sign-in email");
    expect(email.html).toContain("You are invited to RIVET");
    expect(email.html).toContain("Accept invitation");
    expect(email.html).toContain('href="https://accounts.rivetjo.com/invite?ticket=abc&amp;redirect=1"');
    expect(email.html).not.toContain(clerkBody);
    expect(email.text).toContain(`Accept invitation: ${link}`);
    expect(email.html?.match(/<a href="https:\/\/accounts/g)).toHaveLength(1);
  });

  it("names another link email by Clerk's own subject instead of calling it an invitation", async () => {
    const link = "https://accounts.rivetjo.com/magic?token=t";
    expect((await POST(signedRequest(clerkEvent("magic_link_sign_in", { action_url: link }, "Sign in to RIVET")))).status).toBe(200);
    const email = sent();
    expect(email.html).toContain("Open link");
    expect(email.html).not.toContain("You are invited");
    expect(email.html).toContain(">Sign in to RIVET</div>");
    expect(email.text).toContain(link);
  });

  it("sends the code when an email carries both a code and a link", async () => {
    expect((await POST(signedRequest(clerkEvent("verification_code", { otp_code: "246810", action_url: "https://accounts.rivetjo.com/x" })))).status).toBe(200);
    expect(sent().html).toContain("246810");
  });

  it("forwards Clerk's body unchanged for a template with no code or link", async () => {
    expect((await POST(signedRequest(clerkEvent("password_changed", { app: { name: "RIVET" } })))).status).toBe(200);
    expect(sent()).toEqual({ from: "noreply@rivetjo.com", to: ["recipient@example.test"], subject: "Your RIVET sign-in email", html: clerkBody, text: clerkText });
  });

  it.each([
    ["no data", "reset_password_code", null],
    ["no code", "reset_password_code", {}],
    ["an empty code", "reset_password_code", { otp_code: "" }],
    ["a blank code", "reset_password_code", { otp_code: "   " }],
    ["a numeric code", "reset_password_code", { otp_code: 123456 }],
    ["a null code", "verification_code", { otp_code: null }],
    ["a non-string link", "invitation", { action_url: { href: "https://accounts.rivetjo.com/invite" } }],
    ["an empty link", "organization_invitation", { action_url: "" }],
    ["a script link", "invitation", { action_url: "javascript:alert(1)" }],
    ["a non-web link", "invitation", { action_url: "ftp://example.test/invite" }],
  ])("forwards Clerk's body unchanged when %s, so no email goes out without its code or link", async (_name, slug, data) => {
    expect((await POST(signedRequest(clerkEvent(slug, data)))).status).toBe(200);
    expect(sent()).toEqual({ from: "noreply@rivetjo.com", to: ["recipient@example.test"], subject: "Your RIVET sign-in email", html: clerkBody, text: clerkText });
  });

  it("keeps Arabic subjects and plain-text-only events working on the fallback path", async () => {
    const arabic = { ...event, data: { ...event.data, slug: "reset_password_code", subject: "رمز التحقق", body: null, body_plain: "رمز تحقق تجريبي", data: {} } };
    expect((await POST(signedRequest(arabic))).status).toBe(200);
    expect(sent()).toMatchObject({ subject: "رمز التحقق", text: "رمز تحقق تجريبي" });
    expect(sent()).not.toHaveProperty("html");
  });

  it("never logs the code or the link", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    await POST(signedRequest(clerkEvent("reset_password_code", { otp_code: "482913" })));
    await POST(signedRequest(clerkEvent("invitation", { action_url: "https://accounts.rivetjo.com/invite?ticket=abc" })));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
