import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS, type CustomerMembership } from "@/lib/public/experience-data";
import MemberDashboardPage from "./page";

const state = vi.hoisted(() => ({
  memberships: [] as CustomerMembership[],
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
  getEntryPass: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ getApi: () => ({ getEntryPass: state.getEntryPass }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => state.searchParams,
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-member-gate", () => ({ useMemberGate: () => ({ ready: true, identitySignedIn: true, profileSelected: true }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useCustomerPersona: () => ({ id: "customer-lina", name: "Lina Haddad", email: "lina@example.com" }),
  useExperience: () => ({ customerMemberships: state.memberships, experienceStatus: "ready" }),
  useMarketplaceGyms: () => MARKETPLACE_GYMS,
}));

const base = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;

describe("member home", () => {
  beforeEach(() => {
    state.memberships = [{ ...base, endDate: "2020-01-31", status: "expiring" }];
    state.searchParams = new URLSearchParams();
    state.replace.mockReset();
    state.getEntryPass.mockReset().mockResolvedValue({ token: "rivet://entry", expiresAt: new Date(Date.now() + 60_000).toISOString(), membershipId: base.id });
  });

  it("states a lapsed membership plainly and keeps the pass and detail one tap away", () => {
    render(<MemberDashboardPage />);

    expect(screen.getByRole("heading", { name: "Hi, Lina" })).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Subscribed gyms" });
    expect(region).toHaveTextContent("1 gym");
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("Ended 31 Jan 2020")).toBeInTheDocument();
    expect(screen.queryByText(/Subscribed until/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forge Fitness Club" })).toHaveAttribute("href", `/customer/my-gyms/${base.id}`);
    expect(screen.getByRole("link", { name: /Membership/ })).toHaveAttribute("href", `/customer/my-gyms/${base.id}`);
    expect(screen.getByRole("button", { name: "Entry QR" })).toBeInTheDocument();
    expect(screen.getByText("ABD-2214")).toBeInTheDocument();
  });

  it("counts remaining days for an active membership", () => {
    state.memberships = [{ ...base, status: "active", endDate: "2999-01-01" }];
    render(<MemberDashboardPage />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Valid until 1 Jan 2999 · \d+ days left/)).toBeInTheDocument();
  });

  it("opens the entry pass from the card and closes it cleanly", async () => {
    const user = userEvent.setup();
    render(<MemberDashboardPage />);
    await user.click(screen.getByRole("button", { name: "Entry QR" }));
    expect(await screen.findByLabelText("Membership entry QR code")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("honours the installed-app entry shortcut and drops the query on close", async () => {
    const user = userEvent.setup();
    state.searchParams = new URLSearchParams("entry=1");
    render(<MemberDashboardPage />);
    expect(await screen.findByLabelText("Membership entry QR code")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/customer/my-gyms", { scroll: false }));
  });

  it("continues an installed-app section shortcut into the only membership", async () => {
    state.searchParams = new URLSearchParams("section=pt");
    render(<MemberDashboardPage />);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith(`/customer/my-gyms/${base.id}?section=pt`));
  });

  it("shows a plain empty state with one way forward", () => {
    state.memberships = [];
    render(<MemberDashboardPage />);
    expect(screen.getByRole("region", { name: "Subscribed gyms" })).toHaveTextContent("0 gyms");
    expect(screen.getByRole("heading", { name: "No gym membership yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find a gym/ })).toHaveAttribute("href", "/customer/discover");
  });
});
