import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "@/app/(app)/reports/page";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import type { Page, TransactionSummary } from "@/lib/domain/types";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { downloadTextFile } from "@/lib/exports/download";

const location = vi.hoisted(() => ({ params: new URLSearchParams("to=2026-08-31"), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: location.replace, push: vi.fn() }), usePathname: () => "/reports", useSearchParams: () => location.params }));
vi.mock("@/lib/exports/download", () => ({ downloadTextFile: vi.fn() }));
afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); vi.mocked(downloadTextFile).mockClear(); location.params = new URLSearchParams("to=2026-08-31"); });
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const transaction: TransactionSummary = { id: "PAY-007", organizationId: "org-001", branchId: BRANCH_ABD, branchName: "Original branch", memberId: "member-001", memberName: "=أحمد / ٠٠٧", memberNumber: "ABD-007", type: "payment", amount: { amount: 12345, currency: "JOD" }, method: "cash", status: "completed", receiptId: "receipt-001", receiptNumber: "R-007", collectedById: "staff-001", collectedByName: "سارة", externalReference: "Original ٠٠٧ / REF", idempotencyKey: "original-key", occurredAt: "2026-08-31T12:30:45Z" };
const page: Page<TransactionSummary> = { items: [transaction], totalItems: 1, page: 1, pageSize: 100, totalPages: 1 };

describe("finance overview Arabic download", () => {
  it("uses the current language but the original request scope when filters change during a download", async () => {
    const rendered = await renderWithApp(<LocaleProvider initialLocale="en"><Probe /><ReportsPage /></LocaleProvider>, { branchId: BRANCH_ABD, prepare: async api => { vi.spyOn(api, "listTransactions").mockResolvedValue(page); } });
    const user = userEvent.setup();
    const download = await screen.findByRole("button", { name: "Download report" });
    await waitFor(() => expect(download).toBeEnabled());
    let release!: (value: Page<TransactionSummary>) => void;
    const pending = new Promise<Page<TransactionSummary>>(resolve => { release = resolve; });
    vi.mocked(rendered.api.listTransactions).mockReturnValueOnce(pending);
    await user.click(download);
    await waitFor(() => expect(rendered.api.listTransactions).toHaveBeenCalledTimes(2));
    location.params = new URLSearchParams("to=2026-09-30&branchId=all");
    act(() => changeLocale("ar"));
    expect(await screen.findByRole("button", { name: "تنزيل التقرير" })).toBeDisabled();
    await act(async () => { release(page); });
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledOnce());
    const exported = vi.mocked(downloadTextFile).mock.lastCall![0];
    expect(exported.fileName).toBe("rivet-finance-report-2026-08-02-2026-08-31.csv");
    expect(exported.content).toContain("من 2 آب 2026 إلى 31 آب 2026");
    expect(exported.content).not.toContain("أيلول");
    expect(exported.content).toContain("طريقة الدفع");
    expect(exported.content).toContain("31 آب 2026 3:30:45 م,'=أحمد / ٠٠٧,ABD-007,Original branch,كاش");
    expect(exported.content).toContain("12.345,JOD");
    expect(exported.content).toContain("R-007,سارة,Original ٠٠٧ / REF,PAY-007");
    expect(transaction.amount).toEqual({ amount: 12345, currency: "JOD" });
    expect(transaction.idempotencyKey).toBe("original-key");
  });
});
