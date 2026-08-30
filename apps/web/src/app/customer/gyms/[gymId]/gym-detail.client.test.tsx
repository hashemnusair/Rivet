import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GymDetailClient from "./gym-detail.client";

const state = vi.hoisted(() => ({
  customer: null as null | {
    id: string;
    name: string;
    nameAr: string;
    email: string;
    phone: string;
    initials: string;
    context: string;
  },
  gym: {
    id: "forge-fitness",
    name: "Forge Fitness Club",
    shortName: "FORGE",
    tagline: "Test gym",
    description: "A gym used to verify trial-form hydration.",
    city: "Amman",
    areas: ["Abdoun"],
    category: "Strength",
    audience: "All members",
    rating: 4.9,
    reviewCount: 10,
    memberCount: 100,
    branchCount: 1,
    fromPriceMinor: 40_000,
    amenities: ["Weights"],
    accent: "#111111",
    featured: true,
    subscriptionStatus: "active" as const,
    rivetPlan: "Growth" as const,
    joinedAt: "2026-01-01",
    lastActiveAt: "2026-08-10T10:00:00+03:00",
    monthlyRevenueMinor: 0,
    branches: [{
      id: "forge-abdoun",
      name: "Forge — Abdoun",
      area: "Abdoun",
      address: "Amman",
      trialSlots: ["08:00"],
      trialSchedule: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((weekday) => [weekday, { enabled: true, opensAt: "08:00", closesAt: "20:00" }])),
    }],
  },
  showGym: true,
  convexMode: false,
  previewSessionReady: true,
  experienceStatus: "ready" as "loading" | "ready" | "error",
  experienceError: undefined as string | undefined,
  bookTrial: vi.fn(),
  push: vi.fn(),
  retryExperience: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/api/ConvexGymOSApi", () => ({
  isConvexMode: () => state.convexMode,
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useCustomerPersona: () => state.customer ?? undefined,
  useMarketplaceGyms: () => state.showGym ? [state.gym] : [],
  useExperience: () => ({
    bookTrial: state.bookTrial,
    customerSignedIn: Boolean(state.customer),
    experienceError: state.experienceError,
    experienceStatus: state.experienceStatus,
    previewSessionReady: state.previewSessionReady,
    retryExperience: state.retryExperience,
  }),
}));

describe("GymDetailClient trial form", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/customer/gyms/forge-fitness");
    state.customer = null;
    state.showGym = true;
    state.convexMode = false;
    state.previewSessionReady = true;
    state.experienceStatus = "ready";
    state.experienceError = undefined;
    state.bookTrial.mockReset().mockResolvedValue({ id: "booking-1" });
    state.push.mockReset();
    state.retryExperience.mockReset();
  });

  it("waits for preview session restoration before exposing editable fields", () => {
    state.previewSessionReady = false;
    const view = render(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading booking form");
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();

    state.previewSessionReady = true;
    view.rerender(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("waits for the live marketplace before deciding that a gym is missing", () => {
    state.showGym = false;
    state.experienceStatus = "loading";
    const view = render(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading the live RIVET network");
    expect(screen.queryByRole("heading", { name: "Gym not found" })).not.toBeInTheDocument();

    state.experienceStatus = "ready";
    view.rerender(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByRole("heading", { name: "Gym not found" })).toBeInTheDocument();
  });

  it("restores a valid branch selected in the return URL after signup", async () => {
    window.history.replaceState({}, "", "/customer/gyms/forge-fitness?branchId=forge-abdoun");

    render(<GymDetailClient gymId="forge-fitness" />);

    await waitFor(() => expect(screen.getByLabelText("Branch")).toHaveValue("forge-abdoun"));
  });

  it("preserves visitor input when customer defaults hydrate after typing begins", async () => {
    const user = userEvent.setup();
    const view = render(<GymDetailClient gymId="forge-fitness" />);

    await user.type(screen.getByLabelText("Full name"), "Unauthenticated QA");
    await user.type(screen.getByLabelText("Phone"), "+962 79 321 4456");
    await user.type(screen.getByLabelText("Email"), "unauthenticated.qa@example.com");
    await user.clear(screen.getByLabelText("What are you looking for?"));
    await user.type(screen.getByLabelText("What are you looking for?"), "Test hydration safety");

    state.customer = {
      id: "customer-late",
      name: "Late Identity",
      nameAr: "Late Identity",
      email: "late@example.com",
      phone: "+962 79 000 0000",
      initials: "LI",
      context: "RIVET member",
    };
    view.rerender(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByLabelText("Full name")).toHaveValue("Unauthenticated QA");
    expect(screen.getByLabelText("Phone")).toHaveValue("+962 79 321 4456");
    expect(screen.getByLabelText("Email")).toHaveValue("unauthenticated.qa@example.com");
    expect(screen.getByLabelText("What are you looking for?")).toHaveValue("Test hydration safety");
  });

  it("allows any preferred time inside the configured branch window", async () => {
    const user = userEvent.setup();
    state.customer = {
      id: "customer-member",
      name: "Member Test",
      nameAr: "Member Test",
      email: "member@example.com",
      phone: "+962790000001",
      initials: "MT",
      context: "RIVET member",
    };
    render(<GymDetailClient gymId="forge-fitness" />);

    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "forge-abdoun" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:30" } });
    await user.click(screen.getByRole("button", { name: "Send trial request" }));

    expect(state.bookTrial).toHaveBeenCalledWith(expect.objectContaining({ preferredTime: "13:30" }));
  });

  it("routes an unauthenticated production trial through signup with safe gym and branch context", async () => {
    state.convexMode = true;
    window.history.replaceState({}, "", "/customer/gyms/forge-fitness");
    render(<GymDetailClient gymId="forge-fitness" />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Visitor Test" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+962790000001" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "visitor@example.com" } });
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "forge-abdoun" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send trial request" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send trial request" }));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login/member/create?returnTo=%2Fcustomer%2Fgyms%2Fforge-fitness%3FbranchId%3Dforge-abdoun"));
    expect(state.bookTrial).not.toHaveBeenCalled();
  });

  it("preserves an opaque referral token through signup", async () => {
    state.convexMode = true;
    window.history.replaceState({}, "", "/customer/gyms/forge-fitness?ref=referral-token-123");
    render(<GymDetailClient gymId="forge-fitness" />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Referred Visitor" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+962790000009" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "referred@example.com" } });
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "forge-abdoun" } });
    fireEvent.click(screen.getByRole("button", { name: "Send trial request" }));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith(
      "/login/member/create?returnTo=%2Fcustomer%2Fgyms%2Fforge-fitness%3FbranchId%3Dforge-abdoun%26ref%3Dreferral-token-123",
    ));
    expect(state.bookTrial).not.toHaveBeenCalled();
  });

  it("submits the referral token with an authenticated trial request", async () => {
    const user = userEvent.setup();
    state.customer = {
      id: "customer-referred",
      name: "Referred Member",
      nameAr: "Referred Member",
      email: "referred.member@example.com",
      phone: "+962790000008",
      initials: "RM",
      context: "RIVET member",
    };
    window.history.replaceState({}, "", "/customer/gyms/forge-fitness?ref=referral-token-456");
    render(<GymDetailClient gymId="forge-fitness" />);

    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "forge-abdoun" } });
    await user.click(screen.getByRole("button", { name: "Send trial request" }));

    expect(state.bookTrial).toHaveBeenCalledWith(expect.objectContaining({
      referralToken: "referral-token-456",
    }));
  });

  it("denies a direct public detail route when the gym is no longer publishable", () => {
    state.showGym = false;

    render(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByRole("heading", { name: "Gym not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send trial request" })).not.toBeInTheDocument();
  });
});
