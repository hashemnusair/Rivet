import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { PtBooking } from "@/lib/domain/types";
import { ptBookingCreditConsequence } from "@/lib/domain/personal-training";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator } from "@/lib/i18n/core";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import PersonalTrainingPage from "@/app/(app)/pt/page";
import { BookingOutcomeConfirmation } from "./booking-outcome-confirmation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/pt", useSearchParams: () => new URLSearchParams() }));
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function LocaleProbe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;
const ar = createTranslator("ar");

const booking: PtBooking = {
  id: "booking-ar", organizationId: "org", memberId: "member", memberName: "نور Haddad", trainerProfileId: "trainer", trainerName: "رامي Saleh", branchId: "branch", branchName: "الفرع A", entitlementId: "credit",
  startsAt: "2026-10-10T10:00:00.000Z", endsAt: "2026-10-10T11:00:00.000Z", status: "confirmed", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z",
};

describe("Arabic staff personal training", () => {
  it("preserves package amounts, selected branches and authored names through validation, failure and a locale switch", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<PersonalTrainingPage />), { role: "owner", branchId: BRANCH_ABD });
    const save = vi.spyOn(api, "upsertPtPackage").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    await user.click(screen.getByRole("button", { name: "إضافة باقة" }));
    const dialog = screen.getByRole("dialog", { name: "إنشاء باقة تدريب شخصي" });
    expect(within(dialog).getByRole("textbox", { name: "اسم الباقة" })).toHaveValue("باقة تدريب شخصي — 12 حصة");
    const sessions = within(dialog).getByRole("textbox", { name: /عدد الحصص/ });
    fireEvent.change(sessions, { target: { value: "١٢٫٥" } });
    expect(within(dialog).getByRole("button", { name: "حفظ الباقة" })).toBeDisabled();
    fireEvent.change(sessions, { target: { value: "۱۲" } });
    const validity = within(dialog).getByRole("textbox", { name: /مدة الصلاحية/ });
    fireEvent.change(validity, { target: { value: "٧٣١" } });
    expect(within(dialog).getByRole("button", { name: "حفظ الباقة" })).toBeDisabled();
    fireEvent.change(validity, { target: { value: "٩٠" } });
    const price = within(dialog).getByRole("textbox", { name: /السعر الإجمالي/ });
    fireEvent.change(price, { target: { value: "٢٤٠٫٥٠٠٥" } });
    fireEvent.blur(price);
    await user.click(within(dialog).getByRole("button", { name: "حفظ الباقة" }));
    expect(save).not.toHaveBeenCalled();
    expect(price).toHaveAttribute("aria-invalid", "true");
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Package name" })).toHaveValue("12 PT sessions");
    expect(within(dialog).getByText("JOD amounts use up to 3 decimal places.")).toBeInTheDocument();
    fireEvent.change(price, { target: { value: "٢٤٠٫٥٠٠" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Package name" }), { target: { value: "قوة Pro 12" } });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Branches" }), "selected");
    await user.click(within(dialog).getAllByRole("checkbox")[0]!);
    await user.click(within(dialog).getByRole("button", { name: "Save package" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const first = save.mock.calls[0]![0];
    expect(first).toMatchObject({ name: "قوة Pro 12", sessionCount: 12, validityDays: 90, totalPrice: { amount: 240500, currency: "JOD" }, branchAccess: "selected", status: "active" });
    expect(first.branchIds).toHaveLength(1);
    act(() => changeLocale("ar"));
    expect(within(dialog).getByRole("textbox", { name: "اسم الباقة" })).toHaveValue("قوة Pro 12");
    expect(within(dialog).getByRole("textbox", { name: /السعر الإجمالي/ })).toHaveValue("٢٤٠٫٥٠٠");
    await user.click(within(dialog).getByRole("button", { name: "حفظ الباقة" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(first);
  });

  it("keeps trainer hours, native calendar values and an authored time-off reason across a failed save", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<PersonalTrainingPage />), { role: "trainer", branchId: BRANCH_ABD });
    const save = vi.spyOn(api, "replacePtAvailability").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    expect(screen.queryByRole("button", { name: "إضافة باقة" })).not.toBeInTheDocument();
    expect(screen.queryByText("إيرادات باقات التدريب الشخصي")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "المواعيد المتاحة" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("التاريخ"), { target: { value: "2026-10-09" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب" }), { target: { value: "إجازة عائلية October" } });
    await user.click(within(dialog).getByRole("button", { name: "إضافة إجازة" }));
    expect(dialog).toHaveTextContent("تشرين الأول");
    await user.click(within(dialog).getByRole("button", { name: "حفظ المواعيد المتاحة" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const first = save.mock.calls[0]![0];
    expect(first.exceptions).toEqual([expect.objectContaining({ date: "2026-10-09", reason: "إجازة عائلية October", branchId: BRANCH_ABD })]);
    expect(first.rules.map(item => item.weekday)).toEqual(["sun", "mon", "tue", "wed", "thu"]);
    act(() => changeLocale("en"));
    expect(dialog).toHaveTextContent("إجازة عائلية October");
    await user.click(within(dialog).getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(first);
  });

  it("discloses the same credit consequence at the exact cancellation cutoff in both languages", () => {
    for (const [action, cancelledAt, cancelledByGym, key, effect] of [
      ["completed", "2026-10-10T10:30:00Z", false, "creditCompleted", "consume"],
      ["no_show", "2026-10-10T10:30:00Z", false, "creditNoShow", "consume"],
      ["cancelled", "2026-10-09T22:00:00Z", false, "creditReturned", "return"],
      ["cancelled", "2026-10-09T22:00:00.001Z", false, "creditLate", "consume"],
      ["cancelled", "2026-10-10T10:30:00Z", true, "creditReturned", "return"],
    ] as const) {
      const result = ptBookingCreditConsequence({ action, startsAt: booking.startsAt, cancelledAt, cutoffHours: 12, cancelledByGym });
      expect(result).toMatchObject({ messageKey: `ptWorkspace.${key}`, effect });
      expect(createTranslator("en")(result.messageKey)).toBe(result.text);
      expect(ar(result.messageKey)).toMatch(/[\u0600-\u06ff]/);
    }
  });

  it("requires and retains a reason and the member/gym cancellation choice in the confirmation dialog", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const nearBooking = { ...booking, startsAt: new Date(Date.now() + 3600000).toISOString() };
    await renderWithApp(arabic(<BookingOutcomeConfirmation booking={nearBooking} action="cancelled" open cancelledByGym allowCancellationChoice cutoffHours={12} onOpenChange={() => undefined} onConfirm={onConfirm} />));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent(ar("ptWorkspace.creditReturned"));
    expect(within(dialog).getByRole("button", { name: "إلغاء الحصة" })).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /المشترك طلب الإلغاء/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent(ar("ptWorkspace.creditLate"));
    await user.type(within(dialog).getByRole("textbox", { name: /سبب الإلغاء/ }), "طلب المشترك تغيير الموعد");
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: /Cancellation reason/ })).toHaveValue("طلب المشترك تغيير الموعد");
    expect(within(dialog).getByRole("radio", { name: /The member asked to cancel/ })).toBeChecked();
    expect(within(dialog).getByRole("status")).toHaveTextContent("one reserved PT credit will be used");
    await user.click(within(dialog).getByRole("button", { name: "Cancel session" }));
    expect(onConfirm).toHaveBeenCalledWith({ booking: nearBooking, action: "cancelled", reason: "طلب المشترك تغيير الموعد", cancelledByGym: false });
  });
});
