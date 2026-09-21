import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResolutionWorkspace } from "@/features/resolution/resolution-workspace";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MemberSummary } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/members/member", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => resetApiForTests());

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

async function memberWithBalance(api: MockGymOSApi): Promise<MemberSummary> {
  const session = await api.getSession();
  const page = await api.listMembers({ status: "active", pageSize: 150 });
  // The seeded classes and trainer hours live at the first branch.
  const member = page.items.find((candidate) => candidate.membershipStatus === "active" && candidate.outstanding.amount > 0 && candidate.homeBranchId === session.branches[0]?.id);
  if (!member) throw new Error("seed should contain an active member with a balance");
  return member;
}

/** A paid PT package beside the open membership charge: the "I already paid for training" situation. */
async function payForTraining(api: MockGymOSApi, member: MemberSummary): Promise<{ membershipId: string }> {
  const memberships = await api.listMemberships({ memberId: member.id, pageSize: 20, sort: "-startDate" });
  const current = memberships.items.find((term) => term.status === "active" || term.status === "expiring");
  if (!current) throw new Error("expected a current membership");
  const experience = await api.getPtMemberExperience(current.id);
  const ptPackage = experience.packages[0];
  if (!ptPackage) throw new Error("seed should contain a PT package");
  const order = await api.requestPtPackage({ membershipId: current.id, packageId: ptPackage.id, idempotencyKey: crypto.randomUUID() });
  await api.createPayment({ memberId: member.id, chargeId: order.chargeId, amount: { ...ptPackage.totalPrice }, method: "card", externalReference: "CARD-TEST-1" }, crypto.randomUUID());
  return { membershipId: current.id };
}

function Probe() {
  const stored = JSON.parse(window.sessionStorage.getItem("test.member") ?? "{}") as { id: string; name: string };
  return <ResolutionWorkspace memberId={stored.id} memberName={stored.name} />;
}

const remember = (member: MemberSummary) => window.sessionStorage.setItem("test.member", JSON.stringify({ id: member.id, name: member.fullName }));

describe("member resolution workspace", () => {
  it("opens the training payment panel for the brief's goal, keeps the draft, and never nets a PT payment against the membership charge", async () => {
    const user = userEvent.setup();
    let member: MemberSummary | undefined;
    const { api } = await renderWithApp(<Probe />, {
      prepare: async (mock) => {
        await enableAssist(mock);
        member = await memberWithBalance(mock);
        await payForTraining(mock, member);
        // Eight newer notes push the payment off the overview's first page; the panel still finds it.
        for (let index = 0; index < 8; index += 1) await mock.addMemberNote(member.id, { body: `Desk note ${index}` });
        const session = await mock.getSession();
        await mock.createFollowUp({ type: "follow_up", title: `Follow up — ${member.fullName}`, ownerId: session.user.id, dueAt: new Date(Date.now() + 86_400_000).toISOString(), memberId: member.id });
        remember(member);
      },
    });
    const area = await screen.findByTestId("resolution-area");
    const facts = await within(area).findByTestId("resolution-facts");
    expect(facts).toHaveTextContent("Unresolved now:");
    expect(facts).toHaveTextContent("outstanding");
    expect(facts).toHaveTextContent("1 open task");
    const input = within(area).getByRole("textbox", { name: "What are you helping with?" });
    await user.type(input, "I already paid for training");
    await user.click(within(area).getByRole("button", { name: "Find panels" }));
    const panel = await screen.findByTestId("resolution-panel-panel.training_payment");
    expect(await screen.findByTestId("resolution-intent-panel")).toHaveTextContent("Opened Training payment");
    expect(input).toHaveValue("I already paid for training");
    expect(within(panel).getByTestId("resolution-payments-personal_training")).toHaveTextContent("Personal training");
    expect(within(panel).getByTestId("resolution-open-membership-charges")).toHaveTextContent("outstanding");
    expect(within(panel).getByTestId("resolution-service-note")).toHaveTextContent("does not settle the membership charge");
    const overview = await api.listMemberTimeline(member!.id, { pageSize: 6 });
    expect(overview.items.some((event) => event.type === "payment_collected")).toBe(false);
    expect(within(panel).getByTestId("resolution-evidence")).toHaveTextContent("Payment collected");
    const refreshed = await api.getMember(member!.id);
    expect(refreshed.outstanding.amount).toBe(member!.outstanding.amount);
  });

  it("asks when two panels fit, says so when none does, and shows everything on request", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, { prepare: async (mock) => { await enableAssist(mock); remember(await memberWithBalance(mock)); } });
    const area = await screen.findByTestId("resolution-area");
    const input = within(area).getByRole("textbox", { name: "What are you helping with?" });
    await user.type(input, "she says she paid");
    await user.click(within(area).getByRole("button", { name: "Find panels" }));
    const clarify = await screen.findByTestId("resolution-intent-clarify");
    expect(clarify).toHaveTextContent("Which money question is this about?");
    await user.click(within(clarify).getByRole("button", { name: "Balance and payments" }));
    expect(await screen.findByTestId("resolution-panel-panel.balance")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "what is the weather like");
    await user.click(within(area).getByRole("button", { name: "Find panels" }));
    expect(await screen.findByTestId("resolution-intent-none")).toHaveTextContent("No panel on this page matches");
    await user.click(within(area).getByTestId("resolution-show-all"));
    const chips = within(area).getAllByRole("button", { pressed: true });
    expect(chips.length).toBeGreaterThanOrEqual(6);
    expect(within(area).getByTestId("resolution-panels").children.length).toBe(chips.length);
    await user.click(within(area).getByRole("button", { name: "Standard view" }));
    expect(screen.queryByTestId("resolution-panels")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolution area" })).toBeInTheDocument();
  });

  it("keeps every panel reachable when the model fails", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Probe />, { prepare: async (mock) => { await enableAssist(mock); remember(await memberWithBalance(mock)); } });
    const area = await screen.findByTestId("resolution-area");
    vi.spyOn(api, "requestAssistJudgment").mockRejectedValue(new Error("gateway down"));
    await user.type(within(area).getByRole("textbox", { name: "What are you helping with?" }), "a morning class");
    await user.click(within(area).getByRole("button", { name: "Find panels" }));
    expect(await screen.findByTestId("resolution-intent-unavailable")).toHaveTextContent("Continue as usual");
    await user.click(within(area).getByTestId("resolution-chip-panel.classes"));
    expect(await screen.findByTestId("resolution-panel-panel.classes")).toBeInTheDocument();
  });

  it("shows a trainer-role user only the panels the server allows and hides ledger rows without financial read", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, { role: "trainer", prepare: async (mock) => { await mock.switchDemoRole("owner"); await enableAssist(mock); await mock.switchDemoRole("trainer"); const visible = await mock.listMembers({ status: "active", pageSize: 50 }); remember(visible.items[0]!); } });
    const area = await screen.findByTestId("resolution-area");
    await within(area).findByTestId("resolution-chip-panel.balance");
    expect(within(area).queryByTestId("resolution-chip-panel.open_work")).not.toBeInTheDocument();
    await user.click(within(area).getByTestId("resolution-chip-panel.balance"));
    const panel = await screen.findByTestId("resolution-panel-panel.balance");
    expect(within(panel).getByTestId("resolution-payments-restricted")).toHaveTextContent("financial report access");
    expect(within(panel).getByTestId("resolution-charges")).toBeInTheDocument();
  });

  it("emphasises a stated plan priority while keeping every term and price in the table", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, { prepare: async (mock) => { await enableAssist(mock); remember(await memberWithBalance(mock)); } });
    const area = await screen.findByTestId("resolution-area");
    await user.click(await within(area).findByTestId("resolution-chip-panel.plan_compare"));
    const panel = await screen.findByTestId("resolution-panel-panel.plan_compare");
    await user.type(within(panel).getByRole("textbox", { name: "Plan priority request" }), "travels a lot and wants to pause when away");
    await user.click(within(panel).getByRole("button", { name: "Suggest what to emphasise" }));
    expect(await screen.findByTestId("plan-priority-reading")).toHaveTextContent("Emphasise Freezing");
    await user.click(screen.getByTestId("plan-priority-apply"));
    const table = within(panel).getByTestId("plan-comparison");
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers[1]).toBe("Freezing ★");
    expect(headers).toEqual(expect.arrayContaining([expect.stringContaining("Price"), expect.stringContaining("Branch access"), expect.stringContaining("Included training")]));
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(2);
    expect(within(table).getAllByText(/JOD/).length).toBeGreaterThan(1);
  });

  it("refuses to add the member to a class that changed since the suggestion", async () => {
    const user = userEvent.setup();
    let member: MemberSummary | undefined;
    const { api } = await renderWithApp(<Probe />, { prepare: async (mock) => { await enableAssist(mock); member = await memberWithBalance(mock); remember(member); } });
    const area = await screen.findByTestId("resolution-area");
    await user.click(await within(area).findByTestId("resolution-chip-panel.classes"));
    const panel = await screen.findByTestId("resolution-panel-panel.classes");
    await within(panel).findByTestId("resolution-classes-joinable");
    await user.type(within(panel).getByRole("textbox", { name: "Class request" }), "a sunday morning class");
    await user.click(within(panel).getByRole("button", { name: "Which class fits?" }));
    const match = await screen.findByTestId("class-pick-match");
    expect(match).toHaveTextContent("Morning HIIT");
    const context = await api.getMemberResolutionContext(member!.id);
    const suggested = context.classes.options.find((option) => option.name === "Morning HIIT" && option.eligible)!;
    await api.cancelClassOccurrence({ occurrenceId: suggested.id, reason: "Coach unavailable" });
    await user.click(within(match).getByRole("button", { name: "Add to class" }));
    expect(await screen.findByTestId("resolution-class-stale")).toHaveTextContent("changed since the suggestion");
    const occurrences = await api.listClassOccurrences({ branchId: member!.homeBranchId, fromDate: suggested.date, toDate: suggested.date });
    expect(occurrences.find((occurrence) => occurrence.id === suggested.id)?.roster.some((entry) => entry.memberId === member!.id)).toBeFalsy();
  });

  it("treats a language no profile records as unknown instead of guessing from the name", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, {
      prepare: async (mock) => {
        await enableAssist(mock);
        const member = await memberWithBalance(mock);
        remember(member);
        const workspace = await mock.getPtWorkspace();
        const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
        for (const trainer of workspace.trainers) {
          const branchIds = [...new Set([...trainer.branchIds, member.homeBranchId])];
          await mock.upsertPtTrainerProfile({ id: trainer.id, userId: trainer.userId, displayName: trainer.displayName, specialties: trainer.specialties, languages: [], branchIds, status: "published" });
          await mock.replacePtAvailability({ trainerProfileId: trainer.id, rules: weekdays.map((weekday) => ({ branchId: member.homeBranchId, weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: true })), exceptions: [] });
        }
      },
    });
    const area = await screen.findByTestId("resolution-area");
    await user.click(await within(area).findByTestId("resolution-chip-panel.trainers"));
    const panel = await screen.findByTestId("resolution-panel-panel.trainers");
    expect(await within(panel).findByTestId("resolution-trainers-bookable")).toHaveTextContent("languages: not recorded");
    await user.type(within(panel).getByRole("textbox", { name: "Trainer request" }), "an arabic speaking trainer");
    await user.click(within(panel).getByRole("button", { name: "Who fits?" }));
    expect(await screen.findByTestId("trainer-pick-none")).toHaveTextContent("stays unknown");
  });
});
