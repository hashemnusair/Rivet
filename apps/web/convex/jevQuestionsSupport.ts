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
  resolveSupportClaimFixture,
  resolveSupportClarificationFixture,
  resolveSupportInvoiceMatchFixture,
  resolveSupportUnansweredFixture,
  type SupportReviewContext,
} from "./supportAssist";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Support inbox assistance for the platform team. Every question is
 * platform-scoped: only a platform administrator may ask, the loader finds
 * the case across tenants, and the judgment is cached under the case's own
 * gym so a gym's switch still governs whether its messages are sent. Nothing
 * Jev picks changes urgency, assignment, status or the subscription.
 */
export const SUPPORT_FEATURE: JevFeature = {
  key: "support",
  label: "Support inbox review",
  description: "Helps the RIVET support team triage a gym's case: a category with an existing review destination, which recorded invoice a billing case refers to, one prepared clarification, and before closure which explicit requests no reply addressed and which claims the ledger, subscription or public-page records do not support. Sends the case's messages and the gym's recorded billing facts only.",
};

/** The synthetic case every fixture replays: an invoice dispute with an unanswered schedule request and a reassuring reply. */
const SYNTHETIC_CONTEXT: SupportReviewContext = buildSupportReviewContext({
  gymId: "gym-fixture",
  now: "2026-09-21T09:00:00.000Z",
  facts: {
    gymId: "gym-fixture",
    gymName: "Fixture Gym",
    organizationStatus: "active",
    plan: "Growth",
    billingInterval: "monthly",
    currentPeriodEndsAt: "2026-10-01T00:00:00.000Z",
    branchCount: 2,
    invoices: [
      { id: "RV-2001", status: "failed", amount: "JOD 149.000", currency: "JOD", date: "2026-08-31", issuedAt: "2026-08-31T00:00:00.000Z", billingInterval: "monthly" },
      { id: "RV-1990", status: "paid", amount: "JOD 149.000", currency: "JOD", date: "2026-07-31", issuedAt: "2026-07-31T00:00:00.000Z", paidAt: "2026-08-03T00:00:00.000Z", billingInterval: "monthly" },
    ],
    publicPage: { publishedVersion: 2, draftVersion: 3, draftAwaitingReview: true },
  },
  supportCase: {
    id: "SUP-FIXTURE",
    subject: "Invoice RV-2001 shows failed but we paid it",
    status: "waiting",
    priority: "normal",
    requestType: "general",
    creatorName: "Fixture Owner",
    createdAt: "2026-09-18T08:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    messages: [
      { id: "msg-1", authorType: "gym", authorName: "Fixture Owner", createdAt: "2026-09-18T08:00:00.000Z", body: "Invoice RV-2001 still shows as failed but we paid it by bank transfer on 2 September. Please mark it paid. Can you also move our billing date to the 1st of each month?" },
      { id: "msg-2", authorType: "platform", authorName: "RIVET Support", createdAt: "2026-09-19T10:00:00.000Z", body: "Thanks, we have marked RV-2001 as paid on our side. Everything should work now." },
    ],
  },
});

const categoryFixture = buildSupportCategoryState({ context: SYNTHETIC_CONTEXT });
const invoiceFixture = buildSupportInvoiceMatchState({ context: SYNTHETIC_CONTEXT });
const clarificationFixture = buildSupportClarificationState({ context: SYNTHETIC_CONTEXT, category: "invoice_dispute" });
const unansweredFixture = buildSupportUnansweredState({ context: SYNTHETIC_CONTEXT, summaryDraft: "Marked RV-2001 paid after the bank reference was confirmed." });
const claimFixture = buildSupportClaimState({ context: SYNTHETIC_CONTEXT });

export const SUPPORT_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "support.category",
    feature: "support",
    version: 1,
    scope: "platform",
    label: "Case category",
    description: "Which category a gym's support case belongs to, so the team opens the right existing console page. Feature upgrades, billing-schedule requests and invoice disputes are kept apart.",
    instructions: "The RIVET platform support team is triaging a case a gym wrote. Choose the one category that fits what the gym is asking for. An invoice dispute is about an invoice that exists (its amount, a payment, a duplicate). A billing-schedule request asks to change when or how often the gym is billed. A feature or plan upgrade asks for more product than the current plan gives. Choose other when the request fits none. Do not judge urgency.",
    maxCandidates: 8,
    permission: "platform.admin",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveSupportCategoryFixture,
    fixture: {
      state: categoryFixture.state,
      candidates: categoryFixture.candidates,
      judgment: resolveSupportCategoryFixture({ state: categoryFixture.state, candidates: categoryFixture.candidates }) ?? { kind: "choice", choice: "other", probabilities: { other: 1 } },
    },
  },
  {
    kind: "choice",
    key: "support.invoice_match",
    feature: "support",
    version: 1,
    scope: "platform",
    label: "Invoice the case refers to",
    description: "Which of the gym's recorded invoices a billing case is about, so the ledger opens on that row. Only invoices that exist are offered.",
    instructions: "A gym wrote to RIVET support about billing. The recorded invoices of that gym are offered with their status, amount and dates. Choose the invoice the gym is referring to when the message names its number, its amount or its month; choose none when the message names no invoice or names one that is not offered. Never guess from the status alone.",
    maxCandidates: 30,
    permission: "platform.admin",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveSupportInvoiceMatchFixture,
    fixture: {
      state: invoiceFixture.state,
      candidates: invoiceFixture.candidates,
      judgment: resolveSupportInvoiceMatchFixture({ state: invoiceFixture.state, candidates: invoiceFixture.candidates }) ?? { kind: "choice", choice: SUPPORT_NONE, probabilities: { [SUPPORT_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "support.clarification",
    feature: "support",
    version: 1,
    scope: "platform",
    label: "One prepared clarification",
    description: "Which single prepared question would most help the team act on the case, or none when the case already contains what is needed. The team inserts it into their own reply; nothing is sent.",
    instructions: "The RIVET support team may ask the gym one prepared clarifying question before acting. Choose the one prepared question whose answer the case is missing and the team needs. Choose none when the gym already gave that information or when no prepared question would help. Never choose a question the messages already answer.",
    maxCandidates: 12,
    permission: "platform.admin",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveSupportClarificationFixture,
    fixture: {
      state: clarificationFixture.state,
      candidates: clarificationFixture.candidates,
      judgment: resolveSupportClarificationFixture({ state: clarificationFixture.state, candidates: clarificationFixture.candidates }) ?? { kind: "choice", choice: SUPPORT_NONE, probabilities: { [SUPPORT_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "support.unanswered",
    feature: "support",
    version: 1,
    scope: "platform",
    label: "Unanswered explicit request",
    description: "Before closure: which explicit request in the gym's messages no platform reply (nor the closing summary being written) has addressed. Only the gym's own passages are offered.",
    instructions: "The RIVET support team is about to close a case. The gym's explicit requests are offered as passages, with every platform reply and the closing summary draft. Choose the request that no later reply and no summary addresses, even partially. Choose all_answered when every request has been addressed. A reply that acknowledges a request without answering it does not address it.",
    maxCandidates: 40,
    permission: "platform.admin",
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveSupportUnansweredFixture,
    fixture: {
      state: unansweredFixture.state,
      candidates: unansweredFixture.candidates,
      judgment: resolveSupportUnansweredFixture({ state: unansweredFixture.state, candidates: unansweredFixture.candidates }) ?? { kind: "choice", choice: SUPPORT_ALL_ANSWERED, probabilities: { [SUPPORT_ALL_ANSWERED]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "support.claim_check",
    feature: "support",
    version: 1,
    scope: "platform",
    label: "Claim the records do not support",
    description: "Before closure: which passage (a platform reply or a gym statement) asserts something the recorded ledger, subscription or public-page state does not support. A reassuring reply is not evidence.",
    instructions: "The RIVET support team is about to close a case. Passages that assert an outcome are offered together with the recorded facts: the subscription plan and cadence, every invoice with its status, and the public page's published and draft versions. Choose the passage whose assertion the recorded facts contradict or do not cover: an invoice called paid that the ledger records otherwise, a plan or cadence change the subscription does not show, a page called published while a draft still awaits review, or a technical fix that nothing recorded confirms. Choose none when the facts support every claim. A reply saying something was fixed is not evidence that it was.",
    maxCandidates: 40,
    permission: "platform.admin",
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveSupportClaimFixture,
    fixture: {
      state: claimFixture.state,
      candidates: claimFixture.candidates,
      judgment: resolveSupportClaimFixture({ state: claimFixture.state, candidates: claimFixture.candidates }) ?? { kind: "choice", choice: SUPPORT_NONE, probabilities: { [SUPPORT_NONE]: 1 } },
    },
  },
];
