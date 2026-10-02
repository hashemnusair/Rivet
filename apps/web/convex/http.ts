import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string };
};

const http = httpRouter();

http.route({
  path: "/webhooks/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) return new Response("Webhook is not configured", { status: 503 });
    const webhookId = request.headers.get("svix-id");
    const timestamp = request.headers.get("svix-timestamp");
    const signature = request.headers.get("svix-signature");
    if (!webhookId || !timestamp || !signature) return new Response("Missing signature", { status: 400 });
    const payload = await request.text();
    let event: ResendEvent;
    try {
      event = new Webhook(secret).verify(payload, {
        "svix-id": webhookId,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      }) as ResendEvent;
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }
    const eventType = event.type?.trim();
    if (!eventType) return new Response("Invalid event", { status: 400 });
    const occurredAt = Date.parse(event.created_at ?? "");
    await ctx.runMutation(internal.operationalEmail.recordWebhook, {
      webhookId,
      providerId: event.data?.email_id,
      eventType,
      occurredAt: Number.isFinite(occurredAt) ? occurredAt : Date.now(),
    });
    return new Response("ok", { status: 200 });
  }),
});

// Stable, aggregate-only integration for bespoke managed gym sites.
http.route({
  path: "/api/v1/public/occupancy",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const fail = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") ?? "";
    const branchId = url.searchParams.get("branchId") ?? "";
    if (![organizationId, branchId].every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)) || [...url.searchParams.keys()].some(key => !["organizationId", "branchId"].includes(key))) return fail(400, "VALIDATION_ERROR", "Supply a gym and branch reference.");
    try {
      await ctx.runMutation(internal.attendance.publicBudget, {});
      const snapshot = await ctx.runQuery(internal.attendance.publicSnapshot, { organizationId, branchId, clockBucket: Math.floor(Date.now() / 15_000) });
      if (!snapshot) return fail(404, "NOT_FOUND", "Live occupancy is not published.");
      return new Response(JSON.stringify(snapshot), { status: 200, headers });
    } catch (error) {
      const limited = error instanceof Error && error.message.includes("RATE_LIMITED");
      return fail(limited ? 429 : 503, limited ? "RATE_LIMITED" : "UNAVAILABLE", limited ? "Please wait before refreshing." : "Live occupancy is temporarily unavailable.");
    }
  }),
});

export default http;
