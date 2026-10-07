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
