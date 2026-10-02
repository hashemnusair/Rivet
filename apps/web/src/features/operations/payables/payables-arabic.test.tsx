import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { SupplierPaymentDetail } from "@/lib/domain/types";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PayablesWorkspace } from "./payables-workspace";
import { ReverseSupplierPaymentDialog } from "./supplier-payment-history-dialog";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/operations/payables", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.hasPointerCapture = vi.fn(() => false); HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn(); });
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><Probe />{children}</LocaleProvider>;

describe("Arabic supplier payments", () => {
  it("keeps a failed bank payment, authored reference, and retry key across languages without rounding invalid allocations", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<PayablesWorkspace />), { role: "owner", branchId: BRANCH_ABD });
    const row = (await screen.findAllByTestId("payable-row"))[0]!;
    expect(row).toHaveTextContent("طلب شراء");
    expect(row).toHaveTextContent("غير مدفوعة");
    await user.click(within(row).getByRole("button", { name: /^دفع قيمة/ }));
    const dialog = screen.getByRole("dialog", { name: "تسجيل دفعة للمورّد" });
    const save = vi.spyOn(api, "recordSupplierPayment").mockRejectedValueOnce(ApiError.of("CONFLICT", "The record changed."));
    await user.click(within(dialog).getByLabelText("كليك"));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "المبلغ المدفوع" }), { target: { value: "١٢٫٣٤٥" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /الرقم المرجعي لـ/ }), { target: { value: "CLIQ-٠٠٧-Ref" } });
    const allocation = within(dialog).getByRole("textbox", { name: /^المبلغ المخصص لـ/ });
    await waitFor(() => expect(allocation).toHaveValue("12.345"));
    fireEvent.change(allocation, { target: { value: "١٢٫٣٤٥٦" } });
    expect(allocation).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByTestId("confirm-supplier-payment")).toBeDisabled();
    fireEvent.change(allocation, { target: { value: "۱۲٫۳۴۵" } });
    await user.click(within(dialog).getByTestId("confirm-supplier-payment"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const original = save.mock.calls[0]![0];
    expect(original).toMatchObject({ method: "cliq", branchId: BRANCH_ABD, amount: { amount: 12345, currency: "JOD" }, reference: "CLIQ-٠٠٧-Ref", allocations: [{ payableId: expect.any(String), amount: { amount: 12345, currency: "JOD" } }] });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Amount paid" })).toHaveValue("١٢٫٣٤٥");
    expect(within(dialog).getByRole("textbox", { name: "CliQ reference" })).toHaveValue("CLIQ-٠٠٧-Ref");
    expect(within(dialog).getByRole("textbox", { name: /^Amount for/ })).toHaveValue("۱۲٫۳۴۵");
    await user.click(within(dialog).getByTestId("confirm-supplier-payment"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(original);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.stringContaining("/operations/payables/payments/")));
    expect((await api.listPayables()).items[0]!.remaining.amount).toBe(1650000 - 12345);
  });

  it("retains the reversal reason and same request across a failure and language switch", async () => {
    const user = userEvent.setup(); let payment: SupplierPaymentDetail | null = null; const completed = vi.fn();
    function Dialog() { return <ReverseSupplierPaymentDialog payment={payment} open onOpenChange={() => undefined} onReversed={completed} />; }
    const { api } = await renderWithApp(arabic(<Dialog />), { role: "owner", branchId: BRANCH_ABD, prepare: async api => {
      const payable = (await api.listPayables()).items[0]!;
      payment = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId: BRANCH_ABD, method: "bank_transfer", amount: { amount: 12500, currency: "JOD" }, reference: "REF-001", allocations: [{ payableId: payable.id, amount: { amount: 12500, currency: "JOD" } }], idempotencyKey: "arabic-reversal-fixture" });
    } });
    const reverse = vi.spyOn(api, "reverseSupplierPayment").mockRejectedValueOnce(ApiError.of("CONFLICT", "The record changed."));
    expect(screen.getByRole("dialog")).toHaveTextContent("وتصبح الفواتير التي غطتها الدفعة مستحقة مجددًا");
    fireEvent.change(screen.getByTestId("reverse-supplier-payment-reason"), { target: { value: "دُفعت الفاتورة ٠٠٧ مرتين" } });
    await user.click(screen.getByTestId("confirm-reverse-supplier-payment"));
    await waitFor(() => expect(reverse).toHaveBeenCalledOnce());
    act(() => changeLocale("en"));
    expect(screen.getByTestId("reverse-supplier-payment-reason")).toHaveValue("دُفعت الفاتورة ٠٠٧ مرتين");
    await user.click(screen.getByTestId("confirm-reverse-supplier-payment"));
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(reverse.mock.calls[1]![0]).toEqual(reverse.mock.calls[0]![0]);
    expect((await api.listPayables()).items[0]!.remaining.amount).toBe(1650000);
  });
});
