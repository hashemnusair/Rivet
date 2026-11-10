import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { PtMemberExperience, PtPackageOrder } from "@/lib/domain/types";
import { PersonalTrainingTab } from "./member-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/members/member-1",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); });

const jod = (amount: number) => ({ amount, currency: "JOD" });
const order: PtPackageOrder = { id: "order-1", organizationId: "org", memberId: "member-1", packageId: "package-1", chargeId: "charge-1", packageName: "Ten sessions", sessionCountSnapshot: 10, totalPriceSnapshot: jod(100_000), status: "active", entitlementId: "entitlement-1", createdAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-01T08:00:00.000Z" };
const experience: PtMemberExperience = {
  organizationId: "org", membershipId: "membership-1", availableSessions: 4, reservedSessions: 0, upcomingBookings: [], trainers: [], packages: [],
  entitlements: [{ id: "entitlement-1", organizationId: "org", memberId: "member-1", source: "package", packageOrderId: "order-1", granted: 10, reserved: 0, consumed: 6, revoked: 0, available: 4, expiresAt: "2099-01-01T00:00:00.000Z", status: "active", createdAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-01T08:00:00.000Z" }],
  orders: [order, { ...order, id: "order-2", status: "pending_payment", entitlementId: undefined }],
};

async function open(role: "owner" | "receptionist") {
  const result = await renderWithApp(<PersonalTrainingTab membershipId="membership-1" />, { role, prepare: async (api) => { vi.spyOn(api, "getPtMemberExperience").mockResolvedValue(experience); vi.spyOn(api, "subscribePtMemberExperience").mockImplementation((_id, onValue) => { onValue(experience); return Promise.resolve(() => {}); }); } });
  await screen.findByText("Recent packages");
  return result;
}

it("refunds unused sessions of a paid package with a reason, and never more than are left", async () => {
  const { api } = await open("owner");
  const refund = vi.spyOn(api, "refundPtPackage").mockResolvedValue({ ...order, status: "partially_refunded" });
  const user = userEvent.setup();
  // Only the paid package offers a refund; the unpaid order does not.
  expect(screen.getAllByRole("button", { name: "Refund" })).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Refund" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Sessions left on this package: 4/)).toBeInTheDocument();
  const confirm = within(dialog).getByRole("button", { name: "Refund" });
  const [sessions, reason] = within(dialog).getAllByRole("textbox");
  await user.type(reason!, "Member is moving abroad");
  await user.clear(sessions!);
  await user.type(sessions!, "5");
  expect(confirm).toBeDisabled();
  await user.clear(sessions!);
  await user.type(sessions!, "2");
  expect(within(dialog).getByText(/20/)).toBeInTheDocument();
  await user.click(confirm);
  await waitFor(() => expect(refund).toHaveBeenCalledWith("order-1", { sessions: 2, reason: "Member is moving abroad" }));
});

it("offers no refund to a role without the PT refund permission", async () => {
  await open("receptionist");
  expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
});
