import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SettingsPageInner } from "./settings-page-inner";
import { BranchesSection, GymSpacesSection, NotificationsSection, OrganizationSection, PaymentsSection, ReceiptsSection } from "./settings-sections";
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


describe("Arabic numeric settings", () => {
  it("keeps invalid rule drafts visible across language changes and saves exact corrected values", async () => {
    const { OperationalRulesSection } = await import("./operational-settings-sections");
    const user = userEvent.setup();
    const { api } = await renderWithApp(<LocaleProvider initialLocale="en"><LanguageToggle /><OperationalRulesSection /></LocaleProvider>);
    const save = vi.spyOn(api, "updateOperationalPolicies");
    const warning = await screen.findByRole("textbox", { name: "Ending soon warning, days" });
    fireEvent.change(warning, { target: { value: "٣١" } });
    expect(warning).toHaveValue("31");
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Arabic/ }));
    expect(warning).toHaveValue("31");
    expect(warning).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("30");
    await user.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.change(warning, { target: { value: "١٤" } });
    const freezeToggle = screen.getByRole("switch", { name: "Accept requests" });
    if (freezeToggle.getAttribute("data-state") !== "checked") await user.click(freezeToggle);
    const fee = screen.getByRole("textbox", { name: "Fee for each extra freeze, JOD" });
    fireEvent.change(fee, { target: { value: "٢٥٫١٢٥١" } });
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    fireEvent.change(fee, { target: { value: "٢٥٫١٢٥" } });
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({ expiryWarningDays: 14 }),
      memberFreezes: expect.objectContaining({ extraFreezeFeeMinor: 25125 }),
    })));
  });

  it("discards an empty rule draft even when its underlying numeric value never changed", async () => {
    const { OperationalRulesSection } = await import("./operational-settings-sections");
    const user = userEvent.setup();
    await renderWithApp(<OperationalRulesSection />);
    const warning = await screen.findByRole("textbox", { name: "Ending soon warning, days" });
    const original = (warning as HTMLInputElement).value;
    fireEvent.change(warning, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("textbox", { name: "Ending soon warning, days" })).toHaveValue(original);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts Arabic branch capacity and retains the draft while rejecting fractional capacity", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<LocaleProvider initialLocale="en"><LanguageToggle /><BranchesSection /></LocaleProvider>);
    const save = vi.spyOn(api, "upsertBranch");
    await user.click(await screen.findByRole("button", { name: "Add branch" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: "فرع جديد" } });
    fireEvent.change(dialog.getByLabelText(/Code/), { target: { value: "ARA" } });
    fireEvent.change(dialog.getByLabelText("Capacity"), { target: { value: "١٫٥" } });
    expect(dialog.getByRole("button", { name: "Add branch" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Capacity"), { target: { value: "۱۲۵" } });
    fireEvent.change(dialog.getByLabelText("Phone"), { target: { value: "٠٧٩١٢٣٤٥٦٧" } });
    await user.click(dialog.getByRole("button", { name: "Add branch" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "فرع جديد", capacity: 125, phone: "0791234567" })));
  });

  it("validates optional space capacity without silently submitting NaN", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<GymSpacesSection />);
    const save = vi.spyOn(api, "upsertZone");
    await user.click(await screen.findByRole("button", { name: "Add gym area" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: "قاعة" } });
    fireEvent.change(dialog.getByLabelText("Capacity"), { target: { value: "١٠٠٠٠١" } });
    expect(dialog.getByRole("button", { name: "Add gym area" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Capacity"), { target: { value: "٦٠" } });
    await user.click(dialog.getByRole("button", { name: "Add gym area" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ capacity: 60, name: "قاعة" })));
  });

  it("accepts a decimal Arabic tax rate, preserves authored footer text, and does not coerce an empty rate", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<LocaleProvider initialLocale="en"><LanguageToggle /><ReceiptsSection /></LocaleProvider>);
    const save = vi.spyOn(api, "updateOrganizationSettings");
    const tax = await screen.findByRole("textbox", { name: "Sales tax" });
    fireEvent.change(tax, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save receipt settings" })).toBeDisabled();
    fireEvent.change(tax, { target: { value: "١٦٫٢٥" } });
    fireEvent.change(screen.getByLabelText("Receipt footer"), { target: { value: "Thank you — شكرًا" } });
    await user.click(screen.getByRole("button", { name: /Arabic/ }));
    expect(tax).toHaveValue("16.25");
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /English/ }));
    await user.click(screen.getByRole("button", { name: "Save receipt settings" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ taxRatePercent: 16.25, receiptFooter: "Thank you — شكرًا" })));
  });
});
