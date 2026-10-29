import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { PlatformSaasPlan, WebsiteOffer } from "@/lib/api/GymOSApi";
import GymApplicationPage from "./page";

const state = vi.hoisted(() => ({
  saasPlans: [] as PlatformSaasPlan[],
  submitGymApplication: vi.fn(),
  websiteOffer: { places: 3, claimed: 1, enabled: true, priceMinor: 150_000 } as WebsiteOffer,
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    saasPlans: state.saasPlans,
    experienceError: undefined,
    experienceStatus: "ready",
    retryExperience: vi.fn(),
  }),
}));

vi.mock("@/components/public/public-document-page", () => ({ PublicDocumentPage: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    submitGymApplication: state.submitGymApplication,
    subscribeWebsiteOffer: async (onValue: (offer: WebsiteOffer) => void) => {
      onValue(state.websiteOffer);
      return () => {};
    },
    checkPromoCode: async ({ code }: { code: string }) => code === "LAUNCH50"
      ? { valid: true, promo: { code: "LAUNCH50", target: "subscription", percentOff: 50 } }
      : { valid: false, reason: "not_found" },
  }),
}));

function LocaleSwitch() {
  const { locale, setLocale } = useLocale();
  return <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "Use English" : "استخدم العربية"}</button>;
}

describe("gym application pricing selection", () => {
  beforeEach(() => {
    state.saasPlans = [];
    state.submitGymApplication.mockReset();
    window.history.replaceState({}, "", "/signup?plan=Pro&interval=annual");
  });

  it("restores the landing-page selection and still allows changing plans", async () => {
    const user = userEvent.setup();
    render(<GymApplicationPage />);

    expect(await screen.findByRole("radio", { name: /Pro/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(/JD 2268\.600/)[0]).toBeInTheDocument();
    expect(screen.getByText(/First payment subtotal before applicable tax, including onboarding: JD 2418\.600/)).toBeInTheDocument();
    expect(screen.queryByText(/JD 4800\.000 billed annually/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Basic/ }));
    expect(screen.getByRole("radio", { name: /Basic/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radio", { name: /Enterprise/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("radio", { name: /Basic/ })).getByText(/JD 558\.600/)).toBeInTheDocument();
    expect(screen.getByText(/First payment subtotal before applicable tax, including onboarding: JD 633\.600/)).toBeInTheDocument();
  });

  it("adds a free website while places are left and prices the first payment with a promo code", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/signup?plan=Basic&interval=monthly");
    state.submitGymApplication.mockResolvedValue({ applicationId: "application-offers", status: "pending", notificationStatus: "sent", submittedAt: "2026-10-19T08:00:00.000Z", duplicate: false });
    render(<GymApplicationPage />);
    const summary = await screen.findByRole("region", { name: "Your first payment" });
    expect(within(summary).getByText("JD 124.000")).toBeInTheDocument();

    const website = screen.getByRole("checkbox", { name: /Do you want a custom website for your gym/ });
    expect(screen.getByText(/Free for the first 3 gyms · 2 free places left/)).toBeInTheDocument();
    await user.click(website);
    expect(within(summary).getByText("Custom website")).toBeInTheDocument();
    expect(within(summary).getByText("Free (launch offer)")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Promo code (optional)"), "nope");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("We do not know this code.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Promo code (optional)"));
    await user.type(screen.getByLabelText("Promo code (optional)"), "launch50");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("LAUNCH50: 50% off the first month or year")).toBeInTheDocument();
    expect(within(summary).getByText("JD 99.500")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Omar Khalil"), "Offer Owner");
    await user.type(screen.getByPlaceholderText("owner@example.com"), "offer-owner@example.test");
    await user.type(screen.getByPlaceholderText("Northstar Fitness"), "Offer Gym");
    await user.type(screen.getByPlaceholderText("Enter your phone number"), "+962790000555");
    await user.type(screen.getByPlaceholderText("Street, area, city"), "Abdoun, Amman");
    await user.click(screen.getByRole("button", { name: /Send gym application/ }));
    await waitFor(() => expect(state.submitGymApplication).toHaveBeenCalledWith(expect.objectContaining({ plan: "Basic", websiteRequested: true, promoCode: "LAUNCH50" })));
  });

  it("submits the selected annual cadence with the application", async () => {
    const user = userEvent.setup();
    state.submitGymApplication.mockResolvedValue({
      applicationId: "application-annual",
      status: "pending",
      notificationStatus: "sent",
      submittedAt: "2026-08-23T00:00:00.000Z",
      duplicate: false,
    });
    render(<GymApplicationPage />);

    await screen.findByRole("radio", { name: /Pro/ });
    await user.type(screen.getByPlaceholderText("Omar Khalil"), "Annual Owner");
    await user.type(screen.getByPlaceholderText("owner@example.com"), "annual-owner@example.test");
    await user.type(screen.getByPlaceholderText("Northstar Fitness"), "Annual Gym");
    await user.type(screen.getByPlaceholderText("Enter your phone number"), "+962790000999");
    await user.type(screen.getByPlaceholderText("Street, area, city"), "12 King Abdullah II Street, Amman");
    await user.click(screen.getByRole("button", { name: /Send gym application/ }));

    expect(state.submitGymApplication).toHaveBeenCalledWith(expect.objectContaining({
      ownerName: "Annual Owner",
      gymName: "Annual Gym",
      gymAddress: "12 King Abdullah II Street, Amman",
      email: "annual-owner@example.test",
      contactNumber: "+962790000999",
      plan: "Pro",
      billingInterval: "annual",
    }));
    expect(state.submitGymApplication.mock.calls[0]?.[0].idempotencyKey).toEqual(expect.any(String));
  });

  it("requires a physical gym address before sending the application", async () => {
    const user = userEvent.setup();
    render(<GymApplicationPage />);

    await screen.findByRole("radio", { name: /Pro/ });
    await user.type(screen.getByPlaceholderText("Omar Khalil"), "Annual Owner");
    await user.type(screen.getByPlaceholderText("owner@example.com"), "annual-owner@example.test");
    await user.type(screen.getByPlaceholderText("Enter your phone number"), "+962790000999");
    await user.type(screen.getByPlaceholderText("Northstar Fitness"), "Annual Gym");
    await user.click(screen.getByRole("button", { name: /Send gym application/ }));

    expect(await screen.findByText(/Enter the gym.s address\./)).toBeInTheDocument();
    expect(state.submitGymApplication).not.toHaveBeenCalled();
  });

  it("keeps the Arabic form, plan query, and draft across a locale switch", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider initialLocale="ar"><LocaleSwitch /><GymApplicationPage /></LocaleProvider>);

    expect(await screen.findByRole("heading", { name: "تقديم طلب للنادي الرياضي." })).toBeInTheDocument();
    const owner = screen.getByPlaceholderText("Omar Khalil");
    await user.type(owner, "ليان أحمد");
    expect(screen.getByRole("radio", { name: /Pro/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("tab", { name: /سنويًا/ })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Use English" }));
    expect(await screen.findByRole("heading", { name: "Send a gym application." })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Omar Khalil")).toHaveValue("ليان أحمد");
    expect(screen.getByRole("radio", { name: /Pro/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?plan=Pro&interval=annual");
  });

  it("validates in Arabic and submits Arabic phone digits with the captured locale", async () => {
    const user = userEvent.setup();
    state.submitGymApplication.mockResolvedValue({
      applicationId: "application-arabic",
      status: "pending",
      notificationStatus: "sent",
      submittedAt: "2026-08-23T00:00:00.000Z",
      duplicate: false,
    });
    render(<LocaleProvider initialLocale="ar"><GymApplicationPage /></LocaleProvider>);

    expect(await screen.findByRole("heading", { name: "تقديم طلب للنادي الرياضي." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /إضافة ناديك إلى RIVET/ }));
    expect(await screen.findByText("أدخل اسم المالك.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Omar Khalil"), "ليان أحمد");
    await user.type(screen.getByPlaceholderText("owner@example.com"), "lina@example.test");
    await user.type(screen.getByPlaceholderText("أدخل رقم هاتفك"), "٠٧٩١٢٣٤٥٦٧");
    await user.type(screen.getByPlaceholderText("Northstar Fitness"), "نادي النجمة");
    await user.type(screen.getByPlaceholderText("الشارع، المنطقة، المدينة"), "شارع الملكة رانيا، عمّان");
    await user.click(screen.getByRole("button", { name: /إضافة ناديك إلى RIVET/ }));

    expect(state.submitGymApplication).toHaveBeenCalledWith(expect.objectContaining({
      ownerName: "ليان أحمد",
      email: "lina@example.test",
      contactNumber: "0791234567",
      gymName: "نادي النجمة",
      gymAddress: "شارع الملكة رانيا، عمّان",
      plan: "Pro",
      billingInterval: "annual",
      language: "ar",
    }));
  });
});
