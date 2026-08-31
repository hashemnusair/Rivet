import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { disabledOperationalEmailKinds, OperationalEmailSection } from "./operational-email-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

describe("OperationalEmailSection", () => {
  it("compares enabled categories as sets", () => {
    expect(disabledOperationalEmailKinds(["receipt"], ["receipt", "trial"])).toEqual([]);
    expect(disabledOperationalEmailKinds(["receipt", "trial"], ["receipt"])).toEqual(["trial"]);
    expect(disabledOperationalEmailKinds(["receipt"], ["trial"])).toEqual(["receipt"]);
    expect(disabledOperationalEmailKinds(["receipt"], ["receipt"])).toEqual([]);
  });

  it("separates owner-configurable member service preferences from locked platform notices", async () => {
    await renderWithApp(<OperationalEmailSection />);
    expect(await screen.findByRole("heading", { name: "Member service email" })).toBeInTheDocument();
    expect(screen.getByText("Mandatory RIVET platform notices")).toBeInTheDocument();
    expect(screen.getByText("Platform invoice issued")).toBeInTheDocument();
    expect(screen.getByText("Subscription suspended")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Platform invoice issued" })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot activate the global worker or Resend delivery/i)).toBeInTheDocument();
  });

  it("does not gate an ordinary service preference enablement with a reason", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationalEmailSection />);
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(receipt);
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeEnabled();
    expect(screen.getByLabelText("Change note (optional)")).toBeInTheDocument();
  });

  it("requires a reason for disable-only and same-count swap changes", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationalEmailSection />);
    const update = vi.spyOn(api, "updateOperationalEmailSettings");
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(screen.getByRole("checkbox", { name: "Payment receipt" }));
    await user.click(screen.getByRole("button", { name: "Save email preferences" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabledKinds: ["payment_receipt"], reason: "" });
      expect(receipt).toHaveAttribute("data-state", "checked");
      expect(screen.getByText(/Last changed by/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("checkbox", { name: "Payment receipt" }));
    expect(screen.getByLabelText(/Reason for disabling service messages/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Trial status" }));
    expect(screen.getByLabelText(/Reason for disabling service messages/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeDisabled();
  });

  it("returns to a clean state after saving", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationalEmailSection />);
    const update = vi.spyOn(api, "updateOperationalEmailSettings");
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(receipt);
    await user.click(screen.getByRole("button", { name: "Save email preferences" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabledKinds: ["payment_receipt"], reason: "" });
      expect(receipt).toHaveAttribute("data-state", "checked");
      expect(screen.getByText(/Last changed by/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Change note (optional)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save email preferences" })).not.toBeInTheDocument();
  });
});
