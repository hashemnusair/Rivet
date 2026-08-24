import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { Product } from "@/lib/domain/types";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { RetailCheckout, checkoutAmount, hasSellableRetailPrice, retailPriceOf } from "./retail-checkout";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
let checkoutSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/operations/checkout",
  useSearchParams: () => checkoutSearchParams,
}));

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
  targetLevel: 10,
  supplierLeadTimeDays: 3,
  retailPrice: { amount: 1_000, currency: "JOD" },
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function BranchChanger({ branchId }: { branchId: string }) {
  const { setBranch } = useApp();
  useEffect(() => { void setBranch(branchId); }, [branchId, setBranch]);
  return null;
}

describe("retail checkout", () => {
  it("uses the configured customer-facing price, not supplier cost", () => {
    const sellable = product({ defaultUnitCost: { amount: 400, currency: "JOD" } });
    expect(retailPriceOf(sellable)).toEqual({ amount: 1_000, currency: "JOD" });
    expect(checkoutAmount([{ product: sellable, quantity: 3 }])).toEqual({ amount: 3_000, currency: "JOD" });
    expect(retailPriceOf(product({ retailPrice: undefined }))).toBeUndefined();
    expect(hasSellableRetailPrice(sellable, "JOD")).toBe(true);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: 0, currency: "JOD" } }), "JOD")).toBe(false);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: Number.MAX_SAFE_INTEGER + 1, currency: "JOD" } }), "JOD")).toBe(false);
    expect(hasSellableRetailPrice(product({ retailPrice: { amount: 1_000, currency: "USD" } }), "JOD")).toBe(false);
  });

  it("honors a valid branch and product deep link and preselects that item", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const productToSell = (await probe.listProducts()).find((item) => item.retailPrice?.amount && item.retailPrice.amount > 0)!;
    checkoutSearchParams = new URLSearchParams({ branchId: session.branches[0]!.id, productId: productToSell.id });

    await renderWithApp(<RetailCheckout />, { role: "receptionist" });

    await screen.findByText("Protein bar");
    expect(await screen.findByRole("button", { name: `Add another ${productToSell.name}` })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Checkout branch" })).toHaveTextContent(session.branches[0]!.name);
  });

  it("offers member lookup and guest checkout without asking for a fake member", async () => {
    const user = userEvent.setup();
    await renderWithApp(<RetailCheckout />, { role: "receptionist" });

    expect(await screen.findByTestId("retail-checkout")).toBeInTheDocument();
    expect(await screen.findByText("Protein bar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /guest/i }));

    expect(screen.getByRole("textbox", { name: "Guest name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Phone number" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search member for retail sale" })).not.toBeInTheDocument();
  });

  it("follows a Topbar branch change when the URL did not explicitly choose a branch", async () => {
    const probe = new MockGymOSApi();
    const session = await probe.getSession();
    const nextBranch = session.branches[1]!;

    await renderWithApp(<><BranchChanger branchId={nextBranch.id} /><RetailCheckout /></>, { role: "owner" });

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Checkout branch" })).toHaveTextContent(nextBranch.name));
  });

  it("requires a reference for non-cash methods", async () => {
    const user = userEvent.setup();
    await renderWithApp(<RetailCheckout />, { role: "receptionist" });
    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /guest/i }));
    await user.type(screen.getByRole("textbox", { name: "Guest name" }), "Guest buyer");
    await user.type(screen.getByRole("textbox", { name: "Phone number" }), "0790000000");
    await user.click(screen.getByRole("button", { name: /add protein bar/i }));
    await user.click(screen.getByLabelText("CliQ"));
    expect(screen.getByRole("textbox", { name: /cliq reference/i })).toBeRequired();
    await user.click(screen.getByTestId("complete-retail-sale"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reference number is required/i);
  });

  it("submits a member sale and navigates to its receipt immediately", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<RetailCheckout />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");

    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /add protein bar/i }));
    const memberResults = await screen.findByRole("list", { name: "Member results" });
    await user.click(within(memberResults).getAllByRole("button")[0]!);
    await user.click(screen.getByLabelText("Visa / card"));
    await user.type(screen.getByRole("textbox", { name: /visa \/ card reference/i }), "VISA-UI-MEMBER");
    await user.click(screen.getByTestId("complete-retail-sale"));

    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ memberId: expect.any(String), branchId: expect.any(String), method: "card", externalReference: "VISA-UI-MEMBER", lines: [{ productId: expect.any(String), quantity: 1 }] })));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/^\/payments\/receipts\/[^?]+\?from=checkout$/)));
  });

  it("submits a guest sale with only the guest snapshot and navigates to its receipt", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<RetailCheckout />, { role: "receptionist" });
    const checkoutSpy = vi.spyOn(api, "checkoutRetail");

    await screen.findByText("Protein bar");
    await user.click(screen.getByRole("button", { name: /guest/i }));
    await user.type(screen.getByRole("textbox", { name: "Guest name" }), "Guest buyer");
    await user.type(screen.getByRole("textbox", { name: "Phone number" }), "0790000000");
    await user.click(screen.getByRole("button", { name: /add protein bar/i }));
    await user.click(screen.getByLabelText("CliQ"));
    await user.type(screen.getByRole("textbox", { name: /cliq reference/i }), "CLIQ-UI-GUEST");
    await user.click(screen.getByTestId("complete-retail-sale"));

    await waitFor(() => expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({ guest: { fullName: "Guest buyer", phone: "0790000000" }, method: "cliq", externalReference: "CLIQ-UI-GUEST", lines: [{ productId: expect.any(String), quantity: 1 }] })));
    expect(checkoutSpy.mock.calls[0]?.[0]).not.toHaveProperty("memberId");
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/^\/payments\/receipts\/[^?]+\?from=checkout$/)));
  });
});
