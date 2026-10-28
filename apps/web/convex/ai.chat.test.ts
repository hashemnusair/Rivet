// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { ChatPart, ChatStreamView, ChatThreadView, SendChatResult } from "../src/lib/ai/chat/contracts";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Tuesday 27 October 2026, 20:14 in Amman.
const NOW = new Date("2026-10-27T17:14:00.000Z");
const ORG = "chat-org";
const MAIN = "chat-main";
const SECRET = "test-only-provider-key-value";

async function seed(t: TestConvex<typeof schema>, options: { externalProcessing?: boolean; available?: boolean; capabilityModes?: Record<string, "off" | "prepare" | "execute"> } = {}) {
  await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Chat Gym", slug: "chat-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "chat-owner", authSubject: "clerk-chat-owner", email: "owner@chat.example", fullName: "Chat Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId: owner, role: "owner", branchIds: [main], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const trainer = await ctx.db.insert("users", { publicId: "chat-trainer", authSubject: "clerk-chat-trainer", email: "coach@chat.example", fullName: "Chat Coach", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId: trainer, role: "trainer", branchIds: [main], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: org, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", operationalPolicies: {} } });
    await ctx.db.insert("domainRecords", { organizationId: org, entityType: "member", publicId: "chat-member", branchId: main, memberPublicId: "chat-member", createdAt: now, updatedAt: now, data: { id: "chat-member", memberNumber: "CG-1001", fullName: "Omar Haddad", phone: "+962790000001", homeBranchId: MAIN, status: "active", preferredLanguage: "en", tags: [], outstanding: { amount: 0, currency: "JOD" }, createdAt: NOW.toISOString() } });
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: "execute", externalProcessing: options.externalProcessing ?? false, capabilityModes: options.capabilityModes ?? {}, revision: 1, updatedAt: now });
    const operator = await ctx.db.insert("users", { publicId: "chat-operator", authSubject: "clerk-chat-operator", email: "operator@chat.example", fullName: "Platform Operator", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    if (options.available !== false) await ctx.db.insert("aiAvailability", { organizationId: org, available: true, reason: "Test gym", changedByUserId: operator, changedAt: now });
    const foreign = await ctx.db.insert("organizations", { publicId: "chat-foreign", name: "Other", slug: "other", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const stranger = await ctx.db.insert("users", { publicId: "chat-stranger", authSubject: "clerk-chat-stranger", email: "x@other.example", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: foreign, userId: stranger, role: "owner", branchIds: [], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
}

const request = { organizationId: ORG, activeBranchId: MAIN, correlationId: "cor-chat" };
const as = (t: TestConvex<typeof schema>, subject = "clerk-chat-owner") => t.withIdentity({ subject });
const mutate = (t: TestConvex<typeof schema>, operation: string, input: Record<string, unknown>, subject?: string) => as(t, subject).mutation(api.domain.mutate, { operation, input, ...request });
const query = (t: TestConvex<typeof schema>, operation: string, input: Record<string, unknown>, subject?: string) => as(t, subject).query(api.domain.query, { operation, input, ...request });
const send = async (t: TestConvex<typeof schema>, input: Record<string, unknown>, subject?: string) => await mutate(t, "ai.chat.send", { clientId: "c-1", context: [], fileIds: [], locale: "en", ...input }, subject) as SendChatResult;
const respond = (t: TestConvex<typeof schema>, messageId: string, subject?: string) => as(t, subject).action(api.aiChat.respond, { ...request, messageId });
const thread = async (t: TestConvex<typeof schema>, chatId: string, subject?: string) => await query(t, "ai.chat.get", { chatId }, subject) as ChatThreadView;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Ask RIVET in preview mode", () => {
  it("saves the question, streams an answer that reads records as the person, and records usage", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar", screen: { route: "/members", title: "Members" } });
    const before = await thread(t, sent.chatId);
    expect(before.messages.map((message) => [message.role, message.status])).toEqual([["user", "complete"], ["assistant", "pending"]]);
    expect(before.source).toBe("fixture");
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "complete" });
    const after = await thread(t, sent.chatId);
    const answer = after.messages[1]!;
    expect(answer.status).toBe("complete");
    expect(answer.parts.map((part) => part.type)).toEqual(["thinking", "tool", "text"]);
    expect(answer.parts[1]).toMatchObject({ type: "tool", tool: "search_members", status: "done", input: { query: "Omar" }, outcome: { count: 1, total: 1 } });
    expect(answer.text).toContain("[Omar Haddad](rivet://member/chat-member)");
    // The stream row is gone once the answer is saved.
    expect(await query(t, "ai.chat.stream", { messageId: sent.assistantMessageId })).toBeNull();
    const usage = await t.run(async (ctx) => await ctx.db.query("aiUsage").collect());
    expect(usage.map((row) => [row.task, row.capability, row.source, row.runPublicId])).toEqual([["chat", "chat", "fixture", `chat:${sent.assistantMessageId}`], ["chat", "chat", "fixture", `chat:${sent.assistantMessageId}`]]);
    const question = await t.run(async (ctx) => await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", usage[0]!.organizationId).eq("publicId", sent.userMessageId)).unique());
    expect(question?.modelText).toContain("screen: Members · /members");
    expect(question?.modelText).toContain("person: Chat Owner · owner");
    expect((await query(t, "ai.chat.list", {})) as Array<{ id: string; title: string }>).toEqual([expect.objectContaining({ id: sent.chatId, title: "Find Omar" })]);
  });

  it("keeps each conversation private to the person who started it", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    await expect(thread(t, sent.chatId, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(query(t, "ai.chat.stream", { messageId: sent.assistantMessageId }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(mutate(t, "ai.chat.stop", { messageId: sent.assistantMessageId }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(send(t, { chatId: sent.chatId, text: "and me?" }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    expect(await respond(t, sent.assistantMessageId, "clerk-chat-trainer").catch((error: { data?: { code?: string } }) => error.data?.code)).toBe("NOT_FOUND");
    // Without a signed-in person nothing starts.
    expect(await t.action(api.aiChat.respond, { ...request, messageId: sent.assistantMessageId })).toEqual({ status: "skipped" });
    expect(await query(t, "ai.chat.list", {}, "clerk-chat-trainer")).toEqual([]);
    await expect(as(t, "clerk-chat-stranger").query(api.domain.query, { operation: "ai.chat.get", input: { chatId: sent.chatId }, correlationId: "x" })).rejects.toThrow();
  });

  it("answers within the asker's own access: a lookup they cannot make is explained, not performed", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "How much revenue did we collect this month?" }, "clerk-chat-trainer");
    await respond(t, sent.assistantMessageId, "clerk-chat-trainer");
    const answer = (await thread(t, sent.chatId, "clerk-chat-trainer")).messages[1]!;
    const tool = answer.parts.find((part): part is Extract<ChatPart, { type: "tool" }> => part.type === "tool");
    expect(tool).toMatchObject({ tool: "list_payments", status: "error", outcome: { failure: "forbidden" } });
    expect(answer.text).toContain("don't have access");
  });

  it("sends an attached record once, then tells the assistant it is already above", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const context = [{ kind: "member", id: "chat-member", label: "Omar Haddad" }];
    const first = await send(t, { text: "Brief me before I call him", context });
    await respond(t, first.assistantMessageId);
    const second = await send(t, { chatId: first.chatId, clientId: "c-2", text: "Anything else?", context });
    await respond(t, second.assistantMessageId);
    const texts = await t.run(async (ctx) => (await ctx.db.query("aiChatMessages").collect()).filter((row) => row.role === "user").map((row) => row.modelText ?? ""));
    expect(texts[0]).toContain("\"fullName\":\"Omar Haddad\"");
    expect(texts[1]).toContain("already provided earlier in this conversation");
    expect(texts[1]).not.toContain("\"fullName\"");
    // Invalid context never reaches the assistant.
    const odd = await send(t, { chatId: first.chatId, clientId: "c-3", text: "x", context: [{ kind: "secrets", label: "x" }, { kind: "member", id: "../x", label: "x" }] });
    const stored = await t.run(async (ctx) => (await ctx.db.query("aiChatMessages").collect()).find((row) => row.publicId === odd.userMessageId));
    expect(stored?.context).toEqual([]);
  });

  it("allows one answer at a time per conversation, and stops, retries and deletes on request", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    await expect(send(t, { chatId: sent.chatId, clientId: "c-2", text: "again" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    await mutate(t, "ai.chat.stop", { messageId: sent.assistantMessageId });
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "skipped" });
    expect((await thread(t, sent.chatId)).messages[1]!.status).toBe("stopped");
    const retried = await mutate(t, "ai.chat.retry", { messageId: sent.assistantMessageId }) as SendChatResult;
    expect(retried).toEqual(sent);
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "complete" });
    expect((await thread(t, sent.chatId)).messages[1]!.status).toBe("complete");
    await mutate(t, "ai.chat.delete", { chatId: sent.chatId });
    await expect(thread(t, sent.chatId)).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    expect(await t.run(async (ctx) => (await ctx.db.query("aiChatMessages").collect()).length)).toBe(0);
  });

  it("marks an answer the panel never started as failed so the conversation can continue", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    vi.setSystemTime(NOW.getTime() + 60_000);
    const organizationId = await t.run(async (ctx) => (await ctx.db.query("organizations").collect())[0]!._id);
    await t.mutation(internal.aiChat.expireUnstarted, { organizationId, messageId: sent.assistantMessageId });
    expect((await thread(t, sent.chatId)).messages[1]).toMatchObject({ status: "failed", error: "model_unavailable" });
    await send(t, { chatId: sent.chatId, clientId: "c-2", text: "Find Omar again" });
  });

  it("accepts only image and PDF uploads within the size limits, and removes the rest", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const [png, text] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" })),
      await ctx.storage.store(new Blob(["hello"], { type: "text/html" })),
    ]);
    const registered = await mutate(t, "ai.chat.file.register", { storageId: png, name: "receipt.png", mediaType: "image/png" }) as { ok: true; file: { id: string; mediaType: string } };
    expect(registered).toMatchObject({ ok: true, file: { mediaType: "image/png" } });
    const file = registered.file;
    expect(await mutate(t, "ai.chat.file.register", { storageId: png, name: "again.png", mediaType: "image/png" })).toEqual({ ok: false, reason: "unavailable" });
    expect(await mutate(t, "ai.chat.file.register", { storageId: text, name: "x.html", mediaType: "text/html" })).toEqual({ ok: false, reason: "file_type" });
    // The refused file is removed in the same write.
    expect(await t.run(async (ctx) => (await ctx.storage.get(text)) === null)).toBe(true);
    // Another person cannot send someone else's upload.
    await expect(send(t, { text: "look", fileIds: [file.id] }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    const sent = await send(t, { text: "What is this?", fileIds: [file.id] });
    await respond(t, sent.assistantMessageId);
    const message = (await thread(t, sent.chatId)).messages[0]!;
    expect(message.attachments).toEqual([expect.objectContaining({ id: file.id, name: "receipt.png", mediaType: "image/png" })]);
    expect(message.attachments[0]!.url).toBeTruthy();
  });
});

describe("Ask RIVET gates", () => {
  it("is off for a gym RIVET has not made available, and when the gym turns the conversation off", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const unavailable = convexTest(schema, modules);
    await seed(unavailable, { available: false });
    await expect(send(unavailable, { text: "hi" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "FEATURE_NOT_AVAILABLE", details: { reason: "tenant_off" } }) });
    const turnedOff = convexTest(schema, modules);
    await seed(turnedOff, { capabilityModes: { chat: "off" } });
    await expect(send(turnedOff, { text: "hi" })).rejects.toMatchObject({ data: expect.objectContaining({ details: { reason: "capability_off" } }) });
    await expect(mutate(turnedOff, "ai.chat.file.upload_url", {})).rejects.toMatchObject({ data: expect.objectContaining({ details: { reason: "capability_off" } }) });
  });

  it("stops an answer at its next step when the platform stops assistance", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    await t.run(async (ctx) => { await ctx.db.insert("aiControls", { key: "global", stopped: true, reason: "Rehearsal", changedAt: NOW.getTime() }); });
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "failed" });
    expect((await thread(t, sent.chatId)).messages[1]).toMatchObject({ status: "failed", error: "global_stop" });
  });

  it("never sends member details to a live assistant without both the gym's and RIVET's approval", async () => {
    vi.stubEnv("RIVET_AI_MODE", "live");
    vi.stubEnv("RIVET_AI_PROTOCOL", "anthropic_messages");
    vi.stubEnv("RIVET_AI_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("RIVET_AI_API_KEY", SECRET);
    vi.stubEnv("RIVET_AI_MAX_MONTHLY_COST_MICROS", "5000000");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const gymOnly = convexTest(schema, modules);
    await seed(gymOnly, { externalProcessing: true });
    await expect(send(gymOnly, { text: "hi" })).rejects.toMatchObject({ data: expect.objectContaining({ details: { reason: "data_policy" } }) });
    vi.stubEnv("RIVET_AI_PROCESSING_APPROVED", "member_data");
    const rivetOnly = convexTest(schema, modules);
    await seed(rivetOnly, { externalProcessing: false });
    await expect(send(rivetOnly, { text: "hi" })).rejects.toMatchObject({ data: expect.objectContaining({ details: { reason: "data_policy" } }) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("spends nothing once the gym's monthly limit is reached", async () => {
    vi.stubEnv("RIVET_AI_MODE", "live");
    vi.stubEnv("RIVET_AI_PROTOCOL", "anthropic_messages");
    vi.stubEnv("RIVET_AI_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("RIVET_AI_API_KEY", SECRET);
    vi.stubEnv("RIVET_AI_PROCESSING_APPROVED", "member_data");
    vi.stubEnv("RIVET_AI_MAX_MONTHLY_COST_MICROS", "1000");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const t = convexTest(schema, modules);
    await seed(t, { externalProcessing: true });
    await t.run(async (ctx) => {
      const organizationId = (await ctx.db.query("organizations").collect())[0]!._id;
      await ctx.db.insert("aiUsage", { organizationId, task: "chat", capability: "chat", source: "live", promptVersion: "x", latencyMs: 1, outcome: "ok", costMicros: 1000, month: "2026-10", createdAt: NOW.getTime() });
    });
    await expect(send(t, { text: "hi" })).rejects.toMatchObject({ data: expect.objectContaining({ details: { reason: "budget_exhausted" } }) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function sse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("Ask RIVET with Claude", () => {
  it("streams Claude's reasoning summary and answer, with a cached prompt priced at cache rates", async () => {
    vi.stubEnv("RIVET_AI_MODE", "live");
    vi.stubEnv("RIVET_AI_PROTOCOL", "anthropic_messages");
    vi.stubEnv("RIVET_AI_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("RIVET_AI_API_KEY", SECRET);
    vi.stubEnv("RIVET_AI_PROCESSING_APPROVED", "member_data");
    vi.stubEnv("RIVET_AI_MAX_MONTHLY_COST_MICROS", "5000000");
    const bodies: Array<Record<string, unknown>> = [];
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return sse([
        { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Checking Omar's record." } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "[Omar Haddad](rivet://member/chat-member) " } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "owes nothing." } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 50 } },
        { type: "message_stop" },
      ]);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const t = convexTest(schema, modules);
    await seed(t, { externalProcessing: true });
    const sent = await send(t, { text: "Does Omar owe anything?", context: [{ kind: "member", id: "chat-member", label: "Omar Haddad" }], screen: { route: "/members/chat-member", title: "Omar Haddad" } });
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "complete" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = bodies[0]!;
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", stream: true, thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "low" }, tool_choice: { type: "auto" }, cache_control: { type: "ephemeral" } });
    expect((body.system as Array<{ cache_control?: unknown }>)[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect((body.tools as unknown[]).length).toBe(17);
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain("<rivet_context>");
    expect(prompt).toContain("Omar Haddad");
    expect(prompt).not.toContain(SECRET);
    const answer = (await thread(t, sent.chatId)).messages[1]!;
    expect(answer.parts).toEqual([
      expect.objectContaining({ type: "thinking", text: "Checking Omar's record." }),
      expect.objectContaining({ type: "text", text: "[Omar Haddad](rivet://member/chat-member) owes nothing." }),
    ]);
    const usage = await t.run(async (ctx) => await ctx.db.query("aiUsage").collect());
    // 1,000 input × 2 + 2,000 cache writes × 2 × 1.25 + 50 output × 10 micro-dollars.
    expect(usage).toEqual([expect.objectContaining({ task: "chat", source: "live", outcome: "ok", inputTokens: 3000, outputTokens: 50, costMicros: 7500, model: "claude-sonnet-5-5" })]);
    const stored = JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("aiChatMessages").collect(), usage]));
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain("sig");
  });

  it("reports a provider failure safely and keeps the conversation usable", async () => {
    vi.stubEnv("RIVET_AI_MODE", "live");
    vi.stubEnv("RIVET_AI_PROTOCOL", "anthropic_messages");
    vi.stubEnv("RIVET_AI_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("RIVET_AI_API_KEY", SECRET);
    vi.stubEnv("RIVET_AI_PROCESSING_APPROVED", "member_data");
    vi.stubEnv("RIVET_AI_MAX_MONTHLY_COST_MICROS", "5000000");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: `Overloaded ${SECRET}` } }), { status: 529, headers: { "content-type": "application/json" } })));
    const t = convexTest(schema, modules);
    await seed(t, { externalProcessing: true });
    const sent = await send(t, { text: "hi" });
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "failed" });
    expect((await thread(t, sent.chatId)).messages[1]).toMatchObject({ status: "failed", error: "model_unavailable" });
    expect(JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("aiChatMessages").collect(), await ctx.db.query("aiUsage").collect()]))).not.toContain(SECRET);
  });
});

describe("Ask RIVET streaming rows", () => {
  it("keeps the newest progress only and reports a requested stop", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    const organizationId = await t.run(async (ctx) => (await ctx.db.query("organizations").collect())[0]!._id);
    expect(await t.mutation(internal.aiChat.claimTurn, { organizationId, messageId: sent.assistantMessageId })).toBe(true);
    expect(await t.mutation(internal.aiChat.claimTurn, { organizationId, messageId: sent.assistantMessageId })).toBe(false);
    await t.mutation(internal.aiChat.writeStream, { organizationId, messageId: sent.assistantMessageId, parts: [{ type: "text", id: "p", text: "newer" }], version: 2 });
    expect(await t.mutation(internal.aiChat.writeStream, { organizationId, messageId: sent.assistantMessageId, parts: [{ type: "text", id: "p", text: "older" }], version: 1 })).toEqual({ stop: false });
    const stream = await query(t, "ai.chat.stream", { messageId: sent.assistantMessageId }) as ChatStreamView;
    expect(stream).toMatchObject({ status: "streaming", version: 2, parts: [{ text: "newer" }] });
    await mutate(t, "ai.chat.stop", { messageId: sent.assistantMessageId });
    expect(await t.mutation(internal.aiChat.writeStream, { organizationId, messageId: sent.assistantMessageId, parts: [{ type: "text", id: "p", text: "newer" }], version: 3 })).toEqual({ stop: true });
    // A stalled answer keeps what it showed and is marked failed.
    vi.setSystemTime(NOW.getTime() + 4 * 60_000);
    await t.mutation(internal.aiChat.expireStalled, { organizationId, messageId: sent.assistantMessageId });
    expect((await thread(t, sent.chatId)).messages[1]).toMatchObject({ status: "failed", error: "deadline", text: "newer" });
  });

  it("removes conversations past retention with their files", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const png = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })));
    const { file } = await mutate(t, "ai.chat.file.register", { storageId: png, name: "a.png", mediaType: "image/png" }) as { file: { id: string } };
    await send(t, { text: "look", fileIds: [file.id] });
    vi.setSystemTime(NOW.getTime() + 31 * 86_400_000);
    expect(await t.mutation(internal.aiChat.expireChats, {})).toBe(1);
    expect(await t.run(async (ctx) => [(await ctx.db.query("aiChats").collect()).length, (await ctx.db.query("aiChatFiles").collect()).length, await ctx.storage.get(png)])).toEqual([0, 0, null]);
  });
});

describe("Wazen changes the person confirms", () => {
  const MEMBER = { kind: "member", id: "chat-member", label: "Omar Haddad" };

  /** A 30-day plan with 14 freeze days, and Omar's term from 10 October to 9 November. */
  async function seedTerm(t: TestConvex<typeof schema>) {
    await t.run(async (ctx) => {
      const organizationId = (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ORG)).unique())!._id;
      const branchId = (await ctx.db.query("branches").collect()).find((branch) => branch.publicId === MAIN)!._id;
      await ctx.db.insert("domainRecords", { organizationId, entityType: "plan", publicId: "chat-plan", branchId, createdAt: NOW.getTime(), updatedAt: NOW.getTime(), data: { id: "chat-plan", name: "Monthly", code: "M1", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 14, includedPtSessions: 0, status: "active" } });
    });
    const sale = await mutate(t, "memberships.sale", { memberId: "chat-member", planId: "chat-plan", startDate: "2026-10-10", overrideReason: "Term started before the test", idempotencyKey: "chat-sale" }) as { membership: { id: string; endDate: string } };
    return sale.membership;
  }

  async function propose(t: TestConvex<typeof schema>, text: string, chatId?: string) {
    const sent = await send(t, { text, context: [MEMBER], clientId: `c-${text.length}`, ...(chatId ? { chatId } : {}) });
    expect(await respond(t, sent.assistantMessageId)).toEqual({ status: "complete" });
    const answer = (await thread(t, sent.chatId)).messages.find((message) => message.id === sent.assistantMessageId)!;
    const part = answer.parts.find((item): item is Extract<ChatPart, { type: "tool" }> => item.type === "tool" && Boolean(item.action));
    return { sent, answer, part };
  }

  const terms = async (t: TestConvex<typeof schema>) => ((await query(t, "memberships.list", { memberId: "chat-member", sort: "startDate" })) as { items: Array<{ startDate: string; endDate: string }> }).items;

  it("proposes a renewal, changes nothing until confirmed, then renews as the person with an audit", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const term = await seedTerm(t);
    const { sent, part } = await propose(t, "Renew his membership");
    expect(part?.action).toMatchObject({ kind: "renew_membership", memberId: "chat-member", membershipId: term.id, planName: "Monthly", startDate: "2026-11-10", endDate: "2026-12-10", price: { amount: 40_000, currency: "JOD" }, status: "proposed", basis: { endDate: term.endDate } });
    expect(await terms(t)).toHaveLength(1);

    // Another person cannot decide on this conversation's card.
    await expect(mutate(t, "ai.chat.action", { messageId: sent.assistantMessageId, partId: part!.id, decision: "confirm" }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });

    const done = await mutate(t, "ai.chat.action", { messageId: sent.assistantMessageId, partId: part!.id, decision: "confirm" }) as { status: string; result: unknown };
    expect(done).toMatchObject({ status: "done", result: { startDate: "2026-11-10", endDate: "2026-12-10", amount: { amount: 40_000, currency: "JOD" } } });
    expect((await terms(t)).map((item) => item.startDate)).toEqual(["2026-10-10", "2026-11-10"]);
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((row) => row.action));
    expect(audit).toEqual(expect.arrayContaining(["ai.chat.action.confirm"]));
    // A decided card cannot run twice.
    await expect(mutate(t, "ai.chat.action", { messageId: sent.assistantMessageId, partId: part!.id, decision: "confirm" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    expect(await terms(t)).toHaveLength(2);

    // The next message tells the assistant what was decided.
    const next = await send(t, { chatId: sent.chatId, text: "Thanks", clientId: "c-next" });
    await respond(t, next.assistantMessageId);
    const question = await t.run(async (ctx) => (await ctx.db.query("aiChatMessages").collect()).find((row) => row.publicId === next.userMessageId));
    expect(question?.modelText).toContain("earlier proposals:");
    expect(question?.modelText).toContain("renew for Omar Haddad (member chat-member): confirmed and saved");
  });

  it("dismisses without changing anything, and refuses stale or changed cards", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const term = await seedTerm(t);

    const renewal = await propose(t, "Renew his membership");
    expect(await mutate(t, "ai.chat.action", { messageId: renewal.sent.assistantMessageId, partId: renewal.part!.id, decision: "dismiss" })).toMatchObject({ status: "dismissed" });
    await expect(mutate(t, "ai.chat.action", { messageId: renewal.sent.assistantMessageId, partId: renewal.part!.id, decision: "confirm" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    expect(await terms(t)).toHaveLength(1);

    const freeze = await propose(t, "Freeze his membership for 7 days because of travel", renewal.sent.chatId);
    expect(freeze.part?.action).toMatchObject({ kind: "freeze_membership", freezeStart: "2026-10-27", freezeEnd: "2026-11-02", days: 7, newEndDate: "2026-11-16", reason: "travel" });
    // The term changed after Wazen read it: the card is refused and nothing is frozen.
    await mutate(t, "memberships.extend", { membershipId: term.id, days: 3, reason: "Goodwill" });
    await expect(mutate(t, "ai.chat.action", { messageId: freeze.sent.assistantMessageId, partId: freeze.part!.id, decision: "confirm" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    expect((await terms(t))[0]).toMatchObject({ endDate: "2026-11-12" });

    // A fresh card works until it is half an hour old.
    const again = await propose(t, "Freeze his membership for 7 days because of travel", renewal.sent.chatId);
    vi.setSystemTime(NOW.getTime() + 31 * 60_000);
    await expect(mutate(t, "ai.chat.action", { messageId: again.sent.assistantMessageId, partId: again.part!.id, decision: "confirm" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    vi.setSystemTime(NOW);
    const latest = await propose(t, "Freeze his membership for 7 days because of travel", renewal.sent.chatId);
    expect(await mutate(t, "ai.chat.action", { messageId: latest.sent.assistantMessageId, partId: latest.part!.id, decision: "confirm" })).toMatchObject({ status: "done", result: { endDate: "2026-11-19" } });
  });

  it("does not propose a change the person cannot make", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    await seedTerm(t);
    const sent = await send(t, { text: "Renew his membership", context: [MEMBER] }, "clerk-chat-trainer");
    await respond(t, sent.assistantMessageId, "clerk-chat-trainer");
    const answer = (await thread(t, sent.chatId, "clerk-chat-trainer")).messages[1]!;
    expect(answer.parts.some((part) => part.type === "tool" && part.action)).toBe(false);
    expect(await terms(t)).toHaveLength(1);
  });

  it("renames a conversation for its owner only", async () => {
    vi.stubEnv("RIVET_AI_MODE", "fixture");
    const t = convexTest(schema, modules);
    await seed(t);
    const sent = await send(t, { text: "Find Omar" });
    await expect(mutate(t, "ai.chat.rename", { chatId: sent.chatId, title: "Mine now" }, "clerk-chat-trainer")).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(mutate(t, "ai.chat.rename", { chatId: sent.chatId, title: "   " })).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    expect(await mutate(t, "ai.chat.rename", { chatId: sent.chatId, title: "  Omar's renewal\n" })).toMatchObject({ title: "Omar's renewal" });
    expect((await thread(t, sent.chatId)).title).toBe("Omar's renewal");
  });
});
