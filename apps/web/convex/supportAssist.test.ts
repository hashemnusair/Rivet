import { describe, expect, it } from "vitest";
import { countBefore, locatePassage, normalizeText, numbersIn, sharedTokenCount, splitPassages } from "./assistPassages";
import {
  SUPPORT_ALL_ANSWERED,
  SUPPORT_NONE,
  buildSupportCategoryState,
  buildSupportClaimState,
  buildSupportClarificationState,
  buildSupportInvoiceMatchState,
  buildSupportReviewContext,
  buildSupportUnansweredState,
  resolveSupportCategoryFixture,
  resolveSupportCategoryReading,
  resolveSupportClaimFixture,
  resolveSupportClaimReading,
  resolveSupportClarificationFixture,
  resolveSupportClarificationReading,
  resolveSupportInvoiceMatchFixture,
  resolveSupportInvoiceReading,
  resolveSupportUnansweredFixture,
  resolveSupportUnansweredReading,
  supportClaimEvidence,
  supportClaimPassages,
  supportDestination,
  supportPassages,
  supportRequestPassages,
  type SupportCaseLike,
  type SupportFacts,
  type SupportReviewContext,
} from "./supportAssist";

const FACTS: SupportFacts = {
  gymId: "gym-a",
  gymName: "Gym A",
  organizationStatus: "active",
  plan: "Growth",
  billingInterval: "monthly",
  branchCount: 2,
  invoices: [
    { id: "RV-2001", status: "failed", amount: "JOD 149.000", date: "2026-08-31" },
    { id: "RV-1990", status: "paid", amount: "JOD 149.000", date: "2026-07-31", paidAt: "2026-08-03T00:00:00.000Z" },
  ],
  publicPage: { publishedVersion: 2, draftVersion: 3, draftAwaitingReview: true },
};

function supportCase(messages: Array<{ id?: string; authorType: "gym" | "platform"; body: string; at?: string }>, overrides: Partial<SupportCaseLike> = {}): SupportCaseLike {
  return {
    id: "SUP-1",
    subject: overrides.subject ?? "Invoice question",
    status: "waiting",
    priority: "normal",
    requestType: "general",
    creatorName: "Owner",
    createdAt: "2026-09-18T08:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    messages: messages.map((message, index) => ({ id: message.id ?? `m${index + 1}`, authorType: message.authorType, authorName: message.authorType === "gym" ? "Owner" : "RIVET", body: message.body, createdAt: message.at ?? `2026-09-1${8 + Math.min(index, 1)}T0${index + 1}:00:00.000Z` })),
    ...overrides,
  };
}

function context(messages: Parameters<typeof supportCase>[0], overrides: Partial<SupportCaseLike> = {}, facts: SupportFacts = FACTS): SupportReviewContext {
  return buildSupportReviewContext({ supportCase: supportCase(messages, overrides), gymId: facts.gymId, facts, now: "2026-09-21T09:00:00.000Z" });
}

const choice = (judgment: ReturnType<typeof resolveSupportCategoryFixture>) => (judgment?.kind === "choice" ? judgment.choice : undefined);

describe("passages", () => {
  it("cuts text into verbatim sentence slices in either script and locates them again", () => {
    const body = "Invoice RV-2001 shows failed. We paid on 2 September!\nهل يمكنكم تعديل تاريخ الفوترة؟ شكراً لكم.";
    const slices = splitPassages(body);
    expect(slices).toEqual(["Invoice RV-2001 shows failed.", "We paid on 2 September!", "هل يمكنكم تعديل تاريخ الفوترة؟", "شكراً لكم."]);
    for (const slice of slices) expect(locatePassage(body, slice)).toBeDefined();
    expect(locatePassage(body, "not in the text")).toBeUndefined();
  });

  it("gives every passage an id that names its message and keeps the text a substring of that message", () => {
    const passages = supportPassages(supportCase([{ authorType: "gym", body: "First point. Second point?" }, { authorType: "platform", body: "Reply." }]));
    expect(passages.map((passage) => passage.id)).toEqual(["m1:0", "m1:1", "m2:0"]);
    expect(passages[1]).toMatchObject({ messageId: "m1", authorType: "gym", text: "Second point?" });
    expect(passages[2]).toMatchObject({ messageId: "m2", authorType: "platform" });
  });

  it("falls back to the case body when a legacy case has no messages", () => {
    const passages = supportPassages(supportCase([], { body: "Scanner is dead." }));
    expect(passages).toEqual([expect.objectContaining({ id: "case:SUP-1:0", messageId: "case:SUP-1", authorType: "gym", text: "Scanner is dead." })]);
  });

  it("normalises digits and words across scripts", () => {
    expect(numbersIn("٣ فروع و 1,500 دينار")).toEqual(["3", "1500"]);
    expect(normalizeText("Freeze!")).toBe("freeze");
    expect(countBefore("across six branches", /branch|branches/)).toBe(6);
    expect(countBefore("ثلاثة فروع في عمان", /فرع|فروع/)).toBe(3);
    expect(sharedTokenCount("move our billing date", "we moved the billing date")).toBe(3);
  });
});

describe("category and destination", () => {
  it("keeps invoice disputes, billing-schedule requests and feature upgrades apart", () => {
    const dispute = context([{ authorType: "gym", body: "Invoice RV-2001 still shows failed but we paid it by bank transfer on 2 September. Please mark it paid." }]);
    const disputeState = buildSupportCategoryState({ context: dispute });
    expect(choice(resolveSupportCategoryFixture(disputeState))).toBe("invoice_dispute");
    const schedule = context([{ authorType: "gym", body: "Could you move our billing date to the 1st of each month and switch to annual billing from January?" }], { subject: "Billing date" });
    expect(choice(resolveSupportCategoryFixture(buildSupportCategoryState({ context: schedule })))).toBe("billing_schedule");
    const upgrade = context([{ authorType: "gym", body: "We need the automation module; please upgrade us to the Pro plan." }], { subject: "Upgrade" });
    expect(choice(resolveSupportCategoryFixture(buildSupportCategoryState({ context: upgrade })))).toBe("feature_upgrade");
    const structured = context([{ authorType: "gym", body: "We want more." }], { subject: "Plan", requestType: "plan_upgrade", requestedPlan: "Pro" });
    expect(choice(resolveSupportCategoryFixture(buildSupportCategoryState({ context: structured })))).toBe("feature_upgrade");
    const arabic = context([{ authorType: "gym", body: "تم خصم مبلغ الفاتورة مرتين هذا الشهر، نرجو استرجاع المبلغ الزائد." }], { subject: "فاتورة" });
    expect(choice(resolveSupportCategoryFixture(buildSupportCategoryState({ context: arabic })))).toBe("invoice_dispute");
    const vague = context([{ authorType: "gym", body: "Hello, we have a question." }], { subject: "Question" });
    expect(choice(resolveSupportCategoryFixture(buildSupportCategoryState({ context: vague })))).toBe("other");
  });

  it("reads a straddling case with its alternatives and routes only to existing console pages", () => {
    const both = context([{ authorType: "gym", body: "Invoice RV-2001 was charged twice. Also please move our billing date to the 1st and extend the due date." }]);
    const judgment = resolveSupportCategoryFixture(buildSupportCategoryState({ context: both }))!;
    const reading = resolveSupportCategoryReading(judgment, both)!;
    expect(reading.category.id).toBe("invoice_dispute");
    expect(reading.alternatives.map((entry) => entry.category.id)).toContain("billing_schedule");
    expect(supportDestination({ category: "invoice_dispute", gymId: "gym-a", caseId: "SUP-1", invoiceId: "RV-2001" })).toEqual({ label: "Open invoice RV-2001 in the ledger", href: "/platform/billing?invoice=RV-2001&case=SUP-1" });
    expect(supportDestination({ category: "invoice_dispute", gymId: "gym-a", caseId: "SUP-1" }).href).toBe("/platform/gyms/gym-a");
    expect(supportDestination({ category: "billing_schedule", gymId: "gym-a", caseId: "SUP-1" }).href).toBe("/platform/billing?bill=gym-a&case=SUP-1");
    expect(supportDestination({ category: "public_page", gymId: "gym-a", caseId: "SUP-1" }).href).toBe("/platform/gyms/gym-a");
    expect(both.categories.map((category) => category.destination.href)).toEqual(expect.arrayContaining(["/platform/gyms/gym-a", "/platform/billing?bill=gym-a&case=SUP-1"]));
  });
});

describe("invoice match", () => {
  it("matches a named invoice, then an amount, and otherwise none; only recorded invoices are offered", () => {
    const named = context([{ authorType: "gym", body: "rv-2001 is wrong." }]);
    const state = buildSupportInvoiceMatchState({ context: named });
    expect(state.candidates.map((candidate) => candidate.id)).toEqual(["RV-2001", "RV-1990", SUPPORT_NONE]);
    expect(choice(resolveSupportInvoiceMatchFixture(state))).toBe("RV-2001");
    const ambiguous = context([{ authorType: "gym", body: "You charged 149 twice." }]);
    expect(choice(resolveSupportInvoiceMatchFixture(buildSupportInvoiceMatchState({ context: ambiguous })))).toBe(SUPPORT_NONE);
    const byMonth = context([{ authorType: "gym", body: "The July invoice is wrong." }], {}, { ...FACTS, invoices: [{ id: "RV-1990", status: "paid", amount: "JOD 149.000", date: "31 Jul 2026" }, { id: "RV-2001", status: "failed", amount: "JOD 149.000", date: "31 Aug 2026" }] });
    const monthJudgment = resolveSupportInvoiceMatchFixture(buildSupportInvoiceMatchState({ context: byMonth }))!;
    expect(choice(monthJudgment)).toBe("RV-1990");
    expect(resolveSupportInvoiceReading(monthJudgment, byMonth).invoice?.id).toBe("RV-1990");
    const unrelated = context([{ authorType: "gym", body: "The scanner is broken." }]);
    expect(resolveSupportInvoiceReading(resolveSupportInvoiceMatchFixture(buildSupportInvoiceMatchState({ context: unrelated }))!, unrelated).invoice).toBeUndefined();
  });
});

describe("one prepared clarification", () => {
  it("offers at most one question, and none when the case already answers it", () => {
    const missing = context([{ authorType: "gym", body: "We paid an invoice but it still shows open." }]);
    const state = buildSupportClarificationState({ context: missing, category: "invoice_dispute" });
    expect(state.candidates.map((candidate) => candidate.id)).toEqual(["invoice_reference", SUPPORT_NONE]);
    const judgment = resolveSupportClarificationFixture(state)!;
    expect(choice(judgment)).toBe("invoice_reference");
    expect(resolveSupportClarificationReading(judgment, missing).clarification?.text).toContain("invoice number");
    const complete = context([{ authorType: "gym", body: "Invoice RV-2001 was paid on 2 September by transfer." }]);
    expect(choice(resolveSupportClarificationFixture(buildSupportClarificationState({ context: complete, category: "invoice_dispute" })))).toBe(SUPPORT_NONE);
    const technical = context([{ authorType: "gym", body: "The scanner does not work." }], { branchName: "Abdoun" });
    expect(choice(resolveSupportClarificationFixture(buildSupportClarificationState({ context: technical, category: "technical_issue" })))).toBe("where_when");
    const detailed = context([{ authorType: "gym", body: "Since yesterday the scanner shows error E12 at the desk." }], { branchName: "Abdoun" });
    expect(choice(resolveSupportClarificationFixture(buildSupportClarificationState({ context: detailed, category: "technical_issue" })))).toBe("outcome");
  });
});

describe("unanswered explicit requests", () => {
  it("offers only the gym's request passages and flags the one no later reply or summary addresses", () => {
    const ctx = context([
      { authorType: "gym", body: "Invoice RV-2001 shows failed. Please mark it paid. Can you also move our billing date to the 1st of each month?", at: "2026-09-18T08:00:00.000Z" },
      { authorType: "platform", body: "We have marked RV-2001 as paid on our side.", at: "2026-09-19T10:00:00.000Z" },
    ]);
    const requests = supportRequestPassages(ctx.passages);
    expect(requests.map((passage) => passage.text)).toEqual(["Please mark it paid.", "Can you also move our billing date to the 1st of each month?"]);
    const state = buildSupportUnansweredState({ context: ctx });
    const judgment = resolveSupportUnansweredFixture(state)!;
    expect(choice(judgment)).toBe("m1:2");
    const reading = resolveSupportUnansweredReading(judgment, ctx);
    expect(reading.allAnswered).toBe(false);
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(["Can you also move our billing date to the 1st of each month?"]);
    // The summary the operator is writing counts as an answer.
    const withSummary = buildSupportUnansweredState({ context: ctx, summaryDraft: "Marked paid; billing date moved to the 1st from October." });
    expect(choice(resolveSupportUnansweredFixture(withSummary))).toBe(SUPPORT_ALL_ANSWERED);
    expect(resolveSupportUnansweredReading(resolveSupportUnansweredFixture(withSummary)!, ctx).allAnswered).toBe(true);
  });

  it("does not count a reply written before the request, and drops ids the case no longer carries", () => {
    const ctx = context([
      { authorType: "platform", body: "We moved your billing date already.", at: "2026-09-17T08:00:00.000Z" },
      { authorType: "gym", body: "Please move our billing date to the 1st.", at: "2026-09-18T08:00:00.000Z" },
    ]);
    const judgment = resolveSupportUnansweredFixture(buildSupportUnansweredState({ context: ctx }))!;
    expect(choice(judgment)).toBe("m2:0");
    const changed = context([{ authorType: "gym", body: "Different case now." }]);
    expect(resolveSupportUnansweredReading(judgment, changed).findings).toEqual([]);
  });
});

describe("claims the records do not support", () => {
  it("flags a paid claim the ledger records as failed, a plan the subscription does not show, and a fix nothing records", () => {
    const ctx = context([
      { authorType: "gym", body: "Invoice RV-2001 shows failed but we paid it by bank transfer." },
      { authorType: "platform", body: "We have marked RV-2001 as paid on our side. We also moved you to the Pro plan. The scanner is fixed now." },
    ]);
    const claims = supportClaimPassages(ctx.passages).map((passage) => passage.text);
    expect(claims).toEqual(["Invoice RV-2001 shows failed but we paid it by bank transfer.", "We have marked RV-2001 as paid on our side.", "We also moved you to the Pro plan.", "The scanner is fixed now."]);
    expect(supportClaimEvidence({ authorType: "gym", text: claims[0]! }, FACTS)).toBe("Ledger: invoice RV-2001 is recorded as failed.");
    expect(supportClaimEvidence({ authorType: "platform", text: claims[1]! }, FACTS)).toBe("Ledger: invoice RV-2001 is recorded as failed.");
    expect(supportClaimEvidence({ authorType: "platform", text: claims[2]! }, FACTS)).toBe("Subscription: the recorded plan is Growth, not Pro.");
    expect(supportClaimEvidence({ authorType: "platform", text: claims[3]! }, FACTS)).toContain("No recorded evidence covers this");
    const judgment = resolveSupportClaimFixture(buildSupportClaimState({ context: ctx }))!;
    const reading = resolveSupportClaimReading(judgment, ctx);
    expect(reading.supported).toBe(false);
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(claims.slice(0, 1));
    expect(reading.findings[0]?.evidence).toBe("Ledger: invoice RV-2001 is recorded as failed.");
  });

  it("supports claims the facts confirm and treats contradictory replies by their own words", () => {
    const paid = context([
      { authorType: "gym", body: "We paid RV-1990 in August." },
      { authorType: "platform", body: "Confirmed: RV-1990 is paid and your plan stays Growth." },
    ]);
    expect(choice(resolveSupportClaimFixture(buildSupportClaimState({ context: paid })))).toBe(SUPPORT_NONE);
    expect(resolveSupportClaimReading(resolveSupportClaimFixture(buildSupportClaimState({ context: paid }))!, paid).supported).toBe(true);
    const contradictory = context([
      { authorType: "gym", body: "Is the public page live?" },
      { authorType: "platform", body: "Yes, we published your page this morning.", at: "2026-09-19T09:00:00.000Z" },
      { authorType: "platform", body: "Correction: the draft is still awaiting review.", at: "2026-09-19T11:00:00.000Z" },
    ]);
    const judgment = resolveSupportClaimFixture(buildSupportClaimState({ context: contradictory }))!;
    const reading = resolveSupportClaimReading(judgment, contradictory);
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(["Yes, we published your page this morning."]);
    expect(reading.findings[0]?.evidence).toBe("Public page: draft v3 is still awaiting review; v2 is the published version.");
  });

  it("does not invent a contradiction when the facts are silent", () => {
    const silent: SupportFacts = { gymId: "gym-b", gymName: "Gym B", invoices: [] };
    expect(supportClaimEvidence({ authorType: "gym", text: "We paid last week." }, silent)).toBeUndefined();
    expect(supportClaimEvidence({ authorType: "platform", text: "We moved you to the Pro plan." }, silent)).toBeUndefined();
  });
});


it("does not report competing Choice alternatives as separate support findings", () => {
  const ctx = context([{ authorType: "gym", body: "Fix our invoice. Change our billing date." }]);
  const [first, second] = ctx.passages;
  const judgment = { kind: "choice" as const, choice: first!.id, probabilities: { [first!.id]: 0.51, [second!.id]: 0.49 } };
  for (const read of [resolveSupportUnansweredReading, resolveSupportClaimReading]) {
    expect(read(judgment, ctx).findings.map((item) => item.passage.id)).toEqual([first!.id]);
    expect(read({ ...judgment, choice: "missing" }, ctx).findings).toEqual([]);
  }
  expect(resolveSupportUnansweredReading({ ...judgment, choice: "missing" }, ctx).allAnswered).toBe(false);
  expect(resolveSupportClaimReading({ ...judgment, choice: "missing" }, ctx).supported).toBe(false);
});
