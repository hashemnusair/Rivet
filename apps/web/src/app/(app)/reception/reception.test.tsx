import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary } from "@/lib/domain/types";
import { money } from "@/lib/utils/money";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { REASON_CODE_LABELS } from "@/features/reception/reason-codes";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ReceptionPage from "./page";

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reception",
}));

afterEach(() => {
  vi.useRealTimers();
  resetApiForTests();
  vi.clearAllMocks();
});

/** Finds a seeded member at the receptionist's branch matching a predicate. */
async function findMember(
  role: "receptionist" | "manager" | "owner",
  predicate: (m: MemberSummary) => boolean,
): Promise<{ member: MemberSummary; branchId: string; probe: MockGymOSApi }> {
  const probe = new MockGymOSApi();
  probe.setBehavior({ latencyMs: 0 });
  const session = await probe.switchDemoRole(role);
  const branchId = session.activeBranchId ?? session.branches[0]!.id;
  const page = await probe.listMembers({ branchId, pageSize: 200 });
  const member = page.items.find(predicate);
  if (!member) throw new Error("no seeded member matched the predicate");
  return { member, branchId, probe };
}

/** The reason label the decision engine will actually produce for this member. */
async function expectedReasonLabel(probe: MockGymOSApi, branchId: string, query: string): Promise<string> {
  const preview = await probe.previewCheckIn({ branchId, query });
  const code = preview.reasonCodes.find((c) => c !== "OK")!;
  return REASON_CODE_LABELS[code];
}

async function lookup(query: string) {
  const user = userEvent.setup();
  const input = await screen.findByTestId("reception-search");
  await user.clear(input);
  await user.type(input, query);
  return user;
}

describe("reception console — idle", () => {
  it("asks an all-branch owner for operating scope without mislabeling it as a role denial", async () => {
    const { api } = await renderWithApp(<ReceptionPage />, { role: "owner" });

    expect(await screen.findByRole("heading", { name: /choose a branch to open reception/i })).toBeInTheDocument();
    expect(screen.queryByText(/not allowed for this role/i)).not.toBeInTheDocument();

    const session = await api.getSession();
    const branch = session.branches[0]!;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: branch.name }));

    expect(await screen.findByTestId("reception-search")).toHaveFocus();
    expect((await api.getSession()).activeBranchId).toBe(branch.id);
    expect(window.sessionStorage.getItem("rivet.demo.branch")).toBe(branch.id);
  });

  it("focuses the lookup lane and invites the next member", async () => {
    await renderWithApp(<ReceptionPage />, { role: "receptionist" });

    const input = await screen.findByTestId("reception-search");
    expect(input).toHaveFocus();
    expect(screen.getByText(/ready for the next member/i)).toBeInTheDocument();
  });

  it("shows today's check-in count and attendance log instead of inferred occupancy", async () => {
    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    expect(await screen.findByText(/check-ins today/i)).toBeInTheDocument();
    expect(screen.getByText(/today's check-in log/i)).toBeInTheDocument();
    expect(screen.queryByText(/in the gym now/i)).not.toBeInTheDocument();
  });

  it("waits for enough characters before searching", async () => {
    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup("ab");
    // Still idle — no verdict is rendered for a 2-character query.
    expect(screen.queryByTestId("checkin-verdict")).not.toBeInTheDocument();
  });
});

describe("reception console — allowed", () => {
  it("shows a green ALLOWED verdict with the member's plan and balance", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup(member.memberNumber);

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(verdict).toHaveAttribute("data-decision", "allowed");
    expect(within(verdict).getByText("Allowed")).toBeInTheDocument();
    expect(within(verdict).getByText(member.fullName)).toBeInTheDocument();
    expect(within(verdict).getByText(/welcome in/i)).toBeInTheDocument();
    expect(within(verdict).getByText("Plan")).toBeInTheDocument();
    expect(within(verdict).getByText("Balance")).toBeInTheDocument();
  });

  it("keeps long bilingual identities separate from membership facts", async () => {
    const probe = new MockGymOSApi();
    const managerSession = await probe.switchDemoRole("manager");
    const branchId = managerSession.branches[0]!.id;
    const { api } = await renderWithApp(<ReceptionPage />, { role: "manager", branchId });
    const session = await api.getSession();
    expect(session.activeBranchId).toBe(branchId);
    const members = await api.listMembers({ branchId, pageSize: 200 });
    const seededMember = members.items.find((candidate) => candidate.status === "active");
    if (!seededMember) throw new Error("no active seeded member available for layout regression");

    const longName = "Production QA Member — Front Desk Verification Name That Must Wrap";
    const longArabicName = "عضو اختبار الإنتاج — اسم طويل يجب أن يلتف دون تداخل";
    await api.updateMember(seededMember.id, { fullName: longName, fullNameAr: longArabicName });

    await lookup(seededMember.memberNumber);

    const verdict = await screen.findByTestId("checkin-verdict");
    const identity = within(verdict).getByTestId("checkin-identity");
    const facts = within(verdict).getByTestId("checkin-facts");
    expect(identity).toHaveClass("min-w-0");
    expect(facts).toHaveClass("min-w-0");
    expect(within(identity).getByText(longName)).toBeInTheDocument();
    expect(within(identity).getByText(longArabicName)).toHaveAttribute("dir", "rtl");
  });

  it("records the check-in and confirms with a timestamp", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );

    const { api } = await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = await lookup(member.memberNumber);

    await screen.findByTestId("confirm-checkin");
    await user.click(screen.getByTestId("confirm-checkin"));

    await waitFor(() => expect(screen.getByText(/checked in ·/i)).toBeInTheDocument());
    expect(screen.getByTestId("next-member")).toBeInTheDocument();

    // The decision reached the mock, not just the screen.
    const recent = await api.listRecentCheckIns({ pageSize: 5 });
    expect(recent.items[0]!.memberId).toBe(member.id);
    expect(recent.items[0]!.decision).toBe("allowed");
  });

  it("keeps the recorded verdict visible until staff deliberately moves on", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = await lookup(member.memberNumber);
    await user.click(await screen.findByTestId("confirm-checkin"));
    await screen.findByTestId("next-member");

    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(10_000));
    vi.useRealTimers();

    expect(screen.getByText(/checked in ·/i)).toBeInTheDocument();
    expect(screen.getByTestId("reception-search")).toHaveValue(member.memberNumber);
  });

  it("clears the lane for the next member", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = await lookup(member.memberNumber);
    await user.click(await screen.findByTestId("confirm-checkin"));
    await screen.findByTestId("next-member");

    await user.click(screen.getByTestId("next-member"));

    await waitFor(() => expect(screen.getByTestId("reception-search")).toHaveValue(""));
    expect(screen.getByText(/ready for the next member/i)).toBeInTheDocument();
  });
});

describe("reception console — warning", () => {
  it("lets a member with a balance in, but states the amount and offers to collect", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => (m.membershipStatus === "active" || m.membershipStatus === "expiring") && m.outstanding.amount > 0,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup(member.memberNumber);

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(verdict).toHaveAttribute("data-decision", "warning");
    expect(within(verdict).getByText(/let in — with a notice/i)).toBeInTheDocument();
    // The reason list spells the balance out (the Balance cell also shows it).
    expect(within(verdict).getByText(REASON_CODE_LABELS.OUTSTANDING_BALANCE)).toBeInTheDocument();
    // Entry is still permitted…
    expect(screen.getByTestId("confirm-checkin")).toBeEnabled();
    // …and the money can be taken on the spot.
    expect(screen.getByTestId("quick-collect")).toBeInTheDocument();
  });
});

describe("reception console — blocked", () => {
  it("blocks an expired membership, explains why, and offers renewal", async () => {
    const { member, branchId, probe } = await findMember("receptionist", (m) => m.membershipStatus === "expired");
    const reason = await expectedReasonLabel(probe, branchId, member.memberNumber);

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup(member.memberNumber);

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(verdict).toHaveAttribute("data-decision", "blocked");
    expect(within(verdict).getByText("Blocked")).toBeInTheDocument();
    // The desk is told which rule stopped them, in plain words.
    expect(within(verdict).getByText(reason)).toBeInTheDocument();

    // No check-in button at all — the desk cannot wave them through.
    expect(screen.queryByTestId("confirm-checkin")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-renew")).toBeInTheDocument();
  });

  it("tells a receptionist that only a manager can override", async () => {
    const { member } = await findMember("receptionist", (m) => m.membershipStatus === "expired");

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup(member.memberNumber);

    await screen.findByTestId("checkin-verdict");
    expect(screen.queryByTestId("override-checkin")).not.toBeInTheDocument();
    expect(screen.getByText(/a manager can override this/i)).toBeInTheDocument();
  });

  it("reports a lookup that matches nobody", async () => {
    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup("zzzz-nobody");

    expect(await screen.findByText(/no member matches/i)).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-verdict")).not.toBeInTheDocument();
  });
});

describe("reception console — override", () => {
  it("offers override to a manager and requires a reason before allowing entry", async () => {
    const { member, branchId } = await findMember("manager", (m) => m.membershipStatus === "expired");

    await renderWithApp(<ReceptionPage />, { role: "manager", branchId });
    const user = await lookup(member.memberNumber);

    await user.click(await screen.findByTestId("override-checkin"));

    // The dialog restates the block reasons and names who is accountable.
    expect(await screen.findByText(/override and let in/i)).toBeInTheDocument();
    expect(screen.getByText(/entry was blocked because/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/i)).toBeInTheDocument();

    // Cannot commit without a reason.
    expect(screen.getByTestId("confirm-override")).toBeDisabled();

    await user.type(screen.getByTestId("override-reason"), "Paid at Abdoun this morning, receipt shown");
    expect(screen.getByTestId("confirm-override")).toBeEnabled();
  });

  it("records the override with its reason on the audit trail", async () => {
    const { member, branchId } = await findMember("manager", (m) => m.membershipStatus === "expired");

    const { api } = await renderWithApp(<ReceptionPage />, { role: "manager", branchId });
    const user = await lookup(member.memberNumber);

    await user.click(await screen.findByTestId("override-checkin"));
    await user.type(await screen.findByTestId("override-reason"), "Renewing at the desk right now");
    await user.click(screen.getByTestId("confirm-override"));

    await waitFor(() => expect(screen.getByText(/checked in ·/i)).toBeInTheDocument());

    const audit = await api.listAuditEvents({ category: "checkins", pageSize: 10 });
    const event = audit.items.find((e) => e.action === "checkin.override" && e.entityId === member.id);
    expect(event?.reason).toBe("Renewing at the desk right now");
  });
});

describe("reception console — cash gating", () => {
  it("keeps collection available while a shift is open", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => (m.membershipStatus === "active" || m.membershipStatus === "expiring") && m.outstanding.amount > 0,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    await lookup(member.memberNumber);

    await screen.findByTestId("checkin-verdict");
    // The seed leaves a shift open at the branch, so cash is enabled.
    expect(screen.getByTestId("quick-collect")).toBeEnabled();
    expect(screen.getByText(/shift open/i)).toBeInTheDocument();
  });
});

describe("reception console — ambiguous lookup", () => {
  it("asks the desk to choose between people who share a name before showing any verdict", async () => {
    const { api } = await renderWithApp(<ReceptionPage />, {
      role: "receptionist",
      prepare: async (api) => {
        const session = await api.switchDemoRole("receptionist");
        const branchId = session.activeBranchId ?? session.branches[0]!.id;
        await api.switchDemoRole("owner");
        await api.createMember({ fullName: "Lookup Twin Alpha", phone: "+962 79 700 0001", homeBranchId: branchId, preferredLanguage: "en", gender: "female" });
        await api.createMember({ fullName: "Lookup Twin Beta", phone: "+962 79 700 0002", homeBranchId: branchId, preferredLanguage: "en", gender: "male" });
      },
    });
    const user = await lookup("Lookup Twin");

    const list = await screen.findByTestId("checkin-candidates");
    expect(within(list).getAllByTestId("checkin-candidate")).toHaveLength(2);
    expect(within(list).getByText(/2 members match/)).toBeInTheDocument();
    // No decision is rendered for the first name in the list.
    expect(screen.queryByTestId("checkin-verdict")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-checkin")).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: /Lookup Twin Beta/ }));

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(within(verdict).getByText("Lookup Twin Beta")).toBeInTheDocument();
    const beta = (await api.listMembers({ search: "Lookup Twin Beta", pageSize: 5 })).items[0]!;
    expect(screen.getByTestId("reception-search")).toHaveValue(beta.memberNumber);
  });
});

describe("reception console — repeat scan", () => {
  it("says when the member already came in instead of reading as a denial", async () => {
    let memberNumber = "";
    await renderWithApp(<ReceptionPage />, {
      role: "receptionist",
      prepare: async (api) => {
        const session = await api.switchDemoRole("receptionist");
        const branchId = session.activeBranchId ?? session.branches[0]!.id;
        const member = (await api.listMembers({ branchId, pageSize: 200 })).items.find((m) => m.membershipStatus === "active" && m.outstanding.amount === 0);
        if (!member) throw new Error("no seeded member for the repeat-scan check");
        memberNumber = member.memberNumber;
        await api.createCheckIn({ memberId: member.id, branchId });
      },
    });
    await lookup(memberNumber);

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(within(verdict).getByText("Already checked in")).toBeInTheDocument();
    expect(within(verdict).getByText(/already checked in at .* no second visit was recorded/i)).toBeInTheDocument();
    expect(within(verdict).queryByText("Blocked")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-checkin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("override-checkin")).not.toBeInTheDocument();
    expect(screen.getByTestId("next-member")).toBeInTheDocument();
  });
});

describe("reception console — no open shift", () => {
  it("still lets the desk take a card payment and explains why cash is unavailable", async () => {
    let target: MemberSummary | undefined;
    await renderWithApp(<ReceptionPage />, {
      role: "receptionist",
      prepare: async (api) => {
        const session = await api.switchDemoRole("receptionist");
        const branchId = session.activeBranchId ?? session.branches[0]!.id;
        target = (await api.listMembers({ branchId, pageSize: 200 })).items.find(
          (m) => (m.membershipStatus === "active" || m.membershipStatus === "expiring") && m.outstanding.amount > 0,
        );
        await api.switchDemoRole("owner");
        const current = await api.getCurrentShiftTotals(branchId);
        if (current) {
          const { shift, totals } = current;
          await api.closeCashShift(shift.id, { countedCash: money(shift.openingFloat.amount + totals.cashPayments.amount - totals.cashRefunds.amount) });
        }
      },
    });
    if (!target) throw new Error("no seeded member with a balance at the desk's branch");
    const user = await lookup(target.memberNumber);

    await screen.findByTestId("checkin-verdict");
    expect(screen.getByText(/no shift open/i)).toBeInTheDocument();
    expect(screen.getByTestId("quick-collect")).toBeEnabled();

    await user.click(screen.getByTestId("quick-collect"));
    expect(await screen.findByText(/no cash shift is open at this desk/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("payment-method")).not.toHaveTextContent(/^Cash$/));
  });
});

describe("reception console — after collecting", () => {
  it("refreshes the recorded verdict's balance once the money is taken", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => (m.membershipStatus === "active" || m.membershipStatus === "expiring") && m.outstanding.amount > 0 && (m.outstandingCharges?.length ?? 0) === 1,
    );

    await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = await lookup(member.memberNumber);
    await user.click(await screen.findByTestId("confirm-checkin"));
    await screen.findByTestId("next-member");

    await user.click(screen.getByTestId("quick-collect"));
    await user.click(await screen.findByTestId("confirm-payment"));
    // The dialog confirms the recorded receipt before the desk moves on.
    expect(await screen.findByTestId("payment-collected")).toHaveTextContent(/Receipt R-/);
    await user.click(screen.getByTestId("payment-done"));

    await waitFor(() => expect(screen.queryByTestId("quick-collect")).not.toBeInTheDocument());
    const verdict = screen.getByTestId("checkin-verdict");
    expect(within(verdict).getByText(/checked in ·/i)).toBeInTheDocument();
    expect(within(within(verdict).getByTestId("checkin-facts")).getByText("0.000")).toBeInTheDocument();
  });
});

describe("reception console — scanner Enter", () => {
  it("commits a scanned member number whose Enter arrived before the verdict", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );
    const { api } = await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = userEvent.setup();
    const input = await screen.findByTestId("reception-search");

    // A keyboard-wedge scanner types the number and sends Enter within a few
    // milliseconds — well inside the lookup debounce.
    await user.type(input, `${member.memberNumber}{enter}`);

    await waitFor(() => expect(screen.getByText(/checked in ·/i)).toBeInTheDocument());
    const recent = await api.listRecentCheckIns({ pageSize: 5 });
    expect(recent.items[0]!.memberId).toBe(member.id);
  });

  it("never auto-commits a typed name, even when it matches one person", async () => {
    const { member } = await findMember(
      "receptionist",
      (m) => m.membershipStatus === "active" && m.outstanding.amount === 0,
    );
    const { api } = await renderWithApp(<ReceptionPage />, { role: "receptionist" });
    const user = userEvent.setup();
    const input = await screen.findByTestId("reception-search");

    await user.type(input, `${member.fullName}{enter}`);

    const verdict = await screen.findByTestId("checkin-verdict");
    expect(within(verdict).getByText(member.fullName)).toBeInTheDocument();
    // The desk still has to confirm: the verdict is shown, not recorded.
    expect(screen.getByTestId("confirm-checkin")).toBeInTheDocument();
    expect(screen.queryByText(/checked in ·/i)).not.toBeInTheDocument();
    const recent = await api.listRecentCheckIns({ memberId: member.id, pageSize: 5 });
    expect(recent.items.some((item) => Date.now() - new Date(item.occurredAt).getTime() < 60_000)).toBe(false);
  });
});
