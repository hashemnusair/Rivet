import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { setApiForTests } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { openInvoicePdf, usePaymentDetailsLoader } from "./invoice-pdf";

const renderer = vi.hoisted(() => ({ input: vi.fn() }));

// The renderer itself is covered by the PDF tests; here only what reaches it.
vi.mock("../../../convex/platformInvoicePdf", () => ({ renderInvoicePdf: () => new Uint8Array([37, 80, 68, 70]), invoicePdfFilename: (id: string) => `${id}.pdf` }));
vi.mock("../../../convex/platformInvoiceDocument", () => ({ invoicePdfInput: (...args: unknown[]) => { renderer.input(...args); return {}; } }));

const DETAILS = { cliqAlias: "RIVETPAY", cliqName: "RIVET", bankName: "Bank", accountName: "RIVET", iban: "JO71CBJO0000000000001234567890", note: "Write the invoice number." };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const invoice = { id: "INV-1", gym: "Forge", amount: "JOD 39.000", amountMinor: 39_000, currency: "JOD", date: "2026-10-21T00:00:00.000Z", status: "open" } as PlatformBillingInvoice;

afterEach(() => {
  vi.restoreAllMocks();
  renderer.input.mockReset();
});

describe("invoice PDFs opened in the browser", () => {
  it("print where RIVET is paid, from the console's settings or the gym's payment page", async () => {
    const api = new MockGymOSApi();
    setApiForTests(api);
    const platform = new QueryClient();
    platform.setQueryData(qk.platformCommerce, { paymentDetails: DETAILS });
    const { result: fromConsole } = renderHook(() => usePaymentDetailsLoader("platform"), { wrapper: wrapper(platform) });
    await expect(fromConsole.current()).resolves.toEqual(DETAILS);

    const gym = new QueryClient();
    vi.spyOn(api, "getBillingCheckout").mockResolvedValue({ paymentDetails: { ...DETAILS, cliqAlias: "GYMVIEW" } } as Awaited<ReturnType<MockGymOSApi["getBillingCheckout"]>>);
    const { result: settings } = renderHook(() => usePaymentDetailsLoader("gym"), { wrapper: wrapper(gym) });
    await expect(settings.current()).resolves.toMatchObject({ cliqAlias: "GYMVIEW" });
  });

  it("falls back to the general payment line when the details cannot be read", async () => {
    const api = new MockGymOSApi();
    setApiForTests(api);
    vi.spyOn(api, "getBillingCheckout").mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePaymentDetailsLoader("gym"), { wrapper: wrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })) });
    await expect(result.current()).resolves.toBeUndefined();
  });

  it("hands the details to the document, as the emailed copy gets them", async () => {
    const tab = { closed: false, opener: {}, location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => "blob:invoice");
    URL.revokeObjectURL = vi.fn();
    openInvoicePdf(invoice, { name: "Forge" }, { locale: "en" }, async () => DETAILS);
    await waitFor(() => expect(tab.location.href).toBe("blob:invoice"));
    expect(renderer.input).toHaveBeenCalledWith("INV-1", expect.objectContaining({ amountMinor: 39_000 }), { name: "Forge" }, { locale: "en", paymentDetails: DETAILS });

    renderer.input.mockReset();
    const second = { closed: false, opener: {}, location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(second as unknown as Window);
    openInvoicePdf(invoice, { name: "Forge" }, { locale: "en" }, async () => undefined);
    await waitFor(() => expect(second.location.href).toBe("blob:invoice"));
    expect(renderer.input).toHaveBeenCalledWith("INV-1", expect.anything(), { name: "Forge" }, { locale: "en" });
  });
});
