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

export default http;
