import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ClassOccurrence } from "@/lib/domain/types";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator } from "@/lib/i18n/core";
import { classClockText, classTimeRange, classHourText, classMinuteAtPosition, validClassCapacity, classImageAlt } from "@/lib/i18n/class-schedule";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ClassesPage from "@/app/(app)/classes/page";
import { CancelOccurrenceDialog } from "./cancel-occurrence-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/classes", useSearchParams: () => new URLSearchParams() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function LocaleProbe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;
const ar = createTranslator("ar");

describe("Arabic class schedule", () => {
  it("keeps noon, midnight and overnight boundaries in the existing 12-hour timetable convention", () => {
    expect(classClockText(0, "ar")).toBe("12:00 ص");
    expect(classHourText(12, "ar")).toBe("12 م");
    expect(classTimeRange(11 * 60 + 30, 60, "ar")).toBe("11:30 ص–12:30 م");
    expect(classTimeRange(23 * 60 + 30, 30, "ar")).toBe("11:30 م–12:00 ص");
    expect(classTimeRange(18 * 60, 60, "en")).toBe("6:00–7:00 PM");
  });

  it("maps mirrored timetable clicks to the same half-hour and validates Arabic whole capacities", () => {
    expect(classMinuteAtPosition(125, 100, 100, 6, 16, false)).toBe(10 * 60);
    expect(classMinuteAtPosition(175, 100, 100, 6, 16, true)).toBe(10 * 60);
    expect(classMinuteAtPosition(220, 100, 100, 6, 16, true)).toBe(6 * 60);
    expect(classMinuteAtPosition(80, 100, 100, 6, 16, true)).toBe(22 * 60);
    for (const value of ["١", "۲۰۰", "12"]) expect(validClassCapacity(value)).toBe(true);
    for (const value of ["", "٠", "201", "١٫٥", "2.5", "-1", "1e2"]) expect(validClassCapacity(value)).toBe(false);
  });

  it("translates generated class alt text and preserves a distinct authored description", () => {
    expect(classImageAlt(ar, "Morning HIIT", "Morning HIIT photo")).toBe("صورة Morning HIIT");
    expect(classImageAlt(ar, "Morning HIIT", "Class photo")).toBe("صورة Morning HIIT");
    expect(classImageAlt(ar, "Morning HIIT", "مجموعتان تتدربان بالحبال")).toBe("مجموعتان تتدربان بالحبال");
  });

  it("retains a class draft, Arabic capacity and the same template ID across a failed save and language switch", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<ClassesPage />), { role: "owner", branchId: BRANCH_ABD });
    const save = vi.spyOn(api, "upsertClassSession").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    await user.click(screen.getByRole("button", { name: "إضافة حصة جماعية" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "اسم الحصة" }), "تدريب Morning");
    const capacity = within(dialog).getByRole("textbox", { name: /عدد المقاعد/ });
    fireEvent.change(capacity, { target: { value: "٢٠١" } });
    expect(within(dialog).getByRole("button", { name: "حفظ الحصة" })).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("1 إلى 200");
    fireEvent.change(capacity, { target: { value: "١٦" } });
    await user.type(within(dialog).getByRole("textbox", { name: "ملاحظات" }), "إحضار منشفة");
    await user.click(within(dialog).getByRole("button", { name: "حفظ الحصة" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const original = save.mock.calls[0]![0];
    expect(original).toMatchObject({ branchId: BRANCH_ABD, name: "تدريب Morning", capacity: 16, dayOfWeek: 0, startMinute: 1080, durationMinutes: 60, audience: "mixed", notes: "إحضار منشفة" });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Class name" })).toHaveValue("تدريب Morning");
    expect(within(dialog).getByRole("textbox", { name: "Capacity" })).toHaveValue("16");
    await user.click(within(dialog).getByRole("button", { name: "Save class" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(original);
  });

  it("retains a required cancellation reason and cancels only the selected occurrence", async () => {
    let occurrence: ClassOccurrence;
    const onClose = vi.fn();
    const Probe = () => <CancelOccurrenceDialog occurrence={occurrence} onClose={onClose} onSaved={async () => undefined} />;
    const { api } = await renderWithApp(arabic(<Probe />), { role: "owner", branchId: BRANCH_ABD, prepare: async api => {
      const from = todayISODate(); const list = await api.listClassOccurrences({ branchId: BRANCH_ABD, fromDate: from, toDate: addDays(from, 7) });
      occurrence = list.find(item => Date.parse(item.startsAt) > Date.now())!;
    } });
    const before = await api.listClassSessions({ branchId: BRANCH_ABD });
    const cancel = vi.spyOn(api, "cancelClassOccurrence").mockRejectedValueOnce(ApiError.of("CONFLICT", "The record changed."));
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "إلغاء هذه الحصة" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "سبب الإلغاء" }), "المدرب غير متاح لهذا الموعد");
    await user.click(screen.getByRole("button", { name: "إلغاء هذه الحصة" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    act(() => changeLocale("en"));
    expect(screen.getByRole("textbox", { name: "Cancellation reason" })).toHaveValue("المدرب غير متاح لهذا الموعد");
    await user.click(screen.getByRole("button", { name: "Cancel class" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(cancel.mock.calls[1]![0]).toEqual(cancel.mock.calls[0]![0]);
    expect(cancel.mock.calls[1]![0]).toEqual({ occurrenceId: occurrence!.id, reason: "المدرب غير متاح لهذا الموعد" });
    expect(await api.listClassSessions({ branchId: BRANCH_ABD })).toEqual(before);
  });

  it("keeps schedule management unavailable to reception in both languages", async () => {
    const user = userEvent.setup();
    await renderWithApp(arabic(<ClassesPage />), { role: "receptionist", branchId: BRANCH_ABD });
    expect(screen.queryByRole("button", { name: "إضافة حصة جماعية" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "المدربون" })).not.toBeInTheDocument();
    await user.click((await screen.findAllByRole("button", { name: "قائمة الحاجزين" }))[0]!);
    expect(screen.queryByRole("button", { name: "اعتماد الحضور" })).not.toBeInTheDocument();
    act(() => changeLocale("en"));
    expect(screen.queryByRole("button", { name: "New class" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish attendance" })).not.toBeInTheDocument();
  });
});
