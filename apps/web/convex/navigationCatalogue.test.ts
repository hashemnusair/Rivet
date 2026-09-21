import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSIONS } from "./permissions";
import {
  NAVIGATION_CLARIFICATIONS,
  NAVIGATION_ENTRIES,
  NAVIGATION_NO_MATCH,
  ONBOARDING_NO_STEP,
  buildNavigationIntentState,
  buildOnboardingNextStepState,
  buildReportFinderState,
  keywordSearchNavigation,
  permittedClarifications,
  permittedNavigationEntries,
  resolveNavigationIntent,
  resolveNavigationIntentFixture,
  resolveOnboardingNextStepFixture,
  resolveReportFinderFixture,
  type NavigationAccess,
} from "./navigationCatalogue";

const allModules = ["revenue", "operations", "finance", "reporting"].map((key) => ({ key, entitled: true, enabled: true }));
const owner: NavigationAccess = { permissions: [...PERMISSIONS], role: "owner", modules: allModules };
const receptionist: NavigationAccess = { permissions: DEFAULT_ROLE_DEFINITIONS.receptionist.permissions, role: "receptionist", modules: allModules };
const ids = (entries: ReadonlyArray<{ id: string }>) => entries.map((entry) => entry.id);

function askFixture(query: string, access: NavigationAccess) {
  const entries = permittedNavigationEntries(access);
  const clarifications = permittedClarifications(entries);
  const built = buildNavigationIntentState({ query, currentPath: "/dashboard", entries, clarifications, role: access.role });
  const judgment = resolveNavigationIntentFixture({ state: built.state, candidates: built.candidates })!;
  return { built, outcome: resolveNavigationIntent(judgment, entries, clarifications) };
}

describe("navigation catalogue integrity", () => {
  it("has unique ids, routes that exist, settings sections that exist and permissions from the server catalogue", () => {
    expect(new Set(ids(NAVIGATION_ENTRIES)).size).toBe(NAVIGATION_ENTRIES.length);
    const settingsSource = readFileSync(join(__dirname, "..", "src", "features", "settings", "settings-page-inner.tsx"), "utf8");
    const sectionIds = new Set([...settingsSource.matchAll(/\{ id: "([a-z_]+)", label:/g)].map((match) => match[1]));
    for (const entry of NAVIGATION_ENTRIES) {
      const [path, query] = entry.href.split("?");
      expect(existsSync(join(__dirname, "..", "src", "app", "(app)", path!.slice(1), "page.tsx")), `${entry.id} points at ${path}`).toBe(true);
      expect(entry.description.length, entry.id).toBeGreaterThan(20);
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
      for (const permission of entry.anyPermission ?? []) expect(PERMISSIONS, `${entry.id} uses ${permission}`).toContain(permission);
      if (entry.kind === "settings") expect(sectionIds.has(new URLSearchParams(query).get("section") ?? ""), `${entry.id} names a Settings section`).toBe(true);
    }
    for (const clarification of NAVIGATION_CLARIFICATIONS) {
      expect(clarification.options.length).toBeGreaterThanOrEqual(2);
      for (const option of clarification.options) expect(ids(NAVIGATION_ENTRIES), `${clarification.id} → ${option}`).toContain(option);
    }
  });

  it("filters by permission, role-independent module status and keeps clarifications only with two permitted options", () => {
    const ownerIds = ids(permittedNavigationEntries(owner));
    expect(ownerIds).toEqual(expect.arrayContaining(["settings.roles", "page.audit", "page.checkout", "report.controls", "form.supplier.payment"]));
    const receptionIds = ids(permittedNavigationEntries(receptionist));
    expect(receptionIds).toEqual(expect.arrayContaining(["page.reception", "form.checkin.start", "form.payment.collect", "page.payments.shifts", "page.members"]));
    expect(receptionIds).not.toEqual(expect.arrayContaining(["settings.roles"]));
    expect(receptionIds).not.toContain("page.audit");
    expect(receptionIds).not.toContain("report.controls");
    expect(receptionIds).not.toContain("form.supplier.payment");
    const noOperations = permittedNavigationEntries({ ...owner, modules: allModules.map((module) => (module.key === "operations" ? { ...module, enabled: false } : module)) });
    expect(ids(noOperations)).not.toContain("page.checkout");
    expect(ids(noOperations)).not.toContain("form.supplier.payment");
    expect(ids(noOperations)).toContain("page.members");
    expect(ids(permittedNavigationEntries({ ...owner, modules: undefined }))).toContain("page.checkout");
    expect(ids(permittedClarifications(permittedNavigationEntries(owner)))).toContain("clarify.payment");
    // Reception may check people in but may not read reports, so the check-in clarification has one option and is dropped.
    expect(ids(permittedClarifications(permittedNavigationEntries(receptionist)))).toEqual(["clarify.member_change"]);
    expect(ids(permittedClarifications(permittedNavigationEntries(owner)))).toContain("clarify.check_in");
  });

  it("keeps the fast keyword search exact-first and permission-bound", () => {
    const entries = permittedNavigationEntries(owner);
    expect(keywordSearchNavigation(entries, "Members")[0]?.id).toBe("page.members");
    expect(ids(keywordSearchNavigation(entries, "refund"))).toEqual(expect.arrayContaining(["settings.roles", "report.controls"]));
    expect(ids(keywordSearchNavigation(entries, "csv"))).toEqual(expect.arrayContaining(["form.members.import", "page.exports"]));
    expect(ids(keywordSearchNavigation(permittedNavigationEntries(receptionist), "refund"))).not.toContain("settings.roles");
    expect(keywordSearchNavigation(entries, "x")).toEqual([]);
  });
});

describe("intent state and outcomes", () => {
  it("offers only permitted ids plus clarifications and no-match, and never sends the permission list", () => {
    const entries = permittedNavigationEntries(receptionist);
    const built = buildNavigationIntentState({ query: "who can refund", currentPath: "/reception", entries, clarifications: permittedClarifications(entries), role: "receptionist" });
    const candidateIds = built.candidates.map((candidate) => candidate.id);
    expect(candidateIds).toContain(NAVIGATION_NO_MATCH);
    expect(candidateIds).not.toContain("settings.roles");
    expect(candidateIds.filter((id) => id.startsWith("clarify."))).toEqual(ids(permittedClarifications(entries)));
    expect(JSON.stringify(built.state)).not.toContain("members.read");
    expect(built.state).toMatchObject({ request: "who can refund", currentPage: "/reception", role: "receptionist" });
    expect(buildNavigationIntentState({ query: "x".repeat(400), entries, clarifications: [], role: "owner" }).state).toMatchObject({ request: "x".repeat(200) });
  });

  it("resolves the brief's examples deterministically in previews", () => {
    expect(askFixture("Where do I change who can refund?", owner).outcome).toMatchObject({ kind: "destination", entry: { id: "settings.roles" } });
    expect(askFixture("Record a payment", owner).outcome).toMatchObject({ kind: "clarify", clarification: { id: "clarify.payment" }, options: [{ id: "form.payment.collect" }, { id: "form.supplier.payment" }] });
    expect(askFixture("Record a payment", receptionist).outcome).toMatchObject({ kind: "destination", entry: { id: "form.payment.collect" } });
    expect(askFixture("Move her to another branch next month", owner).outcome).toMatchObject({ kind: "clarify", clarification: { id: "clarify.member_change" } });
    expect(askFixture("what is the capital of france", owner).outcome).toMatchObject({ kind: "no_match" });
    expect(askFixture("collect a member payment", owner).outcome).toMatchObject({ kind: "destination", entry: { id: "form.payment.collect" } });
    expect(askFixture("Where do I change who can refund?", receptionist).outcome.kind).not.toBe("destination");
  });

  it("turns any id outside the permitted lists into no-match, whatever the model said", () => {
    const entries = permittedNavigationEntries(receptionist);
    const clarifications = permittedClarifications(entries);
    expect(resolveNavigationIntent({ kind: "choice", choice: "settings.roles", probabilities: { "settings.roles": 1 } }, entries, clarifications)).toMatchObject({ kind: "no_match" });
    expect(resolveNavigationIntent({ kind: "choice", choice: "clarify.payment", probabilities: { "clarify.payment": 1 } }, entries, clarifications)).toMatchObject({ kind: "no_match" });
    expect(resolveNavigationIntent({ kind: "choice", choice: "page.reception", probabilities: { "page.reception": 0.8 } }, entries, clarifications)).toMatchObject({ kind: "destination", entry: { id: "page.reception" }, probability: 0.8 });
    expect(resolveNavigationIntent({ kind: "boolean", probability: 1 }, entries, clarifications)).toMatchObject({ kind: "no_match" });
  });
});

describe("onboarding next step and report finder", () => {
  it("lifts the first open required step and says so when nothing is open", () => {
    const tasks = [
      { key: "owner_identity", title: "Confirm identity", description: "d", category: "required" as const, href: "/settings", complete: true },
      { key: "owner_public_profile", title: "Publish profile", description: "d", category: "recommended" as const, href: "/settings?section=profile", complete: false },
      { key: "owner_plan", title: "Create a plan", description: "d", category: "required" as const, href: "/plans", complete: false },
      { key: "owner_provider", title: "Providers", description: "d", category: "optional" as const, href: "/automations", complete: false, unavailableReason: "not yet" },
    ];
    const built = buildOnboardingNextStepState({ audience: "owner", tasks, facts: { plans: 0 } });
    expect(built.candidates.map((candidate) => candidate.id)).toEqual(["owner_public_profile", "owner_plan", ONBOARDING_NO_STEP]);
    expect(resolveOnboardingNextStepFixture({ state: built.state, candidates: built.candidates })).toMatchObject({ kind: "choice", choice: "owner_plan" });
    const done = buildOnboardingNextStepState({ audience: "owner", tasks: tasks.map((task) => ({ ...task, complete: true })), facts: {} });
    expect(resolveOnboardingNextStepFixture({ state: done.state, candidates: done.candidates })).toMatchObject({ kind: "choice", choice: ONBOARDING_NO_STEP });
  });

  it("finds the report view for a question without touching dates or branches", () => {
    const entries = permittedNavigationEntries(owner);
    const ask = (question: string) => { const built = buildReportFinderState({ question, entries }); return resolveReportFinderFixture({ state: built.state, candidates: built.candidates })?.kind === "choice" ? (resolveReportFinderFixture({ state: built.state, candidates: built.candidates }) as { choice: string }).choice : undefined; };
    expect(ask("who is about to leave us?")).toBe("report.retention");
    expect(ask("how busy are mornings?")).toBe("report.peak_hours");
    expect(ask("what do we still have to collect?")).toBe("report.collections");
    expect(ask("what is the meaning of life")).toBe(NAVIGATION_NO_MATCH);
    const built = buildReportFinderState({ question: "who is about to leave?", entries });
    expect(built.candidates.every((candidate) => candidate.id.startsWith("report.") || candidate.id === NAVIGATION_NO_MATCH)).toBe(true);
    expect(JSON.stringify(built.state)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
