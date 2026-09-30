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

  it("separates the emails a gym can choose from the RIVET emails it cannot turn off", async () => {
    await renderWithApp(<OperationalEmailSection />);
    expect(await screen.findByRole("heading", { name: "Emails to members" })).toBeInTheDocument();
    expect(screen.getByText("RIVET emails you cannot turn off")).toBeInTheDocument();
    expect(screen.getByText("RIVET invoice sent")).toBeInTheDocument();
    expect(screen.getByText("RIVET subscription suspended")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "RIVET invoice sent" })).not.toBeInTheDocument();
    expect(screen.getByText(/RIVET has turned off email sending for now/i)).toBeInTheDocument();
  });

  it("does not gate an ordinary service preference enablement with a reason", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationalEmailSection />);
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(receipt);
    expect(screen.getByRole("button", { name: "Save email settings" })).toBeEnabled();
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
  });

  it("requires a reason for disable-only and same-count swap changes", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationalEmailSection />);
    const update = vi.spyOn(api, "updateOperationalEmailSettings");
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(screen.getByRole("checkbox", { name: "Payment receipt" }));
    await user.click(screen.getByRole("button", { name: "Save email settings" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabledKinds: ["payment_receipt"], reason: "" });
      expect(receipt).toHaveAttribute("data-state", "checked");
      expect(screen.getByText(/Last changed by/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("checkbox", { name: "Payment receipt" }));
    expect(screen.getByLabelText(/Why are you turning off these emails/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save email settings" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Trial update" }));
    expect(screen.getByLabelText(/Why are you turning off these emails/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save email settings" })).toBeDisabled();
  });

  it("returns to a clean state after saving", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationalEmailSection />);
    const update = vi.spyOn(api, "updateOperationalEmailSettings");
    const receipt = await screen.findByRole("checkbox", { name: "Payment receipt" });
    await user.click(receipt);
    await user.click(screen.getByRole("button", { name: "Save email settings" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ enabledKinds: ["payment_receipt"], reason: "" });
      expect(receipt).toHaveAttribute("data-state", "checked");
      expect(screen.getByText(/Last changed by/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save email settings" })).not.toBeInTheDocument();
  });
});
