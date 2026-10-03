import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ManagementLedgerWorkspace } from "./management-ledger-workspace";
import { LedgerTutorial } from "@/features/reports/ledger-tutorial";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/finance/controls", useSearchParams: () => new URLSearchParams() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.hasPointerCapture = vi.fn(() => false); HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn(); });
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><Probe />{children}</LocaleProvider>;

describe("Arabic bookkeeping", () => {
  it("retains an exact balanced manual journal after failure and language switch, without dropping invalid amounts", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<ManagementLedgerWorkspace />), { role: "owner", branchId: BRANCH_ABD });
    await user.click(await screen.findByRole("button", { name: "إضافة قيد محاسبي" }));
    const save = vi.spyOn(api, "postManualJournal").mockRejectedValueOnce(ApiError.of("CONFLICT", "The record changed."));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "حساب البند 1" })).toHaveTextContent("1100 · النقد في الصندوق");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "الوصف" }), { target: { value: "تسوية ٠٠٧ / Original" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب" }), { target: { value: "مراجعة حسابات الفرع" } });
    fireEvent.change(within(dialog).getByLabelText(/تاريخ القيد/), { target: { value: "2026-08-15" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مدين البند 1" }), { target: { value: "١٢٫٣٤٥٦" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "دائن البند 2" }), { target: { value: "۱۲٫۳۴۵" } });
    expect(within(dialog).getByRole("button", { name: "إضافة قيد" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مدين البند 1" }), { target: { value: "١٢٫٣٤٥" } });
    await user.click(within(dialog).getByRole("button", { name: "إضافة قيد" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const original = save.mock.calls[0]![0];
    expect(original).toMatchObject({ branchId: BRANCH_ABD, scope: "branch", postingDate: "2026-08-15", memo: "تسوية ٠٠٧ / Original", reason: "مراجعة حسابات الفرع", lines: [{ accountId: expect.any(String), debit: { amount: 12345, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: expect.any(String), debit: { amount: 0, currency: "JOD" }, credit: { amount: 12345, currency: "JOD" } }] });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue("تسوية ٠٠٧ / Original");
    expect(within(dialog).getByLabelText(/Entry date/)).toHaveValue("2026-08-15");
    expect(within(dialog).getByRole("textbox", { name: "Line 1 debit" })).toHaveValue("١٢٫٣٤٥");
    await user.click(within(dialog).getByRole("button", { name: "Add entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(original);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const balance = await api.getAccountingTrialBalance({ branchId: BRANCH_ABD });
    expect(balance.totalDebit).toEqual(balance.totalCredit);
    expect(balance.totalDebit.amount).toBe(12345);
  });

  it("retranslates a month-close dialog without losing its reason or changing the selected period", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<ManagementLedgerWorkspace />), { role: "owner", branchId: BRANCH_ABD, prepare: async api => {
      const accounts = await api.listAccountingAccounts();
      await api.postManualJournal({ branchId: BRANCH_ABD, scope: "branch", postingDate: "2026-08-15", memo: "قيد افتتاحي", reason: "رصيد افتتاحي معتمد", idempotencyKey: "arabic-ledger-period", lines: [{ accountId: accounts[0]!.id, debit: { amount: 5000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: accounts[1]!.id, debit: { amount: 0, currency: "JOD" }, credit: { amount: 5000, currency: "JOD" } }] });
    } });
    const close = vi.spyOn(api, "closeAccountingPeriod");
    await user.click(await screen.findByRole("tab", { name: "الأشهر" }));
    await user.click(screen.getByRole("button", { name: "إغلاق الشهر" }));
    const dialog = screen.getByRole("dialog", { name: "إغلاق آب 2026؟" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب" }), { target: { value: "اكتملت المراجعة ٠٠٧" } });
    act(() => changeLocale("en"));
    expect(dialog).toHaveAccessibleName("Close August 2026?");
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("اكتملت المراجعة ٠٠٧");
    await user.click(within(dialog).getByRole("button", { name: "Close month" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(expect.any(String), "اكتملت المراجعة ٠٠٧"));
    const period = (await api.listAccountingPeriods()).find(p => p.id === close.mock.calls[0]![0]);
    expect(period).toMatchObject({ periodStart: "2026-08-01", status: "closed", closeReason: "اكتملت المراجعة ٠٠٧" });
  });

  it("keeps the tutorial on its current step across languages and renders every artwork without changing hook order", async () => {
    const user = userEvent.setup();
    await renderWithApp(arabic(<LedgerTutorial />));
    await user.click(screen.getByRole("button", { name: "طريقة عمل السجل المالي" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("350.000 د.أ");
    for (let i = 2; i <= 7; i++) await user.click(within(dialog).getByRole("tab", { name: new RegExp(`^الخطوة ${i}:`) }));
    expect(dialog).toHaveTextContent("خطوتان كل شهر");
    act(() => changeLocale("en"));
    expect(dialog).toHaveTextContent("Two clicks a month");
    expect(within(dialog).getByRole("tab", { name: /^Step 7:/ })).toHaveAttribute("aria-selected", "true");
  });
});
