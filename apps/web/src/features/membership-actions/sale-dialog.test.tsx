import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary, MembershipSummary } from "@/lib/domain/types";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { MembershipSaleDialog } from "./sale-dialog";

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
  usePathname: () => "/",
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

function member(overrides: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id: "member-sale-gate",
    memberNumber: "ABD-5001",
    fullName: "Sale Gate Member",
    phone: "+962790005001",
    homeBranchId: "branch-1",
    status: "active",
    tags: [],
    outstanding: money(0),
    createdAt: "2026-08-01T08:00:00Z",
    ...overrides,
  };
}

async function chooseMonthlyPlan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("combobox", { name: "Plan" }));
  await user.click(await screen.findByRole("option", { name: /Monthly Standard/ }));
  await waitFor(() => expect(screen.getByText("Monthly Standard")).toBeInTheDocument());
}

describe("MembershipSaleDialog reason gates", () => {
  it("keeps a future renewal invoice non-collectible until its successor term begins", async () => {
    const { api } = await renderWithApp(<div />);
    const expiringMember = (await api.listMembers({ membershipStatus: "expiring", pageSize: 100 })).items[0];
    if (!expiringMember) throw new Error("missing expiring seeded member");
    const renewalOf = (await api.listMemberships({ memberId: expiringMember.id, pageSize: 100 })).items[0] as MembershipSummary | undefined;
    if (!renewalOf) throw new Error("missing expiring seeded membership");
    resetApiForTests();

    const user = userEvent.setup();
    const onCompleted = vi.fn();
    await renderWithApp(<MembershipSaleDialog open onOpenChange={() => undefined} member={expiringMember} renewalOf={renewalOf} onCompleted={onCompleted} />);

    expect(screen.getByRole("switch", { name: "Collect payment now" })).toBeDisabled();
    expect(screen.getByText(/upcoming invoice becomes collectible when the successor term begins/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("confirm-sale"));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onCompleted.mock.calls[0]?.[0].payment).toBeUndefined();
  });

  it("keeps a listed-price, today, zero-discount sale routine and ungated", async () => {
    const { api } = await renderWithApp(<div />);
    const expiredMember = (await api.listMembers({ membershipStatus: "expired", pageSize: 100 })).items[0];
    if (!expiredMember) throw new Error("missing expired seeded member");
    resetApiForTests();

    const user = userEvent.setup();
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    await renderWithApp(<MembershipSaleDialog open onOpenChange={onOpenChange} member={expiredMember} onCompleted={onCompleted} />);
    await chooseMonthlyPlan(user);

    expect(screen.queryByPlaceholderText("Why does this sale need an exception?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Collect payment now" }));
    await user.click(screen.getByTestId("confirm-sale"));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reveals overrideReason only for a real price/date variance and blocks the submit without it", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await renderWithApp(<MembershipSaleDialog open onOpenChange={onOpenChange} member={member()} />);
    await chooseMonthlyPlan(user);

    const price = screen.getAllByPlaceholderText("40.000")[0];
    if (!price) throw new Error("missing price override input");
    expect(screen.queryByPlaceholderText("Why does this sale need an exception?")).not.toBeInTheDocument();
    await user.type(price, "35");
    expect(screen.getByPlaceholderText("Why does this sale need an exception?")).toBeInTheDocument();

    await user.clear(price);
    expect(screen.queryByPlaceholderText("Why does this sale need an exception?")).not.toBeInTheDocument();

    const startDate = screen.getByDisplayValue(todayISODate());
    fireEvent.change(startDate, { target: { value: addDays(todayISODate(), 1) } });
    expect(screen.getByPlaceholderText("Why does this sale need an exception?")).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reason is required for price or date overrides/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("requires and submits an external reference for inline card collection", async () => {
    const { api } = await renderWithApp(<div />);
    const expiredMember = (await api.listMembers({ membershipStatus: "expired", pageSize: 100 })).items[0];
    if (!expiredMember) throw new Error("missing expired seeded member");
    resetApiForTests();

    const user = userEvent.setup();
    const onCompleted = vi.fn();
    await renderWithApp(<MembershipSaleDialog open onOpenChange={() => undefined} member={expiredMember} onCompleted={onCompleted} />);
    await chooseMonthlyPlan(user);

    await user.click(screen.getByRole("combobox", { name: "Payment method" }));
    await user.click(await screen.findByRole("option", { name: /Card/i }));
    const reference = screen.getByPlaceholderText("e.g. POS-88213");

    await user.click(screen.getByTestId("confirm-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reference is required/i);
    expect(onCompleted).not.toHaveBeenCalled();

    await user.type(reference, "TEST-POS-1001");
    await user.click(screen.getByTestId("confirm-sale"));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(onCompleted.mock.calls[0]?.[0].payment?.externalReference).toBe("TEST-POS-1001");
  });
});
