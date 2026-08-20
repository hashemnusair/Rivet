import { fireEvent, render, screen } from "@testing-library/react";
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
  previewSessionReady: true,
  bookTrial: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));

vi.mock("@/lib/api/ConvexGymOSApi", () => ({
  isConvexMode: () => false,
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useCustomerPersona: () => state.customer ?? undefined,
  useMarketplaceGyms: () => state.showGym ? [state.gym] : [],
  useExperience: () => ({
    bookTrial: state.bookTrial,
    customerSignedIn: Boolean(state.customer),
    previewSessionReady: state.previewSessionReady,
  }),
}));

describe("GymDetailClient trial form", () => {
  beforeEach(() => {
    state.customer = null;
    state.showGym = true;
    state.previewSessionReady = true;
    state.bookTrial.mockReset().mockResolvedValue({ id: "booking-1" });
    state.push.mockReset();
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

    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:30" } });
    await user.click(screen.getByRole("button", { name: "Send trial request" }));

    expect(state.bookTrial).toHaveBeenCalledWith(expect.objectContaining({ preferredTime: "13:30" }));
  });

  it("denies a direct public detail route when the gym is no longer publishable", () => {
    state.showGym = false;

    render(<GymDetailClient gymId="forge-fitness" />);

    expect(screen.getByRole("heading", { name: "Gym not found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send trial request" })).not.toBeInTheDocument();
  });
});
