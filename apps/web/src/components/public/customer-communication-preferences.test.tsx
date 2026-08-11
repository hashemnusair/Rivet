import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCommunicationPreferences } from "./customer-communication-preferences";

const state = vi.hoisted(() => ({
  customer: {
    id: "customer-lina",
    name: "Lina Haddad",
    nameAr: "لينا حداد",
    email: "lina@example.com",
    phone: "+962 79 440 2211",
    initials: "LH",
    context: "RIVET member",
    marketingPreference: { optedIn: false, status: "unknown" as const, source: "system_default" as const },
    marketingPreferenceHistory: [{ optedIn: false, status: "unknown" as const, source: "system_default" as const }],
  },
  updateMarketingPreference: vi.fn(),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useCustomerPersona: () => state.customer,
  useExperience: () => ({ updateMarketingPreference: state.updateMarketingPreference }),
}));

describe("CustomerCommunicationPreferences", () => {
  beforeEach(() => {
    state.updateMarketingPreference.mockReset().mockResolvedValue({ ...state.customer, marketingPreference: { ...state.customer.marketingPreference, optedIn: true, status: "explicit_opt_in", source: "member_selected" } });
  });

  it("explains the service-message exception and shows unknown history", () => {
    render(<CustomerCommunicationPreferences />);

    expect(screen.getByText(/Service messages about bookings, payments, and entry remain separate/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Receive marketing updates" })).not.toBeChecked();
    expect(screen.getByText(/No marketing choice is recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View preference history (1)" })).toBeInTheDocument();
  });

  it("persists an explicit opt-in and lets the member inspect the history", async () => {
    render(<CustomerCommunicationPreferences />);

    fireEvent.click(screen.getByRole("switch", { name: "Receive marketing updates" }));
    await waitFor(() => expect(state.updateMarketingPreference).toHaveBeenCalledWith(true));
    expect(screen.getByRole("status")).toHaveTextContent("Marketing updates enabled.");

    fireEvent.click(screen.getByRole("button", { name: "View preference history (1)" }));
    expect(await screen.findByRole("heading", { name: "Communication preference history" })).toBeInTheDocument();
    expect(screen.getByText(/RIVET service messages are always sent when needed to operate your account/)).toBeInTheDocument();
  });
});
