import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { GymOSApi } from "@/lib/api/GymOSApi";
import { ApiError } from "@/lib/api/errors";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator } from "@/lib/i18n/core";
import { planDurationText } from "@/lib/i18n/member-enrollment";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { PlanFormDialog } from "./plan-form-dialog";
import NewMemberPage from "@/app/(app)/members/new/page";
import PlansPage from "@/app/(app)/plans/page";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/plans", useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), back: vi.fn() }),
}));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.scrollIntoView = () => undefined;
afterEach(() => { resetApiForTests(); nav.search = ""; vi.clearAllMocks(); });
let changeLocale: (locale: Locale) => void;
function LocaleProbe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;
const ar = createTranslator("ar");

describe("Arabic enrollment and plans", () => {
  it("retains the plan draft and translates validation while enforcing integer limits and currency precision", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<PlanFormDialog open onOpenChange={() => undefined} />), { role: "owner" });
    const create = vi.spyOn(api, "createPlan").mockRejectedValue(ApiError.of("CONFLICT", "The record changed.", { message: { key: "apiErrors.conflict" } }));
    await user.click(screen.getByRole("button", { name: "إضافة نوع اشتراك" }));
    expect(await screen.findByText("يرجى إدخال اسم نوع الاشتراك")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /اسم نوع الاشتراك/ }), "باقة النادي Plus");
    await user.type(screen.getByRole("textbox", { name: /الرمز/ }), "ar2");
    fireEvent.change(screen.getByRole("textbox", { name: /المدة بالأيام/ }), { target: { value: "٣٠٫٥" } });
    await user.type(screen.getByRole("textbox", { name: /السعر/ }), "٢٥٫١٢٣٤");
    await user.click(screen.getByRole("button", { name: "إضافة نوع اشتراك" }));
    expect(create).not.toHaveBeenCalled();
    act(() => changeLocale("en"));
    expect(screen.getByRole("textbox", { name: /Plan name/ })).toHaveValue("باقة النادي Plus");
    expect(screen.getByRole("textbox", { name: /Length/ })).toHaveValue("٣٠٫٥");
    expect(await screen.findByText("Use a whole number")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Length/ }), { target: { value: "٣٠" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Price/ }), { target: { value: "٢٥٫١٢٣" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Freeze days allowed/ }), { target: { value: "٧" } });
    fireEvent.change(screen.getByRole("textbox", { name: /PT sessions included/ }), { target: { value: "۲" } });
    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]![0]).toMatchObject({ name: "باقة النادي Plus", code: "AR2", kind: "time", durationDays: 30, basePrice: { amount: 25123, currency: "JOD" }, freezeAllowanceDays: 7, includedPtSessions: 2, branchAccess: "all", branchIds: [] });
    expect(await screen.findByText("The record changed.")).toBeInTheDocument();
    act(() => changeLocale("ar"));
    expect(screen.getByText(ar("apiErrors.conflict"))).toBeInTheDocument();
  });

  it("normalizes member phone digits without changing communication preference or consent defaults", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<NewMemberPage />), { branchId: BRANCH_ABD });
    const create = vi.spyOn(api, "createMember");
    await user.type(screen.getByTestId("member-name"), "ليان Al-Masri");
    await user.type(screen.getByTestId("member-phone"), "٠٧٩۹۰۰۰۶۶۶");
    fireEvent.blur(screen.getByTestId("member-phone"));
    await waitFor(() => expect(screen.queryByText("جارٍ التحقق من التكرار…")).not.toBeInTheDocument());
    act(() => changeLocale("en"));
    expect(screen.getByTestId("member-phone")).toHaveValue("0799000666");
    expect(screen.getByTestId("member-name")).toHaveValue("ليان Al-Masri");
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    await user.click(await screen.findByRole("option", { name: "Female" }));
    act(() => changeLocale("ar"));
    await user.click(screen.getByTestId("save-member"));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]![0]).toMatchObject({ fullName: "ليان Al-Masri", phone: "0799000666", gender: "female", preferredLanguage: "en", marketingOptIn: true, marketingPreferenceSource: "system_default" });
  });

  it("uses canonical plan status in Arabic URL filters and list queries", async () => {
    nav.search = "?status=archived";
    let list: MockInstance<GymOSApi["listPlans"]>;
    await renderWithApp(arabic(<PlansPage />), { role: "owner", prepare: async api => { list = vi.spyOn(api, "listPlans"); } });
    await waitFor(() => expect(list!).toHaveBeenCalledWith({ status: "archived", pageSize: 50 }));
    expect(screen.getByRole("button", { name: "مؤرشف" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "نشط" }));
    expect(nav.replace).toHaveBeenCalledWith("/plans", { scroll: false });
  });

  it("selects real Arabic plural categories for durations without changing stored limits", () => {
    const phrases = [0, 1, 2, 3, 11, 100].map(count => planDurationText(ar, { kind: "time", durationDays: count }));
    expect(phrases).toEqual(["0 يوم", "يوم واحد (1)", "يومان (2)", "3 أيام", "11 يومًا", "100 يوم"]);
    expect(planDurationText(ar, { kind: "visits", visitAllowance: 3, visitValidityDays: 11 })).toBe("3 زيارات خلال 11 يومًا");
  });
});
