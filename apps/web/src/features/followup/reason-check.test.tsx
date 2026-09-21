import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReasonCheck } from "@/features/followup/reason-check";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/payments", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));

afterEach(() => resetApiForTests());

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

describe("reason check", () => {
  it("asks for the missing fact behind a vague refund reason and never writes one", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ReasonCheck action="refund" reason="customer request" />, { prepare: enableAssist });
    await user.click(await screen.findByRole("button", { name: "Check reason" }));
    const reading = await screen.findByTestId("reason-check-level-1");
    expect(reading).toHaveTextContent("Too general");
    expect(reading).toHaveTextContent("Say what was wrong with the payment");
    expect(reading).toHaveTextContent("stays yours to submit");
  });

  it("has nothing to add to a specific reason", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ReasonCheck action="checkin_override" reason="Paid at Abdoun branch this morning, receipt #4412 shown at the desk" />, { prepare: enableAssist });
    await user.click(await screen.findByRole("button", { name: "Check reason" }));
    expect(await screen.findByTestId("reason-check-level-3")).toHaveTextContent("Nothing to add");
  });

  it("never authorises the action: without the refund permission the check is simply unavailable", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ReasonCheck action="refund" reason="customer request" />, { role: "receptionist", prepare: async (api) => { await api.switchDemoRole("owner"); await enableAssist(api); await api.switchDemoRole("receptionist"); } });
    await user.click(await screen.findByRole("button", { name: "Check reason" }));
    expect(await screen.findByTestId("reason-check-unavailable")).toHaveTextContent("Continue as usual");
    expect(screen.queryByTestId("reason-check-level-1")).not.toBeInTheDocument();
  });
});
