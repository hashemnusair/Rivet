import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
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

    expect(screen.getByText(/You still get messages about your bookings, payments and entry/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Send me offers and news" })).not.toBeChecked();
    expect(screen.getByText(/You have not chosen yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See your past choices (1)" })).toBeInTheDocument();
  });

  it("persists an explicit opt-in and lets the member inspect the history", async () => {
    render(<CustomerCommunicationPreferences />);

    fireEvent.click(screen.getByRole("switch", { name: "Send me offers and news" }));
    await waitFor(() => expect(state.updateMarketingPreference).toHaveBeenCalledWith(true));
    expect(screen.getByRole("status")).toHaveTextContent("You will get offers and news.");

    fireEvent.click(screen.getByRole("button", { name: "See your past choices (1)" }));
    expect(await screen.findByRole("heading", { name: "Your choices for offers and news" })).toBeInTheDocument();
    expect(screen.getByText(/Messages about your bookings, payments and entry are always sent when needed/)).toBeInTheDocument();
  });
});

function ConsentLocaleSwitch() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale("en")}>English</button>;
}
it("changes consent only on explicit selection and retranslates the saved state", async () => {
  state.updateMarketingPreference.mockReset().mockResolvedValue(state.customer);
  render(<LocaleProvider initialLocale="ar"><ConsentLocaleSwitch /><CustomerCommunicationPreferences /></LocaleProvider>);
  expect(state.updateMarketingPreference).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "إرسال العروض والأخبار إليّ" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ستصلك العروض والأخبار."));
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("status")).toHaveTextContent("You will get offers and news.");
  expect(state.updateMarketingPreference).toHaveBeenCalledExactlyOnceWith(true);
});
