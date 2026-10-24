import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { MockDb } from "@/lib/mock/store";
import AppLayout from "../layout";
import ExportCenterClient from "./export-center.client";
const identity = vi.hoisted(() => ({ value: { status: "ready", platformAdmin: false, gymAccessUnavailable: true, memberships: [], exportAccess: [{ organizationId: "", organizationName: "Cancelled Gym", expiresAt: "2099-01-01T00:00:00Z" }] } }));
vi.mock("@/lib/auth/rivet-identity", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/auth/rivet-identity")>(), useRivetIdentity: () => identity.value }));
vi.mock("@/lib/providers/experience-provider", () => ({ useExperience: () => ({ customerSignedIn: false, platformAdminSignedIn: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/exports", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }), useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/lib/exports/download", () => ({ downloadTextFile: vi.fn() }));
afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); });
it("renders the real exports page for a cancelled owner without workspace navigation or agreement/billing gates", async () => {
  const result = await renderWithApp(<AppLayout><ExportCenterClient /></AppLayout>, { prepare: async api => {
    const { db } = api as unknown as { db: MockDb };
    db.organization.status = "cancelled"; db.organization.cancelledAt = new Date().toISOString();
    identity.value.exportAccess[0]!.organizationId = db.organization.id;
  } });
  expect(await screen.findByRole("status")).toHaveTextContent("30-day export window");
  expect(screen.queryByRole("complementary", { name: "Primary navigation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Download CSV" })).toHaveLength(7);
  const create = vi.spyOn(result.api, "requestExport");
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Download CSV" })[0]!);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "members", organizationId: identity.value.exportAccess[0]!.organizationId }));
  expect(await screen.findByText(/File content: English/)).toBeInTheDocument();
});
