import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import type { Product } from "@/lib/domain/types";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ProductForm } from "./inventory-tab";
import { PurchaseOrderForm, SupplierForm } from "./purchasing-tabs";
import { OperationsCommandCenter } from "./operations-command-center";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/operations", useSearchParams: () => new URLSearchParams() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.hasPointerCapture = vi.fn(() => false); HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn(); });
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><Probe />{children}</LocaleProvider>;

describe("Arabic stock and purchasing", () => {
  it("preserves a product draft and its canonical unit while validating Arabic amounts and whole quantities", async () => {
    const user = userEvent.setup(); const save = vi.fn();
    await renderWithApp(arabic(<ProductForm currency="USD" branchId={BRANCH_ABD} pending={false} onCancel={() => undefined} onSubmit={save} />));
    fireEvent.change(screen.getByRole("textbox", { name: "رمز المنتج" }), { target: { value: "SKU-01" } });
    fireEvent.change(screen.getByRole("textbox", { name: "الاسم" }), { target: { value: "منتج A" } });
    fireEvent.change(screen.getByRole("textbox", { name: "الكمية المتاحة" }), { target: { value: "٢٤" } });
    fireEvent.change(screen.getByRole("textbox", { name: /إعادة الطلب عند/ }), { target: { value: "۵" } });
    fireEvent.change(screen.getByRole("textbox", { name: /سعر البيع/ }), { target: { value: "١٢٫٥٠٥" } });
    expect(screen.getByRole("button", { name: "حفظ المنتج" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /سعر البيع/ }), { target: { value: "١٢٫٥٠" } });
    await user.click(screen.getByRole("combobox", { name: "الوحدة" }));
    await user.click(screen.getByRole("option", { name: "علبة" }));
    act(() => changeLocale("en"));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("منتج A");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ sku: "SKU-01", name: "منتج A", unit: "box", branchId: BRANCH_ABD, availableQuantity: 24, reorderPoint: 5, retailPrice: { amount: 1250, currency: "USD" } }));
  });

  it("keeps a failed transfer draft and its idempotency key across a locale switch", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<OperationsCommandCenter />), { role: "manager", branchId: BRANCH_ABD });
    await screen.findByTestId("operations-inventory");
    const branch = screen.getByRole("combobox", { name: "فرع" });
    await user.click(branch); await user.click(screen.getByRole("option", { name: "Forge — Abdoun" }));
    const save = vi.spyOn(api, "transferInventory").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    await user.click(screen.getByRole("button", { name: "نقل المخزون" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "الكمية المطلوب نقلها" }), { target: { value: "٢" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "سبب النقل" }), { target: { value: "تزويد الفرع B" } });
    await user.click(within(dialog).getByRole("button", { name: "نقل المخزون" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const original = save.mock.calls[0]![0];
    expect(original).toMatchObject({ sourceBranchId: BRANCH_ABD, quantity: 2, reason: "تزويد الفرع B", idempotencyKey: expect.stringMatching(/^inventory-transfer-/) });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Quantity to move" })).toHaveValue("2");
    expect(within(dialog).getByRole("textbox", { name: "Reason for moving" })).toHaveValue("تزويد الفرع B");
    await user.click(within(dialog).getByRole("button", { name: "Move stock" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(original);
  });

  it("keeps a private purchase source, delivery date, and exact JOD amount across languages", async () => {
    const user = userEvent.setup(); const save = vi.fn(); let products: Product[] = [];
    function Form() { return <PurchaseOrderForm currency="JOD" branchId={BRANCH_ABD} products={products} suppliers={[]} pending={false} onCancel={() => undefined} onSubmit={save} />; }
    await renderWithApp(arabic(<Form />), { prepare: async api => { products = await api.listProducts(); } });
    fireEvent.change(screen.getByRole("textbox", { name: "الكمية" }), { target: { value: "١٢" } });
    fireEvent.change(screen.getByRole("textbox", { name: /تكلفة الوحدة/ }), { target: { value: "٣٫٥٢٥" } });
    fireEvent.change(screen.getByLabelText("تاريخ التسليم المتوقع"), { target: { value: "2026-10-31" } });
    act(() => changeLocale("en"));
    expect(screen.getByRole("combobox", { name: "Bought from" })).toHaveTextContent("Somewhere else");
    expect(screen.getByLabelText("Expected delivery date")).toHaveValue("2026-10-31");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "private", supplierId: undefined, expectedDeliveryDate: "2026-10-31", lines: [{ productId: products[0]!.id, quantity: 12, unitCost: { amount: 3525, currency: "JOD" } }] }));
  });

  it("normalizes supplier phone digits without rewriting authored names or terms", async () => {
    const user = userEvent.setup(); const save = vi.fn();
    await renderWithApp(arabic(<SupplierForm defaultBranchId={BRANCH_ABD} branches={[{ id: BRANCH_ABD, name: "فرع عمّان" }]} pending={false} onCancel={() => undefined} onSubmit={save} />));
    fireEvent.change(screen.getByRole("textbox", { name: "اسم المورّد" }), { target: { value: "أحمد Trading" } });
    fireEvent.change(screen.getByRole("textbox", { name: "الهاتف" }), { target: { value: "+٩٦٢٧٩١٢٣٤٥٦٧" } });
    fireEvent.change(screen.getByRole("textbox", { name: "شروط الدفع" }), { target: { value: "خلال ١٥ يومًا حسب الاتفاق" } });
    act(() => changeLocale("en"));
    await user.click(screen.getByRole("button", { name: "Save supplier" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "أحمد Trading", phone: "+962791234567", terms: "خلال ١٥ يومًا حسب الاتفاق", branchIds: [BRANCH_ABD] }));
  });
});
