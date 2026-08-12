import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { OperationalEmailSection } from "./operational-email-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

describe("OperationalEmailSection", () => {
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
    expect(screen.getByRole("button", { name: "Save member service preferences" })).toBeEnabled();
    expect(screen.getByLabelText("Change note (optional)")).toBeInTheDocument();
  });
});
