import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS, type CustomerMembership, type MarketplaceGym, type TrialBooking } from "@/lib/public/experience-data";
import MemberDashboardPage from "./page";

const state = vi.hoisted(() => ({
  memberships: [] as CustomerMembership[],
  bookings: [] as TrialBooking[],
  gyms: undefined as MarketplaceGym[] | undefined,
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
  useExperience: () => ({ customerMemberships: state.memberships, customerBookings: state.bookings, experienceStatus: "ready" }),
  useMarketplaceGyms: () => state.gyms ?? MARKETPLACE_GYMS,
}));

const base = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;

describe("member home", () => {
  beforeEach(() => {
    state.memberships = [{ ...base, endDate: "2020-01-31", status: "expiring" }];
    state.bookings = [];
    state.gyms = undefined;
    state.searchParams = new URLSearchParams();
    state.replace.mockReset();
    state.getEntryPass.mockReset().mockResolvedValue({ token: "rivet://entry", expiresAt: new Date(Date.now() + 60_000).toISOString(), membershipId: base.id });
  });

  it("states a lapsed membership plainly and keeps the pass and detail one tap away", () => {
    render(<MemberDashboardPage />);

    expect(screen.getByRole("heading", { name: "Hi, Lina" })).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Your gyms" });
    expect(region).toHaveTextContent("1 gym");
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("Ended 31 Jan 2020")).toBeInTheDocument();
    expect(screen.queryByText(/Subscribed until/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forge Fitness Club" })).toHaveAttribute("href", `/customer/my-gyms/${base.id}`);
    expect(screen.getByRole("link", { name: /Membership/ })).toHaveAttribute("href", `/customer/my-gyms/${base.id}`);
    expect(screen.getByRole("button", { name: "Entry code" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Entry code" }));
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
    expect(screen.getByRole("region", { name: "Your gyms" })).toHaveTextContent("0 gyms");
    expect(screen.getByRole("heading", { name: "No gym membership yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Find a gym/ })).toHaveAttribute("href", "/customer/discover");
  });

  it("lists open requests and says how to pay for an unpaid day pass", () => {
    const gym = MARKETPLACE_GYMS[0]!;
    state.gyms = [{ ...gym, trialOffer: { kind: "day_pass", dayPassPrice: { amount: 5_000, currency: "JOD" }, cliqAlias: "FORGEGYM" } }, ...MARKETPLACE_GYMS.slice(1)];
    const request = { gymId: gym.id, branchId: gym.branches[0]!.id, fullName: "Lina Haddad", email: "lina@example.com", phone: "+962790000000", goal: "Day pass", createdAt: "2026-11-01T10:00:00.000Z", customerId: "customer-lina" };
    state.bookings = [
      { ...request, id: "pass-cliq", preferredDate: "2026-11-20", preferredTime: "09:00", status: "requested", kind: "day_pass", price: { amount: 5_000, currency: "JOD" }, paymentMethod: "cliq", paymentStatus: "unpaid" },
      { ...request, id: "pass-paid", preferredDate: "2026-11-21", preferredTime: "09:00", status: "confirmed", kind: "day_pass", price: { amount: 5_000, currency: "JOD" }, paymentMethod: "cash", paymentStatus: "paid" },
      { ...request, id: "trial", preferredDate: "2026-11-22", preferredTime: "18:00", status: "requested", goal: "Strength" },
      { ...request, id: "closed", preferredDate: "2026-11-02", preferredTime: "18:00", status: "cancelled", goal: "Strength" },
    ];
    render(<MemberDashboardPage />);
    const requests = screen.getByRole("region", { name: "Your requests" });
    expect(requests.querySelectorAll("li")).toHaveLength(3);
    expect(requests).toHaveTextContent(/Send JOD\s?5\.000 to CliQ alias .*FORGEGYM.*\. The gym confirms when it arrives\./);
    expect(requests).toHaveTextContent(/Paid · JOD\s?5\.000/);
    expect(requests).toHaveTextContent("Free trial");
  });
});
