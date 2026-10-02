import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import RuleEditorPageClient from "./rule-editor.client";

const navigation = vi.hoisted(() => ({ ruleId: "" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ ruleId: navigation.ruleId }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => `/automations/${navigation.ruleId}`, useSearchParams: () => new URLSearchParams() }));

let changeLocale: (locale: Locale) => void;
function LocaleProbe() {
  const { setLocale } = useLocale();
  useEffect(() => { changeLocale = setLocale; }, [setLocale]);
  return null;
}

function localized(locale: Locale) {
  return <LocaleProvider initialLocale={locale}><LocaleProbe /><RuleEditorPageClient /></LocaleProvider>;
}

afterEach(() => {
  resetApiForTests();
  vi.restoreAllMocks();
  changeLocale = undefined as unknown as typeof changeLocale;
  navigation.ruleId = "";
});

describe("automation editor Arabic drafts and permissions", () => {
  it("keeps numeric and action drafts when the language changes, then saves normalized values", async () => {
    const rendered = await renderWithApp(localized("en"), {
      role: "owner",
      prepare: async (api) => { navigation.ruleId = (await api.listAutomationRules())[0]!.id; },
    });
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(rendered.api, "updateAutomationRule");

    const days = await screen.findByRole("textbox", { name: "Days before it ends (separate with commas)" });
    const dedupe = screen.getByRole("textbox", { name: "Wait before repeating (hours)" });
    await user.clear(days);
    await user.type(days, "١٤، ٣");
    await user.clear(dedupe);
    await user.type(dedupe, "٧٢");
    await user.click(screen.getByRole("switch", { name: "Alert the manager" }));
    expect(saveSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(changeLocale).toBeTypeOf("function"));
    act(() => changeLocale("ar"));

    const localizedDays = await screen.findByRole("textbox", { name: "الأيام المتبقية حتى الانتهاء (افصل بينها بفواصل)" });
    const localizedDedupe = screen.getByRole("textbox", { name: "الانتظار قبل التكرار (بالساعات)" });
    expect(localizedDays).toHaveValue("١٤، ٣");
    expect(localizedDedupe).toHaveValue("٧٢");
    expect(screen.getByRole("switch", { name: "إشعار المدير" })).toBeChecked();
    expect(screen.getByText("مرحباً ليان، عضويتك في Forge تنتهي بتاريخ 2026-08-12. جدّد من كاونتر فرع عبدون أو رد على هذه الرسالة وسنرتبها لك. — Forge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /حفظ/ }));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledOnce());
    expect(saveSpy.mock.lastCall?.[1]).toEqual(expect.objectContaining({
      triggerParams: { daysBefore: [14, 3] },
      dedupeWindowHours: 72,
      actions: expect.arrayContaining([expect.objectContaining({ key: "notify_manager" })]),
    }));
  });

  it("shows readable saved rules but disables every mutation for staff without manage permission", async () => {
    await renderWithApp(localized("ar"), {
      role: "trainer",
      prepare: async (api) => { navigation.ruleId = (await api.listAutomationRules())[0]!.id; },
    });

    expect(await screen.findByText("ليس لديك صلاحية لتنفيذ هذا الإجراء. تواصل مع مالك النادي.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "تفعيل الإجراء التلقائي" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "الأيام المتبقية حتى الانتهاء (افصل بينها بفواصل)" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "الانتظار قبل التكرار (بالساعات)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تشغيل الآن" })).toBeDisabled();
  });
});
