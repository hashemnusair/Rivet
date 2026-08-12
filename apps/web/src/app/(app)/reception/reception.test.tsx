import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary } from "@/lib/domain/types";
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
    const { api } = await renderWithApp(<ReceptionPage />, { role: "manager" });
    const session = await api.getSession();
    const branchId = session.activeBranchId ?? session.branches[0]!.id;
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
    const { member } = await findMember("manager", (m) => m.membershipStatus === "expired");

    await renderWithApp(<ReceptionPage />, { role: "manager" });
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
    const { member } = await findMember("manager", (m) => m.membershipStatus === "expired");

    const { api } = await renderWithApp(<ReceptionPage />, { role: "manager" });
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
