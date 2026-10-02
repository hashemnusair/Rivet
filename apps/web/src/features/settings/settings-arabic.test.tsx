import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SettingsPageInner } from "./settings-page-inner";
import { NotificationsSection, OrganizationSection, PaymentsSection } from "./settings-sections";
import { ApiError } from "@/lib/api/errors";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=organization"),
}));
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;
afterEach(resetApiForTests);
const arabic = (ui: React.ReactNode) => <LocaleProvider initialLocale="ar"><LanguageToggle />{ui}</LocaleProvider>;

describe("Arabic staff settings", () => {
  it("keeps dirty organization details and communication preferences across a UI language change", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<OrganizationSection />));
    const original = (await api.getOrganizationSettings()).organization;
    const update = vi.spyOn(api, "updateOrganizationSettings");
    const name = await screen.findByLabelText(/اسم النادي/);
    await user.clear(name);
    await user.type(name, "نادي الأبطال");
    const code = screen.getByLabelText("رمز الاتصال الدولي الافتراضي");
    await user.clear(code);
    await user.type(code, "۹۶۲");
    expect(code).toHaveValue("962");
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByLabelText(/Gym name/)).toHaveValue("نادي الأبطال");
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save gym details" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "نادي الأبطال", phoneCountryCallingCode: "962", defaultLanguage: original.defaultLanguage, locale: original.locale })));
  });

  it("requires the same explicit save to enable reminder delivery", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<NotificationsSection />));
    const update = vi.spyOn(api, "updateNotificationSettings");
    const toggle = await screen.findByRole("switch", { name: "تذكيرات التجديد" });
    await user.click(toggle);
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByRole("switch", { name: "Renewal reminders" })).toHaveAttribute("data-state", "checked");
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save notifications" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ renewalRecoveryEnabled: true })));
  });

  it("searches Arabic labels and keywords without removing permission checks", async () => {
    const user = userEvent.setup();
    await renderWithApp(arabic(<SettingsPageInner />), { role: "manager" });
    const search = await screen.findByRole("textbox", { name: "البحث في الإعدادات" });
    await user.type(search, "صُور");
    expect(screen.getByRole("tab", { name: "الصفحة العامة" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "بيانات النادي" })).not.toBeInTheDocument();
  });

  it("keeps a failed payment setting pending and translates its structured failure on a language change", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<PaymentsSection />));
    vi.spyOn(api, "updatePaymentMethods").mockRejectedValue(ApiError.of("FORBIDDEN", "Permission denied.", { message: { key: "apiErrors.forbidden" } }));
    const cash = await screen.findByRole("switch", { name: "كاش" });
    await user.click(cash);
    await user.click(screen.getByRole("button", { name: "حفظ إعدادات الدفعات" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("طرق الدفع:"));
    expect(cash).toHaveAttribute("data-state", "unchecked");
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Payment methods: Permission denied.");
    expect(screen.getByRole("switch", { name: "Cash" })).toHaveAttribute("data-state", "unchecked");
  });
});

describe("Arabic operational and public settings", () => {
  it("preserves canonical public choices and both authored languages when saving a draft", async () => {
    const { GymPublicProfileSection } = await import("./gym-public-profile-section");
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<GymPublicProfileSection />));
    const save = vi.spyOn(api, "saveGymPublicProfile");
    const english = await screen.findByLabelText(/العبارة التعريفية بالإنجليزية/);
    const arabicText = screen.getByLabelText("العبارة التعريفية بالعربية");
    expect(english).toHaveAttribute("dir", "ltr");
    expect(arabicText).toHaveAttribute("dir", "rtl");
    await user.clear(arabicText);
    await user.type(arabicText, "قوتك تبدأ هنا");
    await user.click(screen.getByRole("combobox", { name: "الفئة" }));
    await user.click(screen.getByRole("option", { name: "رياضات قتالية" }));
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByLabelText("Arabic tagline")).toHaveValue("قوتك تبدأ هنا");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Combat sports");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: "Combat sports", taglineAr: "قوتك تبدأ هنا" })));
  });

  it("renders schedules in Arabic and retains canonical local wall times across switching", async () => {
    const { HoursAndTrialsSection } = await import("./operational-settings-sections");
    const { fireEvent } = await import("@testing-library/react");
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<HoursAndTrialsSection />));
    const save = vi.spyOn(api, "updateOperationalPolicies");
    const opening = await screen.findByLabelText("وقت الافتتاح يوم الأحد");
    fireEvent.change(opening, { target: { value: "08:15" } });
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByLabelText("Sunday opening time")).toHaveValue("08:15");
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0].operatingHours.some(schedule => schedule.days.sun.opensAt === "08:15")).toBe(true);
  });
});
