import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PtBooking } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { BookingOutcomeConfirmation } from "./booking-outcome-confirmation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/pt",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

const booking: PtBooking = {
  id: "pt-booking-safety", organizationId: "org", memberId: "member-1", memberName: "Nour Haddad", trainerProfileId: "trainer-1", trainerName: "Rami Saleh", branchId: "branch-1", branchName: "Main Branch", entitlementId: "credit-1", startsAt: "2026-08-12T10:00:00.000Z", endsAt: "2026-08-12T11:00:00.000Z", status: "confirmed", createdAt: "2026-08-11T10:00:00.000Z", updatedAt: "2026-08-11T10:00:00.000Z",
};

describe("BookingOutcomeConfirmation", () => {
  it("names the member, trainer, time, and consumptive no-show consequence before a reason-gated confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    await renderWithApp(<BookingOutcomeConfirmation booking={booking} action="no_show" open onOpenChange={() => undefined} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog", { name: "Mark PT session as no-show?" })).toBeInTheDocument();
    expect(screen.getByText("Nour Haddad")).toBeInTheDocument();
    expect(screen.getByText("Rami Saleh")).toBeInTheDocument();
    expect(screen.getByText(/One reserved PT credit will be consumed/)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Record no-show" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /No-show reason/i }), "Member did not arrive for the session.");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ action: "no_show", reason: "Member did not arrive for the session." }));
  });

  it("keeps routine completion quick while still confirming the consumed credit", async () => {
    await renderWithApp(<BookingOutcomeConfirmation booking={booking} action="completed" open onOpenChange={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByText("Routine completion stays fast: no reason is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete session" })).toBeEnabled();
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
  });
});
