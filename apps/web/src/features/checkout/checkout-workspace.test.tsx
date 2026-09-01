import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/domain/types";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CheckoutWorkspace } from "./checkout-workspace";
import { buildCheckoutInput, checkoutAmount, filterSellableProducts, hasSellableRetailPrice, retailPriceOf, validateSaleDraft } from "./checkout-model";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
let checkoutSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/checkout",
  useSearchParams: () => checkoutSearchParams,
}));

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => {
  routerMock.push.mockReset();
  checkoutSearchParams = new URLSearchParams();
  resetApiForTests();
});

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "product-1",
  organizationId: "org-1",
  sku: "SUP-1",
  name: "Protein bar",
  unit: "each",
  reorderPoint: 2,
  retailPrice: { amount: 1_000, currency: "JOD" },
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function BranchChanger({ branchId }: { branchId: string | undefined }) {
  const { setBranch } = useApp();
  useEffect(() => { void setBranch(branchId); }, [branchId, setBranch]);
  return null;
}


/** Adds an unpriced and an out-of-stock item on the live harness api before showing checkout. */
function SeedThenShow() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      const api = getApi();
      await api.upsertProduct({ sku: "NO-PRICE", name: "Unpriced towel", unit: "each", reorderPoint: 1 });
      await api.upsertProduct({ sku: "NO-STOCK", name: "Empty shelf", unit: "each", reorderPoint: 1, retailPrice: { amount: 500, currency: "JOD" } });
      setReady(true);
    })();
  }, []);
  return ready ? <CheckoutWorkspace /> : null;
}

/** Closes the demo branch's open drawer on the live harness api, then shows checkout. */
function CloseShiftThenShow({ branchId }: { branchId: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      const api = getApi();
      const open = await api.getCurrentCashShift(branchId);
      if (open) await api.closeCashShift(open.id, { countedCash: { amount: 0, currency: "JOD" }, varianceExplanation: "Closed for the checkout test" });
      setReady(true);
    })();
  }, [branchId]);
  return ready ? <CheckoutWorkspace /> : null;
}

function GlobalBranchProbe() {
  const { session } = useApp();
  return <span data-testid="global-branch">{session?.activeBranchId ?? "all"}</span>;
}

describe("checkout model", () => {
  it("uses the configured customer-facing price, not supplier cost", () => {
    const sellable = product();
    expect(retailPriceOf(sellable)).toEqual({ amount: 1_000, currency: "JOD" });
    expect(checkoutAmount([{ product: sellable, quantity: 3 }])).toEqual({ amount: 3_000, currency: "JOD" });
    expect(retailPriceOf(product({ retailPrice: undefined }))).toBeUndefined();
    expect(hasSellableRetailPrice(sellable, "JOD")).toBe(true);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: 0, currency: "JOD" } }), "JOD")).toBe(false);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: Number.MAX_SAFE_INTEGER + 1, currency: "JOD" } }), "JOD")).toBe(false);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: 1_000, currency: "USD" } }), "JOD")).toBe(false);
  });

  it("surfaces an exact SKU match first so a scanned barcode adds the right item", () => {
    const bar = product();
    const shake = product({ id: "product-2", sku: "SUP-10", name: "Protein shake" });
    expect(filterSellableProducts([bar, shake], "sup-10").exactSkuMatch?.id).toBe("product-2");
    expect(filterSellableProducts([bar, shake], "protein").products.map((item) => item.id)).toEqual(["product-1", "product-2"]);
    expect(filterSellableProducts([bar, product({ id: "archived", status: "archived" })], "").products).toHaveLength(1);
  });

  it("builds an anonymous sale with no customer object and validates in the operator's words", () => {
    const line = { product: product(), quantity: 1 };
    const inventory = [{ id: "b", organizationId: "org-1", branchId: "branch", productId: "product-1", quantityOnHand: 1, committedQuantity: 0, availableQuantity: 1, updatedAt: "2026-01-01T00:00:00.000Z" }];
    const draft = { branchId: "branch", lines: [line], customer: { kind: "walk_in" as const }, method: "cash" as const, reference: "" };
    const input = buildCheckoutInput(draft, "key");
    expect(input).toEqual({ branchId: "branch", lines: [{ productId: "product-1", quantity: 1 }], method: "cash", idempotencyKey: "key" });
    expect(input).not.toHaveProperty("memberId");
    expect(input).not.toHaveProperty("guest");
    expect(validateSaleDraft(draft, inventory, "JOD")).toBeUndefined();
    expect(validateSaleDraft({ ...draft, method: "card" }, inventory, "JOD")).toMatch(/reference number is required/i);
    expect(validateSaleDraft({ ...draft, lines: [{ ...line, quantity: 2 }] }, inventory, "JOD")).toMatch(/only 1 available/i);
    expect(validateSaleDraft({ ...draft, customer: { kind: "guest", fullName: "", phone: "" } }, inventory, "JOD")).toMatch(/receipt name and phone/i);
    expect(validateSaleDraft(draft, inventory, "JOD", { cashShiftOpen: false })).toMatch(/open a cash shift/i);
    expect(validateSaleDraft({ ...draft, lines: [{ product: product({ retailPrice: undefined }), quantity: 1 }] }, inventory, "JOD")).toMatch(/no selling price/i);
  });
});

describe("checkout workspace", () => {
  it("honors a valid branch and product deep link without repeating a sole assigned branch", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const productToSell = (await probe.listProducts()).find((item) => item.retailPrice?.amount && item.retailPrice.amount > 0)!;
    checkoutSearchParams = new URLSearchParams({ branchId: session.branches[0]!.id, productId: productToSell.id });

    await renderWithApp(<><GlobalBranchProbe /><CheckoutWorkspace /></>, { role: "receptionist" });

    expect(await screen.findByRole("button", { name: `Add another ${productToSell.name}` })).toBeInTheDocument();
    expect(screen.getByTestId("global-branch")).toHaveTextContent(session.branches[0]!.id);
    expect(screen.queryByRole("combobox", { name: "Checkout branch" })).not.toBeInTheDocument();
  });

  it("does not silently use the first branch when the app is scoped to all branches", async () => {
    await renderWithApp(<CheckoutWorkspace />, { role: "owner" });
    expect(await screen.findByRole("combobox", { name: "Checkout branch" })).toHaveTextContent("Choose a branch");
    expect(screen.getByText("Choose a branch to check out")).toBeInTheDocument();
    expect(screen.queryByText("Choose items")).not.toBeInTheDocument();
  });

  it("synchronizes a checkout branch choice with the global app branch", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const nextBranch = session.branches[1]!;
    const user = userEvent.setup();
    await renderWithApp(<><GlobalBranchProbe /><CheckoutWorkspace /></>, { role: "owner" });
    fireEvent.keyDown(await screen.findByRole("combobox", { name: "Checkout branch" }), { key: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: nextBranch.name }));
    await waitFor(() => {
      expect(screen.getByTestId("global-branch")).toHaveTextContent(nextBranch.id);
      expect(screen.getByRole("combobox", { name: "Checkout branch" })).toHaveTextContent(nextBranch.name);
    });
    expect(await screen.findByText("Choose items")).toBeInTheDocument();
  });

  it("follows a Topbar branch change when the URL did not explicitly choose a branch", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const nextBranch = session.branches[1]!;
    await renderWithApp(<><BranchChanger branchId={nextBranch.id} /><CheckoutWorkspace /></>, { role: "owner" });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Checkout branch" })).toHaveTextContent(nextBranch.name));
  });

  it("sells to a walk-in customer by default with no name, phone, or member step", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CheckoutWorkspace />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");
    expect(await screen.findByTestId("retail-checkout")).toBeInTheDocument();
    expect(await screen.findByText("Protein bar")).toBeInTheDocument();
    expect(screen.getByTestId("customer-attach")).toHaveTextContent(/Walk-in customer/i);
    expect(screen.queryByRole("textbox", { name: "Guest name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search member for retail sale" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Add Protein bar/i }));
    expect(screen.getAllByTestId("cart-line")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/Cash goes into the open shift/i);
    await user.click(screen.getByTestId("complete-retail-sale"));
    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "cash", lines: [{ productId: expect.any(String), quantity: 1 }] })));
    const input = checkoutSpy.mock.calls[0]![0];
    expect(input).not.toHaveProperty("memberId");
    expect(input).not.toHaveProperty("guest");
    const result = await screen.findByTestId("sale-result");
    expect(result).toHaveTextContent("Sale completed");
    expect(result).toHaveTextContent(/Receipt R-/);
    expect(result).toHaveTextContent("No customer profile was created");
    expect(within(result).getByRole("link", { name: /Open receipt/i })).toHaveAttribute("href", expect.stringMatching(/^\/payments\/receipts\//));
    expect(routerMock.push).not.toHaveBeenCalled();
    await user.click(within(result).getByTestId("next-sale"));
    expect(await screen.findByText("Choose items")).toBeInTheDocument();
    expect(screen.queryAllByTestId("cart-line")).toHaveLength(0);
  });

  it("attaches a member optionally and adds the sale to their timeline", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CheckoutWorkspace />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");
    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /^Add Protein bar/i }));
    await user.click(screen.getByRole("button", { name: "Attach member" }));
    const memberResults = await screen.findByRole("list", { name: "Member results" });
    await user.click(within(memberResults).getAllByRole("button")[0]!);
    expect(await screen.findByTestId("selected-member")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Visa / card"));
    await user.type(screen.getByRole("textbox", { name: /visa \/ card reference/i }), "VISA-UI-MEMBER");
    await user.click(screen.getByTestId("complete-retail-sale"));
    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ memberId: expect.any(String), method: "card", externalReference: "VISA-UI-MEMBER" })));
    const memberId = checkoutSpy.mock.calls[0]![0].memberId!;
    const result = await screen.findByTestId("sale-result");
    expect(result).toHaveTextContent("Member");
    const timeline = await api.listMemberTimeline(memberId);
    expect(timeline.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "payment_collected" })]));
  });

  it("keeps receipt details behind a secondary action and requires both fields once opened", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CheckoutWorkspace />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");
    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /^Add Protein bar/i }));
    await user.click(screen.getByRole("button", { name: "Add receipt details" }));
    await user.type(screen.getByRole("textbox", { name: "Guest name" }), "Guest buyer");
    await user.click(screen.getByTestId("complete-retail-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/receipt name and phone/i);
    expect(checkoutSpy).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Phone number" }), "0790000000");
    await user.click(screen.getByLabelText("CliQ"));
    await user.type(screen.getByRole("textbox", { name: /cliq reference/i }), "CLIQ-UI-GUEST");
    await user.click(screen.getByTestId("complete-retail-sale"));
    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ guest: { fullName: "Guest buyer", phone: "0790000000" }, method: "cliq", externalReference: "CLIQ-UI-GUEST" })));
    expect(checkoutSpy.mock.calls[0]![0]).not.toHaveProperty("memberId");
  });

  it("requires a reference for non-cash methods and clears it when switching back to cash", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CheckoutWorkspace />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");
    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /^Add Protein bar/i }));
    await user.click(screen.getByLabelText("CliQ"));
    expect(screen.getByRole("textbox", { name: /cliq reference/i })).toBeRequired();
    await user.click(screen.getByTestId("complete-retail-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reference number is required/i);
    await user.type(screen.getByRole("textbox", { name: /cliq reference/i }), "CLIQ-WAS-HERE");
    await user.click(screen.getByLabelText("Cash"));
    expect(screen.queryByRole("textbox", { name: /cliq reference/i })).not.toBeInTheDocument();
    await user.click(screen.getByTestId("complete-retail-sale"));
    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "cash" })));
    expect(checkoutSpy.mock.calls[0]?.[0]).not.toHaveProperty("externalReference");
  });

  it("blocks cash when no shift is open and prevents a double submit", async () => {
    const user = userEvent.setup();
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const branchId = session.branches[0]!.id;
    const { api } = await renderWithApp(<><BranchChanger branchId={branchId} /><CloseShiftThenShow branchId={branchId} /></>, { role: "owner" });
    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /^Add Protein bar/i }));
    expect(await screen.findByTestId("no-open-shift")).toBeInTheDocument();
    expect(screen.getByTestId("complete-retail-sale")).toBeDisabled();
    await user.click(screen.getByLabelText("CliQ"));
    expect(screen.getByTestId("complete-retail-sale")).toBeEnabled();
    await user.type(screen.getByRole("textbox", { name: /cliq reference/i }), "CLIQ-DOUBLE");
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");
    const button = screen.getByTestId("complete-retail-sale");
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByTestId("sale-result");
    expect(checkoutSpy).toHaveBeenCalledTimes(1);
  });

  it("shows honest out-of-stock and missing-price rows instead of hiding them", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const branchId = session.branches[0]!.id;
    await renderWithApp(<><BranchChanger branchId={branchId} /><SeedThenShow /></>, { role: "owner" });
    await waitFor(() => expect(screen.getByText("Unpriced towel")).toBeInTheDocument());
    const unpricedRow = screen.getByText("Unpriced towel").closest("li")!;
    expect(unpricedRow).toHaveTextContent("No selling price");
    expect(within(unpricedRow).getByRole("button", { name: /Add Unpriced towel/ })).toBeDisabled();
    const emptyRow = screen.getByText("Empty shelf").closest("li")!;
    expect(emptyRow).toHaveTextContent("Out of stock");
    expect(within(emptyRow).getByRole("button", { name: /Add Empty shelf/ })).toBeDisabled();
  });
});
