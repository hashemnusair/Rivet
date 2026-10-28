import { describe, expect, it } from "vitest";
import { chatAnswerText, chatContextKey, type ChatPart } from "./contracts";
import { moneyText, serialize } from "./compact";
import { ChatReadError, loadSource, parseContextItem, type ChatEnv, type ChatReader, type ChatReadOperation } from "./sources";
import { CHAT_TOOLS, recordHref, runChatTool, screenLink } from "./tools";
import { attachedOf, CHAT_SYSTEM_PROMPT, composeUserTurn, messageOf, readableAreas, sentContextKeys } from "./prompt";
import { buildHistory, EARLIER_LEFT_OUT, turnsWithFiles, type StoredChatTurn } from "./history";
import { ChatModelError, runChatTurn, withoutThinking, type ChatModel, type ChatTurnHooks, type ChatUsage, type ModelMessage } from "./engine";
import { fixtureChatModel } from "./fixture-model";
import { healMarkdown, revealStep, splitBlocks } from "./streaming";

const ENV: ChatEnv = { today: "2026-10-27", timezone: "Asia/Amman", currency: "JOD", activeBranchId: "br-main", branchIds: ["br-main"] };

const MEMBERS = [
  { id: "m-1", memberNumber: "IT-1001", fullName: "Ahmad Khalil", phone: "+962790000001", status: "active", membershipStatus: "expiring", currentPlanName: "Monthly", membershipEndDate: "2026-10-30", outstanding: { amount: 25_000, currency: "JOD" }, photoUrl: "https://example.com/a.png", organizationId: "org", tags: [] },
  { id: "m-2", memberNumber: "IT-1002", fullName: "Rana Saleh", phone: "+962790000002", status: "active", membershipStatus: "active", currentPlanName: "Annual", membershipEndDate: "2027-03-01", outstanding: { amount: 0, currency: "JOD" }, tags: ["vip"] },
];

function reader(overrides: Partial<Record<ChatReadOperation, (input: Record<string, unknown>) => unknown>> = {}): ChatReader & { calls: Array<{ operation: string; input: Record<string, unknown> }> } {
  const calls: Array<{ operation: string; input: Record<string, unknown> }> = [];
  const defaults: Partial<Record<ChatReadOperation, (input: Record<string, unknown>) => unknown>> = {
    "members.list": (input) => ({ items: input.membershipStatus === "outstanding" ? [MEMBERS[0]] : MEMBERS, totalItems: input.membershipStatus === "outstanding" ? 1 : 42, page: 1, pageSize: 25, totalPages: 2 }),
    "members.get": (input) => {
      const member = MEMBERS.find((row) => row.id === input.memberId);
      if (!member) throw new ChatReadError("not_found");
      return { ...member, stats: { checkInsLast30Days: 6, totalCheckIns: 80, lifetimeValue: { amount: 420_000, currency: "JOD" }, outstanding: member.outstanding } };
    },
    "tasks.list": () => ({ items: [{ id: "t-1", title: "Call about renewal", subjectName: "Ahmad Khalil", dueAt: "2026-10-28T09:00:00.000Z", status: "open", organizationId: "org" }], totalItems: 1 }),
    "members.timeline": () => ({ items: [{ id: "e-1", type: "call", title: "Called, no answer", occurredAt: "2026-10-20T10:00:00.000Z", organizationId: "org" }], totalItems: 1 }),
    "renewal.queue": () => ({ items: [{ member: MEMBERS[0], membership: { planName: "Monthly", endDate: "2026-10-30", status: "expiring", paymentStatus: "partially_paid" }, daysUntilExpiry: 3 }], totalItems: 1 }),
    "transactions.list": (input) => ({ items: input.memberId ? [] : [
      { id: "p-1", occurredAt: "2026-10-26T10:00:00.000Z", memberName: "Rana Saleh", type: "payment", amount: { amount: 40_000, currency: "JOD" }, method: "cash", status: "completed", idempotencyKey: "secret-key" },
      { id: "p-2", occurredAt: "2026-10-25T10:00:00.000Z", memberName: "Ahmad Khalil", type: "payment", amount: { amount: 15_500, currency: "JOD" }, method: "card", status: "completed" },
      { id: "p-3", occurredAt: "2026-10-24T10:00:00.000Z", memberName: "Ahmad Khalil", type: "refund", amount: { amount: -5_000, currency: "JOD" }, method: "cash", status: "completed" },
      { id: "p-4", occurredAt: "2026-10-23T10:00:00.000Z", memberName: "Ahmad Khalil", type: "payment", amount: { amount: 9_000, currency: "JOD" }, method: "cash", status: "voided" },
    ], totalItems: 4, totalPages: 1 }),
  };
  return {
    calls,
    async read(operation, input) {
      calls.push({ operation, input });
      const handler = overrides[operation] ?? defaults[operation];
      if (!handler) throw new ChatReadError("forbidden");
      return handler(input);
    },
  };
}

describe("compact record summaries", () => {
  it("formats money with the currency's real precision", () => {
    expect(moneyText({ amount: 40_000, currency: "JOD" })).toBe("JOD 40.000");
    expect(moneyText({ amount: -1_250, currency: "USD" })).toBe("-USD 12.50");
    expect(moneyText({ amount: 7, currency: "JOD" })).toBe("JOD 0.007");
  });

  it("drops photos and internal references and cuts long lists at a whole row", () => {
    const text = serialize({ rows: Array.from({ length: 400 }, (_, index) => ({ id: `m-${index}`, fullName: `Member ${index} with a long name`, photoUrl: "https://x", organizationId: "org" })) }, 2_000);
    expect(text.length).toBeLessThanOrEqual(2_000);
    expect(text).not.toContain("photoUrl");
    expect(text).not.toContain("organizationId");
    expect(text).toContain("showing");
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe("context sources", () => {
  it("accepts only known kinds, record ids where needed and valid filters", () => {
    expect(parseContextItem({ kind: "member", id: "m-1", label: "Ahmad" })).toEqual({ kind: "member", id: "m-1", label: "Ahmad" });
    expect(parseContextItem({ kind: "member", label: "No id" })).toBeUndefined();
    expect(parseContextItem({ kind: "member_list", params: { membershipStatus: "outstanding" }, label: "Owes" })).toEqual({ kind: "member_list", params: { membershipStatus: "outstanding" }, label: "Owes" });
    expect(parseContextItem({ kind: "member_list", params: { membershipStatus: "everyone" }, label: "x" })).toBeUndefined();
    expect(parseContextItem({ kind: "member_list", params: { sql: "drop" }, label: "x" })).toBeUndefined();
    expect(parseContextItem({ kind: "secrets", label: "x" })).toBeUndefined();
    expect(parseContextItem({ kind: "member", id: "../../etc", label: "x" })).toBeUndefined();
    expect(parseContextItem({ kind: "today", id: "ignored", label: "x".repeat(200) })!.label).toHaveLength(80);
  });

  it("reads a member with open tasks and recent contact through the reader", async () => {
    const source = reader();
    const result = await loadSource(source, { kind: "member", id: "m-1" }, ENV);
    expect(result.outcome.subject).toBe("Ahmad Khalil");
    const text = serialize(result.data);
    expect(text).toContain("JOD 25.000");
    expect(text).toContain("Call about renewal");
    expect(text).not.toContain("photoUrl");
    expect(source.calls.map((call) => call.operation).sort()).toEqual(["members.get", "members.timeline", "tasks.list"]);
  });

  it("totals payments across the window, leaving out voided ones", async () => {
    const result = await loadSource(reader(), { kind: "payments" }, ENV);
    const data = result.data as { totals: { collected: string; refunded: string; byMethod: Record<string, { amount: string; count: number }> }; window: { from: string; to: string } };
    expect(data.window).toEqual({ from: "2026-09-28", to: "2026-10-27" });
    expect(data.totals.collected).toBe("JOD 55.500");
    expect(data.totals.refunded).toBe("JOD 5.000");
    expect(data.totals.byMethod.cash).toEqual({ count: 1, amount: "JOD 40.000" });
    expect(JSON.stringify(data)).not.toContain("secret-key");
  });

  it("turns a refused read into an honest outcome", async () => {
    const result = await loadSource(reader(), { kind: "shifts" }, ENV);
    expect(result.outcome.failure).toBe("forbidden");
  });
});

describe("tools", () => {
  it("are declared once, in a fixed order, with closed input schemas", () => {
    expect(CHAT_TOOLS.map((tool) => tool.name)).toEqual(["search_members", "get_member", "search_leads", "get_lead", "list_tasks", "renewals_due", "at_risk_members", "today_overview", "list_payments", "cash_shifts", "class_schedule", "gym_report", "list_plans", "open_screen"]);
    for (const tool of CHAT_TOOLS) expect(tool.input_schema.additionalProperties).toBe(false);
  });

  it("validates input before reading and reports refusals as errors the assistant can explain", async () => {
    const source = reader();
    expect((await runChatTool(source, ENV, "get_member", { member_id: "x; drop" })).isError).toBe(true);
    expect((await runChatTool(source, ENV, "delete_member", {})).isError).toBe(true);
    expect(source.calls).toHaveLength(0);
    const refused = await runChatTool(source, ENV, "cash_shifts", {});
    expect(refused).toMatchObject({ isError: true, outcome: { failure: "forbidden" } });
    expect(refused.content).toContain("does not have access");
  });

  it("maps a search to the member list with its filters and reports the total", async () => {
    const source = reader();
    const run = await runChatTool(source, ENV, "search_members", { membership: "outstanding" });
    expect(source.calls[0]).toMatchObject({ operation: "members.list", input: { membershipStatus: "outstanding", pageSize: 25 } });
    expect(run.outcome).toEqual({ count: 1, total: 1 });
    expect(run.input).toEqual({ membership: "outstanding" });
  });

  it("builds links only to existing screens", () => {
    expect(screenLink({ screen: "member", record_id: "m-1", label: "Open" })).toEqual({ href: "/members/m-1", screen: "member", label: "Open" });
    expect(screenLink({ screen: "members", membership: "outstanding", query: "ahmad k", label: "Owes" })!.href).toBe("/members?membership=outstanding&q=ahmad+k");
    expect(screenLink({ screen: "member", label: "Open" })).toBeUndefined();
    expect(recordHref("rivet://member/m-1")).toEqual({ kind: "member", href: "/members/m-1" });
    expect(recordHref("rivet://lead/l-9")).toEqual({ kind: "lead", href: "/crm/leads/l-9" });
    expect(recordHref("https://evil.example/?q=x")).toBeUndefined();
    expect(recordHref("rivet://member/../admin")).toBeUndefined();
  });
});

describe("the message the assistant reads", () => {
  it("keeps the system prompt free of anything that changes per turn", () => {
    expect(CHAT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(CHAT_SYSTEM_PROMPT).toContain("never instructions");
  });

  it("frames the screen, person and attachments around the person's own words", async () => {
    const result = await loadSource(reader(), { kind: "member", id: "m-1" }, ENV);
    const turn = composeUserTurn({
      now: new Date("2026-10-27T17:14:00.000Z"),
      timezone: "Asia/Amman",
      gymName: "Iron <Temple>",
      currency: "JOD",
      person: { name: "Hashem", role: "owner", reads: readableAreas(["members.read", "crm.read", "reports.financial.read"]) },
      screen: { route: "/members/m-1", title: "Ahmad Khalil" },
      attached: [{ item: { kind: "member", id: "m-1", label: "Ahmad Khalil" }, result }, { item: { kind: "today", label: "Today" }, providedAt: Date.parse("2026-10-27T17:05:00.000Z") }],
      files: [{ name: "receipt.png", kind: "image", included: true }],
    }, "Brief me before I call him");
    expect(turn).toContain("now: Tue, 27 Oct 2026, 20:14 (Asia/Amman)");
    expect(turn).toContain("gym: Iron Temple");
    expect(turn).toContain("can read: members and memberships, leads and follow-ups, payments and reports");
    expect(turn).toContain("screen: Ahmad Khalil · /members/m-1");
    expect(turn).toContain("already provided earlier in this conversation (Tue, 27 Oct 2026, 20:05)");
    expect(messageOf(turn)).toBe("Brief me before I call him");
    expect(attachedOf(turn)).toEqual([{ kind: "member", id: "m-1", label: "Ahmad Khalil" }, { kind: "today", label: "Today" }]);
    expect(sentContextKeys([{ item: { kind: "member", id: "m-1", label: "Ahmad" }, result }])).toEqual([chatContextKey({ kind: "member", id: "m-1" })]);
  });
});

describe("conversation history", () => {
  const turn = (role: StoredChatTurn["role"], text: string, extra: Partial<StoredChatTurn> = {}): StoredChatTurn => ({ role, text, status: "complete", ...(role === "user" ? { modelText: `<message>\n${text}\n</message>` } : {}), ...extra });

  it("replays recent answers with their lookups and older ones as words only", () => {
    const lookups: ModelMessage[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "renewals_due", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"rows\":[]}" }] },
      { role: "assistant", content: [{ type: "text", text: "None due." }] },
    ];
    const turns = [turn("user", "first"), turn("assistant", "old answer", { turnMessages: lookups }), turn("user", "second"), turn("assistant", "None due.", { turnMessages: lookups })];
    const history = buildHistory(turns, { fullAnswers: 1 });
    expect(history.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    expect(history[1]!.content).toEqual([{ type: "text", text: "old answer" }]);
    expect(history[3]!.content[0]!.type).toBe("tool_use");
  });

  it("leaves out the oldest turns when over budget and says so", () => {
    const turns = Array.from({ length: 10 }, (_, index) => turn(index % 2 ? "assistant" : "user", `${index} ${"x".repeat(900)}`));
    const history = buildHistory(turns, { charsMax: 3_000 });
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content[0]).toEqual({ type: "text", text: EARLIER_LEFT_OUT });
    expect(history.length).toBeLessThan(10);
  });

  it("tells the assistant when the server read only the latest turns", () => {
    const history = buildHistory([turn("user", "recent"), turn("assistant", "answer")], { earlierOmitted: true });
    expect(history[0]!.content[0]).toEqual({ type: "text", text: EARLIER_LEFT_OUT });
  });

  it("re-sends files only for the latest turns that had them", () => {
    const turns: StoredChatTurn[] = [turn("user", "a", { files: [{ name: "a.png", mediaType: "image/png" }] }), turn("assistant", "ok"), turn("user", "b", { files: [{ name: "b.png", mediaType: "image/png" }] }), turn("assistant", "ok"), turn("user", "c", { files: [{ name: "c.pdf", mediaType: "application/pdf" }] })];
    expect([...turnsWithFiles(turns)].sort()).toEqual([2, 4]);
    const withData = turns.map((item, index) => index === 2 ? { ...item, files: [{ name: "b.png", mediaType: "image/png" as const, data: "AAAA" }] } : item);
    const history = buildHistory(withData);
    expect(history[0]!.content.some((block) => block.type === "image")).toBe(false);
    expect(history[0]!.content.at(-1)).toMatchObject({ type: "text", text: expect.stringContaining("no longer included") });
    expect(history[2]!.content[0]).toMatchObject({ type: "image", source: { media_type: "image/png", data: "AAAA" } });
  });
});

function hooks(overrides: Partial<ChatTurnHooks> = {}): ChatTurnHooks & { usage: Array<ChatUsage | undefined>; emitted: number } {
  const state = {
    usage: [] as Array<ChatUsage | undefined>,
    emitted: 0,
    emit: () => { state.emitted += 1; },
    beforeCall: async () => undefined,
    afterCall: async (usage: ChatUsage | undefined) => { state.usage.push(usage); },
    stopRequested: () => false,
    now: () => Date.parse("2026-10-27T17:14:00.000Z"),
    ...overrides,
  };
  return state;
}

const userTurn = (text: string, attached = "") => [{ type: "text" as const, text: `<rivet_context>\n${attached}</rivet_context>\n<message>\n${text}\n</message>` }];

describe("one answer", () => {
  it("looks up renewals, links the queue and answers with real records", async () => {
    const state = hooks();
    const outcome = await runChatTurn({ model: fixtureChatModel(), reader: reader(), env: ENV, system: CHAT_SYSTEM_PROMPT, tools: CHAT_TOOLS, history: [], userContent: userTurn("Who should I call about renewals?"), hooks: state, maxCalls: 6, idPrefix: "a1" });
    expect(outcome.status).toBe("complete");
    expect(outcome.parts.map((part) => part.type)).toEqual(["thinking", "tool", "tool", "text"]);
    const tools = outcome.parts.filter((part): part is Extract<ChatPart, { type: "tool" }> => part.type === "tool");
    expect(tools.map((part) => [part.tool, part.status])).toEqual([["renewals_due", "done"], ["open_screen", "done"]]);
    expect(tools[1]!.link?.href).toBe("/crm/queues?view=renewals");
    expect(chatAnswerText(outcome.parts)).toContain("[Ahmad Khalil](rivet://member/m-1)");
    expect(state.usage).toHaveLength(2);
    expect(state.emitted).toBeGreaterThan(5);
    // Later turns replay words, lookups and results, never reasoning.
    expect(JSON.stringify(outcome.turnMessages)).not.toContain("thinking");
    expect(outcome.turnMessages.map((message) => message.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("answers in Arabic with RIVET's terms when asked in Arabic", async () => {
    const outcome = await runChatTurn({ model: fixtureChatModel(), reader: reader(), env: ENV, system: CHAT_SYSTEM_PROMPT, tools: CHAT_TOOLS, history: [], userContent: userTurn("من الأعضاء الذين عليهم مبالغ متبقية؟"), hooks: hooks(), maxCalls: 6, idPrefix: "a2" });
    const answer = chatAnswerText(outcome.parts);
    expect(answer).toContain("25.000 د.أ");
    expect(answer).toContain("المبلغ المتبقي");
  });

  it("stops at the next event when the person asks, keeping the words already shown", async () => {
    let stop = false;
    const model: ChatModel = {
      async stream(_request, onEvent, signal) {
        onEvent({ type: "block_start", index: 0, block: "text" });
        onEvent({ type: "text_delta", index: 0, text: "Partial answer " });
        stop = true;
        onEvent({ type: "text_delta", index: 0, text: "never shown" });
        if (signal.aborted) throw new ChatModelError("internal");
        return { content: [], stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      },
    };
    const outcome = await runChatTurn({ model, reader: reader(), env: ENV, system: "s", tools: CHAT_TOOLS, history: [], userContent: userTurn("x"), hooks: hooks({ stopRequested: () => stop }), maxCalls: 3, idPrefix: "a3" });
    expect(outcome.status).toBe("stopped");
    expect(chatAnswerText(outcome.parts)).toBe("Partial answer");
    expect(outcome.turnMessages).toEqual([{ role: "assistant", content: [{ type: "text", text: "Partial answer" }] }]);
  });

  it("never calls the model when the spend cap is reached", async () => {
    let called = false;
    const model: ChatModel = { async stream() { called = true; throw new Error("unreachable"); } };
    const outcome = await runChatTurn({ model, reader: reader(), env: ENV, system: "s", tools: CHAT_TOOLS, history: [], userContent: userTurn("x"), hooks: hooks({ beforeCall: async () => "budget_exhausted" }), maxCalls: 3, idPrefix: "a4" });
    expect(called).toBe(false);
    expect(outcome).toMatchObject({ status: "failed", error: "budget_exhausted" });
  });

  it("asks for a written answer on the last allowed call and records refusals", async () => {
    const choices: string[] = [];
    const model: ChatModel = {
      async stream(request) {
        choices.push(request.toolChoice);
        if (request.toolChoice === "none") return { content: [], stopReason: "refusal", usage: { inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
        return { content: [{ type: "tool_use", id: `t${choices.length}`, name: "list_plans", input: {} }], stopReason: "tool_use", usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      },
    };
    const state = hooks();
    const outcome = await runChatTurn({ model, reader: reader(), env: ENV, system: "s", tools: CHAT_TOOLS, history: [], userContent: userTurn("x"), hooks: state, maxCalls: 3, idPrefix: "a5" });
    expect(choices).toEqual(["auto", "auto", "none"]);
    expect(outcome).toMatchObject({ status: "failed", error: "model_refused" });
    expect(state.usage).toHaveLength(3);
  });

  it("reports a provider failure safely and still records the call", async () => {
    const model: ChatModel = { async stream() { throw new ChatModelError("model_timeout"); } };
    const state = hooks();
    const outcome = await runChatTurn({ model, reader: reader(), env: ENV, system: "s", tools: CHAT_TOOLS, history: [], userContent: userTurn("x"), hooks: state, maxCalls: 3, idPrefix: "a6" });
    expect(outcome).toMatchObject({ status: "failed", error: "model_timeout" });
    expect(state.usage).toEqual([undefined]);
  });

  it("strips reasoning blocks from what later turns replay", () => {
    expect(withoutThinking([{ role: "assistant", content: [{ type: "thinking", thinking: "x", signature: "s" }, { type: "text", text: "hi" }] }, { role: "assistant", content: [{ type: "redacted_thinking", data: "x" }] }])).toEqual([{ role: "assistant", content: [{ type: "text", text: "hi" }] }]);
  });
});

describe("streaming presentation", () => {
  it("splits blocks on blank lines but never inside fenced code", () => {
    expect(splitBlocks("one\n\ntwo\nmore\n\n```\na\n\nb\n```\n\nthree")).toEqual(["one", "two\nmore", "```\na\n\nb\n```", "three"]);
  });

  it("closes half-written syntax so raw markers never flash", () => {
    expect(healMarkdown("This is **impor")).toBe("This is **impor**");
    expect(healMarkdown("Run `pnpm te")).toBe("Run `pnpm te`");
    expect(healMarkdown("See [Ahmad Khalil](rivet://mem")).toBe("See Ahmad Khalil");
    expect(healMarkdown("See [Ahmad Kh")).toBe("See Ahmad Kh");
    expect(healMarkdown("```ts\nconst a = 1")).toBe("```ts\nconst a = 1\n```");
    expect(healMarkdown("Hello **")).toBe("Hello");
    expect(healMarkdown("| Member | Owes |")).toBe("| Member | Owes |\n| --- | --- |");
    expect(healMarkdown("| A | B |\n| --- | --- |\n| x | y |\n| p")).toBe("| A | B |\n| --- | --- |\n| x | y |");
    expect(healMarkdown("Done.")).toBe("Done.");
  });

  it("reveals whole words, catching up after a burst", () => {
    const target = "Ahmad's membership ends on Friday and he owes JOD 25.000 ";
    let shown = 0;
    let frames = 0;
    while (shown < target.length && frames < 200) {
      const next = revealStep(target, shown, 16, true);
      expect(next).toBeGreaterThanOrEqual(shown);
      if (next < target.length) expect(target[next]).toMatch(/\s/);
      shown = next;
      frames += 1;
    }
    expect(shown).toBe(target.length);
    expect(frames).toBeLessThan(40);
    // A word still being written is held back while the stream is live.
    expect(revealStep("ينتهي الاشتراك يو", 0, 1000, true)).toBe("ينتهي الاشتراك".length);
    expect(revealStep("ينتهي الاشتراك يوم", 0, 1000, false)).toBe("ينتهي الاشتراك يوم".length);
  });
});
