import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JEV_QUESTION_ID, buildJevQuestions, canonicalJson, evaluateJevFixture, fixtureRawAnswers, jevStateHash, sanitizeJevSubject, sha256Hex, validateJevAnswers } from "./jevAnswers";
import { jevStateLoader } from "./jevLoaders";
import { JEV_FEATURES, JEV_QUESTIONS, getJevQuestion } from "./jevQuestions";
import { JEV_MAX_SUBJECT_KEYS, validateJevRegistry, type JevChoiceQuestion, type JevQuestion } from "./jevRegistry";
import { PERMISSIONS } from "./permissions";

const planFit = getJevQuestion("foundation.plan_fit") as JevChoiceQuestion;
const ticketRoute = getJevQuestion("foundation.ticket_route") as JevChoiceQuestion;
const noteUrgency = getJevQuestion("foundation.note_urgency")!;
const refund = getJevQuestion("foundation.refund_detected")!;

describe("Jev question registry", () => {
  it("declares only well-formed questions", () => {
    expect(validateJevRegistry(JEV_QUESTIONS, JEV_FEATURES)).toEqual([]);
    expect(JEV_QUESTIONS.length).toBeGreaterThanOrEqual(4);
  });

  it("uses server-owned permissions and has a state loader for every question", () => {
    for (const question of JEV_QUESTIONS) {
      expect(PERMISSIONS, question.key).toContain(question.permission);
      expect(jevStateLoader(question.key), question.key).toBeDefined();
    }
  });

  it("answers every fixture through the real builder and validator", () => {
    for (const question of JEV_QUESTIONS) {
      const outcome = evaluateJevFixture(question);
      expect(outcome.ok, question.key).toBe(true);
      if (outcome.ok) expect(outcome.judgment).toEqual(question.fixture.judgment);
    }
  });

  it("simulated failures come back as classified outcomes, never as judgments", () => {
    expect(evaluateJevFixture(refund, "timeout")).toMatchObject({ ok: false, reason: "timeout", retryable: true });
    expect(evaluateJevFixture(refund, "provider_error")).toMatchObject({ ok: false, reason: "provider_error" });
    for (const question of JEV_QUESTIONS) expect(evaluateJevFixture(question, "invalid_output"), question.key).toMatchObject({ ok: false, reason: "invalid_output", retryable: false });
  });

  it("reports structural problems instead of throwing", () => {
    const duplicate: JevQuestion = { ...refund };
    const wrongFeature: JevQuestion = { ...refund, key: "crm.refund_detected", feature: "crm" };
    const badScore: JevQuestion = { ...noteUrgency, kind: "score", levels: ["only one"], fixture: noteUrgency.fixture } as JevQuestion;
    const problems = validateJevRegistry([refund, duplicate, wrongFeature, badScore], JEV_FEATURES);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining("declared twice"),
      expect.stringContaining("unknown feature \"crm\""),
      expect.stringContaining("between 2 and 10 levels"),
    ]));
  });
});

describe("candidate scoping", () => {
  it("renumbers candidates so the model never sees an id, and maps the answer back", () => {
    const built = buildJevQuestions(planFit, planFit.fixture.candidates);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const question = built.prepared.questions[JEV_QUESTION_ID]!;
    expect(question.type).toBe("choice");
    if (question.type !== "choice") return;
    expect(Object.keys(question.criteria)).toEqual(["option_01", "option_02", "option_03"]);
    expect(JSON.stringify(question)).not.toContain("plan_b");
    expect(built.prepared.candidateKeys).toEqual({ option_01: "plan_a", option_02: "plan_b", option_03: "plan_c" });
    const validated = validateJevAnswers(planFit, { [JEV_QUESTION_ID]: { type: "choice", choice: "option_02", probabilities: { option_01: 0.1, option_02: 0.8, option_03: 0.1 } } }, built.prepared.candidateKeys);
    expect(validated).toEqual({ ok: true, judgment: { kind: "choice", choice: "plan_b", probabilities: { plan_a: 0.1, plan_b: 0.8, plan_c: 0.1 } } });
  });

  it("refuses candidate lists a request cannot honour", () => {
    expect(buildJevQuestions(planFit, [])).toMatchObject({ ok: false });
    expect(buildJevQuestions(planFit, [{ id: "one", description: "Only one" }])).toMatchObject({ ok: false, message: expect.stringContaining("at least two") });
    expect(buildJevQuestions(planFit, [{ id: "dup", description: "A" }, { id: "dup", description: "B" }])).toMatchObject({ ok: false, message: expect.stringContaining("unique") });
    const tooMany = Array.from({ length: 11 }, (_, index) => ({ id: `c${index}`, description: `Candidate ${index}` }));
    expect(buildJevQuestions(planFit, tooMany)).toMatchObject({ ok: false, message: expect.stringContaining("at most 10") });
  });
});

describe("answer validation", () => {
  const scoped = { option_01: "plan_a", option_02: "plan_b", option_03: "plan_c" };
  it.each([
    ["extra question ids", ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "billing" }, other: { type: "boolean", probability: 1 } }, undefined],
    ["a type that does not match", ticketRoute, { [JEV_QUESTION_ID]: { type: "boolean", probability: 0.9 } }, undefined],
    ["an option that was not offered", ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "refunds" } }, undefined],
    ["a candidate id instead of the scoped key", planFit, { [JEV_QUESTION_ID]: { type: "choice", choice: "plan_b" } }, scoped],
    ["probabilities that do not sum to one", ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "billing", probabilities: { billing: 0.5, access: 0.1 } } }, undefined],
    ["a probability outside the unit interval", refund, { [JEV_QUESTION_ID]: { type: "boolean", probability: 1.2 } }, undefined],
    ["a chosen option that is not the most probable", ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "billing", probabilities: { billing: 0.2, access: 0.8, schedule: 0, other: 0 } } }, undefined],
    ["a score outside the scale", noteUrgency, { [JEV_QUESTION_ID]: { type: "score", score: 3.5 } }, undefined],
    ["score probabilities for a level that does not exist", noteUrgency, { [JEV_QUESTION_ID]: { type: "score", score: 1, probabilities: { "0": 0, "1": 1, "7": 0 } } }, undefined],
    ["a non-object answer", refund, "yes", undefined],
  ])("rejects %s", (_label, question, answers, candidateKeys) => {
    expect(validateJevAnswers(question, answers, candidateKeys)).toMatchObject({ ok: false });
  });

  it("accepts a bare choice, fills the distribution and reads confidence from provider metadata", () => {
    expect(validateJevAnswers(ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "access" } }, undefined, { typesafe: { confidence: { [JEV_QUESTION_ID]: 0.77 } } })).toEqual({
      ok: true,
      judgment: { kind: "choice", choice: "access", probabilities: { billing: 0, access: 1, schedule: 0, other: 0 }, confidence: 0.77 },
    });
    expect(validateJevAnswers(noteUrgency, { [JEV_QUESTION_ID]: { type: "score", score: 1.4 } })).toEqual({
      ok: true,
      judgment: { kind: "score", score: 1.4, level: 1, levelCount: 4, probabilities: { "0": 0, "1": 1, "2": 0, "3": 0 } },
    });
  });

  it("tolerates provider rounding in the distribution", () => {
    expect(validateJevAnswers(ticketRoute, { [JEV_QUESTION_ID]: { type: "choice", choice: "billing", probabilities: { billing: 0.97, access: 0.01, schedule: 0.01, other: 0 } } })).toMatchObject({ ok: true });
  });

  it("produces malformed fixture answers only when asked to simulate", () => {
    expect(validateJevAnswers(refund, fixtureRawAnswers(refund))).toMatchObject({ ok: true });
    expect(validateJevAnswers(refund, fixtureRawAnswers(refund, "invalid_output"))).toMatchObject({ ok: false });
  });
});

describe("state hashing and subjects", () => {
  it("canonical JSON sorts keys at every depth and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("matches Node's SHA-256 for ASCII, empty and Arabic input", () => {
    for (const input of ["", "abc", "The quick brown fox jumps over the lazy dog", "مرحبا بكم في النادي", "x".repeat(200)]) {
      expect(sha256Hex(input)).toBe(createHash("sha256").update(input, "utf8").digest("hex"));
    }
  });

  it("changes the state hash when the question version, source version or state changes", () => {
    const base = { questionKey: "foundation.refund_detected", questionVersion: 1, sourceVersion: "fixture:1", state: refund.fixture.state };
    const hash = jevStateHash(base);
    expect(hash).toHaveLength(64);
    expect(jevStateHash({ ...base, questionVersion: 2 })).not.toBe(hash);
    expect(jevStateHash({ ...base, sourceVersion: "fixture:2" })).not.toBe(hash);
    expect(jevStateHash({ ...base, state: `${refund.fixture.state} ` })).not.toBe(hash);
    expect(jevStateHash(base)).toBe(hash);
  });

  it("keeps subjects to bounded primitives", () => {
    const wide = Object.fromEntries(Array.from({ length: JEV_MAX_SUBJECT_KEYS + 5 }, (_, index) => [`k${index}`, index]));
    expect(Object.keys(sanitizeJevSubject(wide))).toHaveLength(JEV_MAX_SUBJECT_KEYS);
    expect(sanitizeJevSubject({ leadId: "lead-1", nested: { a: 1 }, list: [1], long: "y".repeat(600), flag: true, "bad key": 1, count: Number.NaN })).toEqual({ leadId: "lead-1", long: "y".repeat(512), flag: true });
    expect(sanitizeJevSubject("nope")).toEqual({});
  });
});
