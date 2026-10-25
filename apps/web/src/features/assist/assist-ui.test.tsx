import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MockDb } from "@/lib/mock/store";
import { AiRunPanel } from "./run-panel";
import { AssistanceSettingsSection } from "./assistance-settings-section";
import { AssistanceLink } from "./assistance-link";
import { NaturalMemberFilters } from "./natural-filters";
import { MemberTasksPanel } from "@/features/members/member-tabs";
import { LocaleProvider } from "@/lib/i18n/provider";
import { systemMessage } from "@/lib/i18n/system-messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({}), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

beforeEach(() => {
  // Radix checkboxes and radios measure themselves; jsdom has no ResizeObserver.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  resetApiForTests();
  vi.unstubAllGlobals();
});

/** A platform admin makes the preview gym available first; until then its owner cannot turn assistance on. */
async function makeAvailable(api: MockGymOSApi) {
  const session = await api.getSession();
  await api.setPlatformAiAvailability({ organizationId: session.organization.id, available: true, reason: "Test gym" });
}

async function enable(api: MockGymOSApi, mode: "prepare" | "execute" = "execute") {
  await makeAvailable(api);
  const settings = await api.getAiSettings();
  await api.updateAiSettings({ tenantMode: mode, expectedRevision: settings.revision });
}

async function activeMemberId(api: MockGymOSApi): Promise<string> {
  const page = await api.listMembers({ status: "active", pageSize: 20 });
  const member = page.items.find((item) => item.membershipStatus === "active") ?? page.items[0];
  if (!member) throw new Error("seed should contain an active member");
  return member.id;
}

describe("assistance beside the contact form", () => {
  function contactDialog(holder: { memberId: string }) {
    return function Dialog() { return <LogContactDialog subject="member" memberId={holder.memberId} open hideTrigger />; };
  }

  it("adds nothing while assistance is off, so the ordinary form is unchanged", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    await renderWithApp(<Dialog />, { prepare: async (api) => { holder.memberId = await activeMemberId(api); } });
    expect(await screen.findByTestId("log-contact-form")).toBeInTheDocument();
    expect(screen.queryByTestId("member-brief")).not.toBeInTheDocument();
    expect(screen.queryByTestId("note-assist")).not.toBeInTheDocument();
  });

  it("shows the member brief and fills fields from a note without saving anything until the person saves", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    expect(await screen.findByTestId("member-brief-headline")).toBeInTheDocument();
    await user.type(screen.getByTestId("contact-notes"), "No answer, try again tomorrow evening");
    await user.click(screen.getByTestId("note-assist-fill"));
    expect(await screen.findByTestId("note-assist-suggestions")).toBeInTheDocument();
    await user.click(screen.getByTestId("note-assist-use-all"));
    expect(screen.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByTestId("contact-next-followup") as HTMLInputElement).value).not.toBe("");
    expect(screen.getByText(/Call at 18:00/)).toBeInTheDocument();
    expect((await api.listTasks({ memberId: holder.memberId, status: "open", pageSize: 50 })).items.every((task) => !task.origin)).toBe(true);
  });

  it("never replaces an outcome the person already chose", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    await screen.findByTestId("note-assist");
    await user.click(screen.getByRole("radio", { name: "Interested" }));
    await user.type(screen.getByTestId("contact-notes"), "No answer, try again tomorrow");
    await user.click(screen.getByTestId("note-assist-fill"));
    const outcome = await screen.findByTestId("note-assist-outcome");
    expect(within(outcome).getByText("You already chose a different value. Yours stays.")).toBeInTheDocument();
    expect(within(outcome).queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Interested" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps a ticked travel note only after the contact saves", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    await screen.findByTestId("note-assist");
    // Relative day counts keep this independent of today's weekday.
    await user.type(screen.getByTestId("contact-notes"), "Travelling, back in 5 days. Call in 6 days evening");
    await user.click(screen.getByTestId("note-assist-fill"));
    await user.click(await screen.findByTestId("note-assist-remember-travel"));
    expect(await api.listMemberMemories(holder.memberId)).toEqual([]);
    await user.click(screen.getByTestId("note-assist-use-all"));
    await user.click(screen.getByTestId("log-contact-submit"));
    await waitFor(async () => expect((await api.listMemberMemories(holder.memberId)).map((memory) => memory.topic)).toEqual(["travel"]));
  });
});

describe("prepared work", () => {
  it("shows saved tasks and every exclusion with its reason, and offers no controls once finished", async () => {
    const holder = { runId: "" };
    function Panel() { return <AiRunPanel runId={holder.runId} />; }
    await renderWithApp(<Panel />, { prepare: async (api) => { await enable(api); holder.runId = (await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "ui-request-1" })).id; } });
    await waitFor(() => expect(screen.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "completed"), { timeout: 5_000 });
    expect(screen.getByTestId("ai-run-stage")).toHaveTextContent("Ready");
    expect(screen.getByTestId("ai-run-counts")).toHaveTextContent(/Created: \d+/);
    expect(screen.getByTestId("ai-run-results")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-run-cancel")).not.toBeInTheDocument();
  });

  it("stops at the next step and says what was already saved", async () => {
    const holder = { runId: "" };
    function Panel() { return <AiRunPanel runId={holder.runId} />; }
    const user = userEvent.setup();
    await renderWithApp(<Panel />, { latencyMs: 1, prepare: async (api) => { await enable(api); holder.runId = (await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "ui-request-2" })).id; } });
    await user.click(await screen.findByTestId("ai-run-cancel"));
    await waitFor(() => expect(screen.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "cancelled"), { timeout: 5_000 });
    expect(screen.getByTestId("ai-run-stage")).toHaveTextContent("Stopped");
  });
});

describe("prepared approvals", () => {
  /** A closed drawer 4.250 over with one card payment of exactly that amount. */
  function seedOverDrawer(api: MockGymOSApi): string {
    const db = (api as unknown as { db: MockDb }).db;
    const branchId = db.branches[0]!.id;
    const shiftId = "ui-cash-shift";
    const currency = db.organization.currency;
    const payment = (id: string, method: "cash" | "card", amount: number) => ({ id, organizationId: db.organization.id, branchId, memberId: db.members[0]!.id, type: "payment" as const, amount: { amount, currency }, method, status: "completed" as const, receiptId: `${id}-receipt`, receiptNumber: id.toUpperCase(), collectedById: db.users[0]!.id, collectedByName: db.users[0]!.name, shiftId, idempotencyKey: id, occurredAt: "2026-10-22T08:00:00.000Z" });
    db.payments.push(payment("ui-cash", "cash", 20_000), payment("ui-card", "card", 4_250));
    db.shifts.push({ id: shiftId, organizationId: db.organization.id, branchId, openedById: db.users[0]!.id, openedByName: db.users[0]!.name, openedAt: "2026-10-22T05:00:00.000Z", openingFloat: { amount: 10_000, currency }, closedAt: "2026-10-22T17:00:00.000Z", closedById: db.users[0]!.id, expectedCash: { amount: 30_000, currency }, countedCash: { amount: 34_250, currency }, variance: { amount: 4_250, currency }, varianceExplanation: "Counted twice", varianceApprovalStatus: "pending", status: "closed" });
    return shiftId;
  }

  it("shows exactly what will be saved and approves it through the usual review", async () => {
    const holder = { runId: "", shiftId: "" };
    function Panel() { return <AiRunPanel runId={holder.runId} />; }
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Panel />, { prepare: async (prepared) => { await enable(prepared); holder.shiftId = seedOverDrawer(prepared); holder.runId = (await prepared.startAiRun({ playbook: "cash_difference", params: { shiftId: holder.shiftId }, requestKey: "ui-cash-1" })).id; } });
    await waitFor(() => expect(screen.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "completed"), { timeout: 5_000 });
    expect(await screen.findByTestId("ai-artifact")).toHaveAttribute("data-kind", "cash_difference");
    const card = await screen.findByTestId("ai-proposal");
    expect(within(card).getByText("Approve the cash difference")).toBeInTheDocument();
    expect(within(card).getByText(/matches receipt UI-CARD/)).toBeInTheDocument();
    expect(within(card).getByText(/RIVET cannot approve it/)).toBeInTheDocument();
    await user.click(within(card).getByTestId("ai-proposal-approve"));
    await waitFor(() => expect(screen.getByTestId("ai-proposal")).toHaveAttribute("data-status", "executed"));
    expect((await api.listCashShifts({ pageSize: 200 })).items.find((shift) => shift.id === holder.shiftId)?.varianceApprovalStatus).toBe("approved");
  });
});

describe("natural-language member filters", () => {
  it("is absent while assistance is off", async () => {
    await renderWithApp(<NaturalMemberFilters onApply={() => undefined} />);
    expect(screen.queryByTestId("natural-filters")).not.toBeInTheDocument();
  });

  it("shows what it understood, applies only real list filters and says what it could not apply", async () => {
    const user = userEvent.setup();
    const applied: Array<{ membership?: string }> = [];
    await renderWithApp(<NaturalMemberFilters onApply={(filters) => applied.push(filters)} />, { prepare: async (api) => { await enable(api, "prepare"); } });
    await user.type(await screen.findByTestId("natural-filters-input"), "expiring in 30 days and not visited 3 weeks");
    await user.click(screen.getByTestId("natural-filters-interpret"));
    expect(await screen.findByTestId("natural-filters-membership")).toHaveTextContent("Membership: Ends within 14 days");
    expect(screen.getByText(/you asked about 30 days/)).toBeInTheDocument();
    expect(within(screen.getByTestId("natural-filters-not-applied")).getByText(/Not visited for 21 days/)).toBeInTheDocument();
    await user.click(screen.getByTestId("natural-filters-apply"));
    expect(applied).toEqual([{ membership: "expiring" }]);
  });
});

describe("Settings → Assistance", () => {
  it("stays hidden for a gym RIVET has not made available", async () => {
    await renderWithApp(<><AssistanceLink /><AssistanceSettingsSection /></>);
    expect(await screen.findByTestId("assistance-settings-unavailable")).toHaveTextContent("RIVET has not made assistance available for your gym yet.");
    expect(screen.queryByTestId("assistance-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistance-mode-execute")).not.toBeInTheDocument();
  });

  it("shows the way in once the gym is available", async () => {
    await renderWithApp(<AssistanceLink />, { prepare: makeAvailable });
    expect(await screen.findByTestId("assistance-link")).toHaveTextContent("Now: Off");
  });

  it("lets an owner choose what RIVET may do and saves it", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<AssistanceSettingsSection />, { prepare: makeAvailable });
    expect(await screen.findByTestId("assistance-settings")).toBeInTheDocument();
    expect(screen.getByTestId("assistance-provider")).toHaveTextContent("Test mode");
    await user.click(screen.getByTestId("assistance-mode-execute"));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(async () => expect((await api.getAiSettings()).tenantMode).toBe("execute"));
  });

  it("shows the owner this month's outcomes after work is prepared", async () => {
    const user = userEvent.setup();
    await renderWithApp(<AssistanceSettingsSection />, { prepare: async (api) => {
      await enable(api);
      const run = await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "ui-outcomes-1" });
      await waitFor(async () => expect(["completed", "partially_completed"]).toContain((await api.getAiRun(run.id)).status), { timeout: 5_000 });
    } });
    const outcomes = await screen.findByTestId("assistance-outcomes");
    await user.click(within(outcomes).getByText(/This month: what RIVET did/));
    expect(within(outcomes).getByText(/1 started · 1 ready/)).toBeInTheDocument();
    expect(within(outcomes).getByText(/saved · \d+ done · \d+ still open/)).toBeInTheDocument();
  });
});

/** Mounts its children on a click, after a test has added preview records the session load would otherwise reseed. */
function Deferred({ children }: { children: () => React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return shown ? <>{children()}</> : <button type="button" onClick={() => setShown(true)}>show</button>;
}

describe("titles of tasks RIVET prepared", () => {
  it("shows a prepared task in the reader's language and an older task exactly as it was saved", async () => {
    const user = userEvent.setup();
    let memberId = "";
    const { api } = await renderWithApp(<LocaleProvider initialLocale="ar"><Deferred>{() => <MemberTasksPanel memberId={memberId} />}</Deferred></LocaleProvider>);
    const db = (api as unknown as { db: MockDb }).db;
    const member = db.members.find((item) => item.status === "active")!;
    memberId = member.id;
    const owner = db.users[0]!;
    const base = { organizationId: db.organization.id, ownerId: owner.id, ownerName: owner.name, dueAt: new Date(Date.now() + 3_600_000).toISOString(), priority: "normal" as const, status: "open" as const, memberId: member.id, subjectName: member.fullName, createdById: owner.id, createdAt: new Date().toISOString() };
    db.tasks.push(
      { ...base, id: "task-prepared", type: "renewal_call", title: `Call ${member.fullName} about membership renewal`, titleMessage: systemMessage("communicationCompletion.tasks.renewalCall", { name: member.fullName }), origin: { kind: "ai_run", runId: "run-1", grantId: "grant-1" } },
      { ...base, id: "task-older", type: "renewal_call", title: `Call ${member.fullName} about membership renewal · old`, origin: { kind: "ai_run", runId: "run-0", grantId: "grant-0" } },
    );
    await user.click(screen.getByRole("button", { name: "show" }));
    expect(await screen.findByText(/^الاتصال بـ .+ بشأن تجديد الاشتراك$/)).toBeInTheDocument();
    expect(screen.getByText(/about membership renewal · old$/)).toBeInTheDocument();
  });
});
