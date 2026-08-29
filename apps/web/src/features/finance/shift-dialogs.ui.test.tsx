import { screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getApi } from "@/lib/api/client";
import type { CashShift } from "@/lib/domain/types";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CloseShiftDialog } from "./shift-dialogs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/payments/shifts",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  resetApiForTests();
});

function PreparedCloseShift() {
  const [shift, setShift] = useState<CashShift>();

  useEffect(() => {
    void (async () => {
      const api = getApi();
      const session = await api.getSession();
      const branchId = session.activeBranchId ?? session.branches[0]?.id;
      if (!branchId) throw new Error("missing branch fixture");
      const current = await api.getCurrentShiftTotals(branchId);
      setShift(current?.shift ?? await api.openCashShift({ branchId, openingFloat: money(50_000) }));
    })();
  }, []);

  return shift ? <CloseShiftDialog open onOpenChange={() => undefined} shift={shift} /> : <p>Preparing shift…</p>;
}

function PreparedStaleShift() {
  const [shift, setShift] = useState<CashShift>();
  useEffect(() => {
    void getApi().getSession().then((session) => {
      const branchId = session.activeBranchId ?? session.branches[0]?.id;
      if (!branchId) throw new Error("missing branch fixture");
      setShift({
        id: "stale-shift",
        organizationId: session.organization.id,
        branchId,
        openedById: session.user.id,
        openedByName: "Previous operator",
        openedAt: "2026-08-28T06:00:00.000Z",
        openingFloat: money(50_000),
        status: "open",
      });
    });
  }, []);
  return shift ? <CloseShiftDialog open onOpenChange={() => undefined} shift={shift} /> : <p>Preparing stale shift…</p>;
}

describe("CloseShiftDialog totals gate", () => {
  it("keeps close disabled until server totals load, then recovers", async () => {
    await renderWithApp(<PreparedCloseShift />, { role: "receptionist", latencyMs: 250 });
    const close = await screen.findByTestId("confirm-close-shift");
    expect(close).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Loading authoritative shift totals");
    await waitFor(() => expect(close).toBeEnabled());
  });

  it("refuses a stale shift that is not the branch's current open shift", async () => {
    await renderWithApp(<PreparedStaleShift />, { role: "receptionist" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer the branch's open shift/i);
    expect(screen.getByTestId("confirm-close-shift")).toBeDisabled();
  });
});
