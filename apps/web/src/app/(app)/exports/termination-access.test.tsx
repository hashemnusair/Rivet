import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { MockDb } from "@/lib/mock/store";
import type { RivetIdentity } from "@/lib/auth/rivet-identity";
import { BillingCheckoutPage } from "@/features/billing/billing-checkout";
import AppLayout from "../layout";
import ExportCenterClient from "./export-center.client";
const route = vi.hoisted(() => ({ pathname: "/exports", search: "", replace: vi.fn() }));
const identity = vi.hoisted(() => ({ value: { status: "ready", platformAdmin: false, gymAccessUnavailable: true, memberships: [], exportAccess: [{ organizationId: "", organizationName: "Cancelled Gym", expiresAt: "2099-01-01T00:00:00Z" }] } as RivetIdentity }));
vi.mock("@/lib/auth/rivet-identity", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/auth/rivet-identity")>(), useRivetIdentity: () => identity.value }));
vi.mock("@/lib/providers/experience-provider", () => ({ useExperience: () => ({ customerSignedIn: false, platformAdminSignedIn: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search), useRouter: () => ({ push: vi.fn(), replace: route.replace }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }), useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/lib/exports/download", () => ({ downloadTextFile: vi.fn() }));
beforeEach(() => { route.pathname = "/exports"; route.search = ""; route.replace.mockClear(); identity.value.billingAccess = undefined; });
afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); });
it("renders the real exports page for a cancelled owner without workspace navigation or agreement/billing gates", async () => {
  const result = await renderWithApp(<AppLayout><ExportCenterClient /></AppLayout>, { prepare: async api => {
    const { db } = api as unknown as { db: MockDb };
    db.organization.status = "cancelled"; db.organization.cancelledAt = new Date().toISOString();
    identity.value.exportAccess![0]!.organizationId = db.organization.id;
  } });
  expect(await screen.findByRole("status")).toHaveTextContent("30-day export window");
  expect(screen.queryByRole("complementary", { name: "Primary navigation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Download CSV" })).toHaveLength(7);
  const create = vi.spyOn(result.api, "requestExport");
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Download CSV" })[0]!);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "members", organizationId: identity.value.exportAccess![0]!.organizationId }));
  expect(await screen.findByText(/File content: English/)).toBeInTheDocument();
});

it.each(["pending_payment", "suspended"] as const)("keeps both scoped destinations reachable with a %s companion", async status => {
  identity.value.billingAccess = [{ organizationId: "billing-org", organizationName: "Billing Gym", status }];
  const result = await renderWithApp(<AppLayout><ExportCenterClient /></AppLayout>, { prepare: async api => {
    const { db } = api as unknown as { db: MockDb };
    db.organization.status = "cancelled"; db.organization.cancelledAt = new Date().toISOString();
    identity.value.exportAccess![0]!.organizationId = db.organization.id;
  } });
  expect(await screen.findByRole("link", { name: "Billing · Billing Gym" })).toHaveAttribute("href", "/billing?organizationId=billing-org");
  expect(screen.getByRole("link", { name: "Exports · Cancelled Gym" })).toHaveAttribute("href", expect.stringContaining("/exports?organizationId="));
  expect(screen.getByText(/Cancelled Gym ·/)).toBeInTheDocument();
  expect(route.replace).not.toHaveBeenCalled();
  result.unmount(); resetApiForTests();
  route.pathname = "/billing"; route.search = "organizationId=billing-org";
  let lookup: ReturnType<typeof vi.fn> = vi.fn();
  await renderWithApp(<BillingCheckoutPage />, { prepare: async api => {
    lookup = vi.fn();
    vi.spyOn(api, "getBillingCheckout").mockImplementation(async organizationId => { lookup(organizationId); return { gym: { id: "billing-org", name: "Billing Gym", status, billingInterval: "monthly", timezone: "UTC" }, canPay: true, paymentDetails: { cliqAlias: "", cliqName: "", iban: "", bankName: "", accountName: "", note: "" } }; });
  } });
  expect(await screen.findByText("Nothing to pay right now")).toBeInTheDocument();
  expect(lookup!).toHaveBeenCalledWith("billing-org");
  expect(screen.getByRole("link", { name: "Exports · Cancelled Gym" })).toHaveAttribute("href", expect.stringContaining("organizationId="));
  expect(route.replace).not.toHaveBeenCalled();
});
it("requires selection for several export gyms and refuses a foreign URL scope", async () => {
  const original = identity.value.exportAccess!;
  identity.value.exportAccess = [...original, { organizationId: "other-closed", organizationName: "Other Closed Gym", expiresAt: "2099-01-01T00:00:00Z" }];
  route.search = "organizationId=foreign";
  const result = await renderWithApp(<AppLayout><ExportCenterClient /></AppLayout>);
  const query = vi.spyOn(result.api, "listExportJobs");
  expect(screen.getByRole("combobox", { name: "Choose a gym" })).toHaveValue("");
  expect(screen.getAllByRole("button", { name: "Download CSV" }).every(button => button.hasAttribute("disabled"))).toBe(true);
  expect(query).not.toHaveBeenCalled();
  identity.value.exportAccess = original;
});
it.each(["", "organizationId=foreign"])("does not silently pick a billing gym for ambiguous/invalid selection: %s", async search => {
  identity.value.billingAccess = [
    { organizationId: "billing-a", organizationName: "Billing A", status: "pending_payment" },
    { organizationId: "billing-b", organizationName: "Billing B", status: "suspended" },
  ];
  route.pathname = "/billing"; route.search = search;
  const lookup = vi.fn();
  await renderWithApp(<BillingCheckoutPage />, { prepare: async api => { vi.spyOn(api, "getBillingCheckout").mockImplementation(lookup); } });
  expect(await screen.findByText("Choose the gym whose invoice you want to pay")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Billing A" })).toHaveAttribute("href", "/billing?organizationId=billing-a");
  expect(screen.getByRole("link", { name: "Billing B" })).toHaveAttribute("href", "/billing?organizationId=billing-b");
  expect(lookup).not.toHaveBeenCalled();
});
it("redirects an export tab when identity no longer grants cancelled-gym access", async () => {
  const original = identity.value.exportAccess;
  identity.value.exportAccess = [];
  identity.value.billingAccess = [{ organizationId: "billing", organizationName: "Billing Gym", status: "suspended" }];
  try {
    await renderWithApp(<AppLayout><ExportCenterClient /></AppLayout>);
    expect(route.replace).toHaveBeenCalledWith("/billing");
    expect(screen.queryByRole("button", { name: "Download CSV" })).not.toBeInTheDocument();
  } finally { identity.value.exportAccess = original; }
});
it("scopes Support links to the selected gym while retaining the authorized dashboard return", async () => {
  identity.value.memberships = [{ organizationId: "active-workspace", organizationName: "Active Gym", organizationSlug: "active", role: "owner", branches: [] }];
  identity.value.billingAccess = [{ organizationId: "restricted", organizationName: "Restricted Gym", status: "suspended" }];
  route.pathname = "/billing"; route.search = "organizationId=restricted";
  try {
    await renderWithApp(<BillingCheckoutPage />, { prepare: async api => {
      const base = await api.getBillingCheckout();
      vi.spyOn(api, "getBillingCheckout").mockResolvedValue({ ...base, gym: { ...base.gym, id: "restricted", name: "Restricted Gym", status: "suspended" }, invoice: { id: "INV-other", gym: "Restricted Gym", amount: "JOD 49.000", amountMinor: 49000, status: "open", date: "2026-10-10", supportCaseId: "support-other", paymentClaim: { method: "cliq", reference: "BANK-1", payerName: "Owner", paidOn: "2026-10-10", status: "submitted", submittedAt: "2026-10-10T12:00:00Z", amountMinor: 49000 } } });
    } });
    expect(await screen.findByText("We are checking your payment")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See it in Support" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
  } finally { identity.value.memberships = []; }
});
