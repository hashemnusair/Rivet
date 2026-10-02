import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ManagementStatementPage } from "./management-statements-workspace";

const router = { replace: vi.fn(), push: vi.fn() };
const search = new URLSearchParams(`from=2026-08-01&to=2026-08-31&branchId=${BRANCH_ABD}`);
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/finance/income-statement", useSearchParams: () => search }));
afterEach(() => { resetApiForTests(); router.replace.mockClear(); });
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><Probe />{children}</LocaleProvider>;

describe("Arabic financial statements", () => {
  it.each([
    ["income", "قائمة الدخل", "Income statement", "income-statement"],
    ["balance", "الميزانية العمومية", "Balance sheet", "balance-sheet"],
    ["cashflow", "حركة النقد", "Cash flow statement", "cashflow-statement"],
  ] as const)("formats the %s projection while preserving its scoped dates and journal facts", async (kind, title, english, testId) => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<ManagementStatementPage kind={kind} />), { role: "owner", branchId: BRANCH_ABD, prepare: async api => {
      const accounts = await api.listAccountingAccounts();
      await api.postManualJournal({ branchId: BRANCH_ABD, scope: "branch", postingDate: "2026-08-15", memo: "Original note / ٠٠٧", reason: "مراجعة الإيرادات", idempotencyKey: `arabic-statement-${kind}`, lines: [{ accountId: accounts.find(a => a.code === "1100")!.id, debit: { amount: 15000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: accounts.find(a => a.code === "4100")!.id, debit: { amount: 0, currency: "JOD" }, credit: { amount: 15000, currency: "JOD" } }] });
    } });
    await screen.findByTestId(testId);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.tagName === "BDI" && element.textContent === "15.000 د.أ").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "حول هذه الأرقام" })).toHaveTextContent("آب 2026");
    if (kind === "cashflow") {
      expect(screen.getByRole("status", { name: "مراجعة النقد" })).toHaveTextContent("تحتاج أرقام النقد إلى مراجعة");
      expect(screen.queryByText("أرقام النقد متطابقة")).not.toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText("من تاريخ"), { target: { value: "2026-08-02" } });
    await waitFor(() => expect(screen.getByRole("link", { name: "جميع القوائم المالية" })).toHaveAttribute("href", expect.stringContaining("from=2026-08-02")));
    act(() => changeLocale("en"));
    expect(screen.getByRole("heading", { name: english })).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toHaveValue("2026-08-02");
    expect(screen.getByLabelText("To date")).toHaveValue("2026-08-31");
    expect(screen.getByRole("link", { name: "All statements" })).toHaveAttribute("href", expect.stringContaining(`branchId=${BRANCH_ABD}`));
    act(() => changeLocale("ar"));
    const query = kind === "income" ? "getIncomeStatement" : kind === "balance" ? "getBalanceSheet" : "getCashflowStatement";
    const request = vi.spyOn(api, query).mockRejectedValueOnce(new Error("Temporary internal report outage"));
    await user.click(screen.getByRole("button", { name: "إعادة التحميل" }));
    expect(await screen.findByRole("status", { name: "قد تكون الأرقام غير محدّثة" })).toBeInTheDocument();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByText("Temporary internal report outage")).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({ fromDate: "2026-08-02", toDate: "2026-08-31", branchId: BRANCH_ABD });
    const balance = await api.getAccountingTrialBalance({ branchId: BRANCH_ABD });
    expect(balance.totalDebit).toEqual({ amount: 15000, currency: "JOD" });
    expect(balance.totalCredit).toEqual(balance.totalDebit);
  });
});
