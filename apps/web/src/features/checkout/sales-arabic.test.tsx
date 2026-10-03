import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { CashShift, Product } from "@/lib/domain/types";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator } from "@/lib/i18n/core";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CloseShiftDialog, OpenShiftDialog, makeOpenShiftSchema } from "@/features/finance/shift-dialogs";
import { CheckoutWorkspace } from "./checkout-workspace";
import { filterSellableProducts, validateSaleDraft } from "./checkout-model";
import ReceiptPageClient from "@/app/(app)/payments/receipts/[receiptId]/receipt.client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/checkout",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ receiptId: "unused" }),
}));
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.scrollIntoView = () => undefined;
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function LocaleProbe() {
  const { setLocale } = useLocale();
  useEffect(() => { changeLocale = setLocale; }, [setLocale]);
  return null;
}
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;

describe("Arabic checkout and cash reconciliation", () => {
  it("keeps the same draft and idempotency key across failure and a language switch", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<CheckoutWorkspace />), { role: "receptionist" });
    const checkout = vi.spyOn(api, "checkoutRetail").mockRejectedValueOnce(ApiError.of("CONFLICT", "The record changed.", { message: { key: "apiErrors.conflict" } }));
    await user.click(await screen.findByRole("button", { name: "إضافة Protein bar" }));
    const quantity = screen.getByRole("textbox", { name: "كمية Protein bar" });
    await user.clear(quantity);
    await user.type(quantity, "٢{Enter}");
    expect(quantity).toHaveValue("2");
    await user.click(screen.getByRole("button", { name: "إضافة الاسم والهاتف إلى وصل الدفع" }));
    await user.type(screen.getByRole("textbox", { name: "اسم الزبون" }), "أحمد Saleh");
    await user.type(screen.getByRole("textbox", { name: /رقم الهاتف/ }), "٠٧٩۱۲۳۴۵۶۷");
    await user.click(screen.getByRole("radio", { name: "كليك" }));
    await user.type(screen.getByRole("textbox", { name: /رقم مرجع/ }), "BANK-١٢-AbC");
    await user.click(screen.getByTestId("complete-retail-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(createTranslator("ar")("apiErrors.conflict"));
    expect(checkout).toHaveBeenCalledTimes(1);
    const original = checkout.mock.calls[0]![0];
    expect(original).toMatchObject({ method: "cliq", lines: [{ productId: expect.any(String), quantity: 2 }], externalReference: "BANK-١٢-AbC", guest: { fullName: "أحمد Saleh", phone: "0791234567" } });
    act(() => changeLocale("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("The record changed.");
    expect(screen.getByRole("textbox", { name: "Guest name" })).toHaveValue("أحمد Saleh");
    expect(screen.getByRole("textbox", { name: "Quantity for Protein bar" })).toHaveValue("2");
    await user.click(screen.getByTestId("complete-retail-sale"));
    expect(await screen.findByTestId("sale-result")).toHaveTextContent("Sale completed");
    expect(checkout).toHaveBeenCalledTimes(2);
    expect(checkout.mock.calls[1]![0]).toEqual(original);
  });

  it("normalizes Arabic search only for comparison and keeps insufficient-stock validation scoped to inventory", () => {
    const product: Product = { id: "water", organizationId: "gym", name: "مِيَاه الأبطال", sku: "WATER-12", unit: "each", reorderPoint: 1, status: "active", retailPrice: money(500), createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
    const original = structuredClone(product);
    expect(filterSellableProducts([product], "مياه الابطال").products).toEqual([product]);
    expect(filterSellableProducts([product], "water-١٢").exactSkuMatch).toBe(product);
    const text = validateSaleDraft({ branchId: "branch", lines: [{ product, quantity: 2 }], customer: { kind: "walk_in" }, method: "cash", reference: "" }, [], "JOD", { t: createTranslator("ar") });
    expect(text).toContain("الكمية المتبقية");
    expect(text).toContain("0");
    expect(product).toEqual(original);
  });

  it("keeps the required opening float and normalizes Arabic decimal amounts before writing", async () => {
    const user = userEvent.setup();
    let branchId = "";
    const Probe = () => <OpenShiftDialog open onOpenChange={() => undefined} branchId={branchId} />;
    const { api } = await renderWithApp(arabic(<Probe />), { role: "receptionist", prepare: async (mock) => { branchId = (await mock.getSession()).branches[0]!.id; } });
    const open = vi.spyOn(api, "openCashShift").mockRejectedValue(ApiError.of("SHIFT_ALREADY_OPEN", "A shift is already open."));
    await user.click(screen.getByTestId("confirm-open-shift"));
    expect(await screen.findByRole("alert")).toHaveTextContent("يرجى إدخال رصيد بداية الصندوق");
    expect(open).not.toHaveBeenCalled();
    await user.type(screen.getByTestId("opening-float"), "٥٠٫٢٥٠");
    act(() => changeLocale("en"));
    expect(screen.getByTestId("opening-float")).toHaveValue("٥٠٫٢٥٠");
    await user.click(screen.getByTestId("confirm-open-shift"));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ branchId, openingFloat: money(50_250) }));
    expect(makeOpenShiftSchema("USD").safeParse({ float: "١٫٢٣٤" }).success).toBe(false);
    expect(makeOpenShiftSchema("JOD").safeParse({ float: "١٫٢٣٤" }).success).toBe(true);
  });

  it("accepts Arabic denomination counts, rejects fractional counts and retains the required variance reason", async () => {
    const user = userEvent.setup();
    let shift: CashShift;
    const Probe = () => <CloseShiftDialog open onOpenChange={() => undefined} shift={shift} />;
    const { api } = await renderWithApp(arabic(<Probe />), { role: "receptionist", prepare: async (mock) => {
      const session = await mock.getSession();
      const branch = session.activeBranchId ?? session.branches[0]!.id;
      shift = (await mock.getCurrentCashShift(branch)) ?? await mock.openCashShift({ branchId: branch, openingFloat: money(50_000) });
    } });
    const close = vi.spyOn(api, "closeCashShift");
    await waitFor(() => expect(screen.getByTestId("confirm-close-shift")).toBeEnabled());
    const notes = screen.getByTestId("denom-50");
    await user.type(notes, "٢");
    expect(notes).toHaveValue("2");
    fireEvent.change(notes, { target: { value: "2.5" } });
    expect(notes).toHaveValue("2");
    await user.click(screen.getByTestId("confirm-close-shift"));
    expect(await screen.findByRole("alert")).toHaveTextContent("5 أحرف");
    expect(close).not.toHaveBeenCalled();
    act(() => changeLocale("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 5 characters");
    expect(notes).toHaveValue("2");
    await user.type(screen.getByTestId("variance-explanation"), "فرق موثّق للمراجعة");
    await user.click(screen.getByTestId("confirm-close-shift"));
    await waitFor(() => expect(close).toHaveBeenCalledWith(shift.id, { countedCash: money(100_000), varianceExplanation: "فرق موثّق للمراجعة" }));
  });

  it("preserves printed retail facts and receptionist refund permissions across language changes", async () => {
    let receiptId = "";
    const Probe = () => <ReceiptPageClient receiptId={receiptId} />;
    const { api } = await renderWithApp(arabic(<Probe />), { role: "receptionist", prepare: async (mock) => {
      const branch = (await mock.getSession()).branches[0]!.id;
      const product = (await mock.listProducts()).find(item => item.name === "Protein bar")!;
      const result = await mock.checkoutRetail({ branchId: branch, lines: [{ productId: product.id, quantity: 2 }], method: "cash", idempotencyKey: "arabic-refund-fixture" });
      receiptId = result.receipt.id;
    } });
    expect(screen.queryByTestId("retail-refund-button")).not.toBeInTheDocument();
    const original = await api.getReceipt(receiptId);
    expect(await screen.findByText(/^R-\d+$/)).toBeInTheDocument();
    act(() => changeLocale("en"));
    expect(await api.getReceipt(receiptId)).toEqual(original);
    expect(screen.queryByTestId("retail-refund-button")).not.toBeInTheDocument();
    expect(within(screen.getByText(/^R-\d+$/).closest("#receipt-print") as HTMLElement).getByText("Protein bar")).toBeInTheDocument();
  });

  it("preserves Arabic refund quantities, the reason and retry key across an error and locale change", async () => {
    const user = userEvent.setup();
    let receiptId = "";
    const Probe = () => <ReceiptPageClient receiptId={receiptId} />;
    const { api } = await renderWithApp(arabic(<Probe />), { role: "owner", prepare: async (mock) => {
      const branch = (await mock.getSession()).branches[0]!.id;
      const product = (await mock.listProducts()).find(item => item.name === "Protein bar")!;
      receiptId = (await mock.checkoutRetail({ branchId: branch, lines: [{ productId: product.id, quantity: 2 }], method: "cash", idempotencyKey: "arabic-manager-refund" })).receipt.id;
    } });
    const refund = vi.spyOn(api, "refundRetailSale").mockRejectedValueOnce(new Error("Internal SQL diagnostic"));
    await user.click(await screen.findByTestId("retail-refund-button"));
    const dialog = screen.getByRole("dialog");
    const quantity = within(dialog).getByRole("textbox", { name: /Protein bar/ });
    fireEvent.change(quantity, { target: { value: "١" } });
    expect(quantity).toHaveValue("1");
    const reason = within(dialog).getByTestId("retail-refund-reason");
    await user.type(reason, "إرجاع صنف غير مفتوح");
    await user.click(within(dialog).getByTestId("confirm-retail-refund"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(createTranslator("ar")("renewFlow.receipt.retailRefund.saveFailed"));
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("SQL");
    const original = refund.mock.calls[0]!;
    expect(original[1]).toMatchObject({ lines: [{ productId: expect.any(String), quantity: 1 }], reason: "إرجاع صنف غير مفتوح" });
    act(() => changeLocale("en"));
    expect(reason).toHaveValue("إرجاع صنف غير مفتوح");
    expect(quantity).toHaveValue("1");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(createTranslator("en")("renewFlow.receipt.retailRefund.saveFailed"));
    await user.click(within(dialog).getByTestId("confirm-retail-refund"));
    await waitFor(() => expect(refund).toHaveBeenCalledTimes(2));
    expect(refund.mock.calls[1]).toEqual(original);
  });

});
