import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { AssistSettingsSection } from "./assist-settings-section";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useParams: () => ({}), usePathname: () => "/settings", useSearchParams: () => new URLSearchParams("section=assist") }));

afterEach(() => resetApiForTests());

// jsdom has no pointer capture or scrolling; Radix Select needs both to open.
beforeAll(() => {
  const proto = Element.prototype as Element & { hasPointerCapture?: () => boolean; setPointerCapture?: () => void; releasePointerCapture?: () => void; scrollIntoView?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

describe("Jev assistance settings", () => {
  it("shows the environment status, lists the registered questions and lets an owner switch the gym on", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<AssistSettingsSection />);
    expect(await screen.findByRole("heading", { name: "Jev assistance", level: 2 })).toBeInTheDocument();
    expect(await screen.findByTestId("assist-mode")).toHaveTextContent("Preview answers");
    expect(screen.getByText("Gateway key missing")).toBeInTheDocument();
    expect(screen.getByText("Free terms not confirmed")).toBeInTheDocument();
    expect(screen.getByTestId("assist-blocked")).toHaveTextContent("switched off for this gym");
    const questions = within(screen.getByTestId("assist-questions"));
    expect(questions.getByText("Refund detected")).toBeInTheDocument();
    expect(questions.getByText("foundation.plan_fit · v1 · needs settings.manage")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Allow Jev suggestions" }));
    await user.type(screen.getByRole("textbox", { name: "Reason for changing Jev suggestions" }), "Pilot");
    await user.click(screen.getByRole("button", { name: "Save Jev switch" }));
    await screen.findByText(/Last changed .* by Omar Al-Khatib · Pilot/);
    expect((await api.getAssistStatus()).tenant.enabled).toBe(true);
    expect(screen.queryByTestId("assist-blocked")).not.toBeInTheDocument();
    const audit = await api.listAuditEvents({ pageSize: 5 });
    expect(audit.items[0]).toMatchObject({ action: "settings.assist.update", reason: "Pilot" });
  });

  it("runs a synthetic check through the same card a page would use, including a simulated outage", async () => {
    const user = userEvent.setup();
    await renderWithApp(<AssistSettingsSection />, { prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    await screen.findByTestId("assist-mode");
    await user.click(screen.getByRole("button", { name: "Run check" }));
    const card = await screen.findByTestId("assist-check");
    expect(card).toHaveTextContent("Refund detected");
    expect(card).toHaveTextContent("Likely yes (97%)");
    expect(card).toHaveTextContent("Preview answer");

    await user.click(screen.getByRole("combobox", { name: "Simulated outcome" }));
    await user.click(await screen.findByRole("option", { name: "Simulate a timeout" }));
    await user.click(screen.getByRole("button", { name: "Run check" }));
    expect(await screen.findByTestId("assist-check-unavailable")).toHaveTextContent("Simulated timeout");
  });

  it("explains why nothing runs while the gym is switched off", async () => {
    const user = userEvent.setup();
    await renderWithApp(<AssistSettingsSection />);
    await screen.findByTestId("assist-mode");
    await user.click(screen.getByRole("button", { name: "Run check" }));
    expect(await screen.findByTestId("assist-check-blocked")).toHaveTextContent("switched off for this gym");
    expect(screen.queryByTestId("assist-check")).not.toBeInTheDocument();
  });

  it("keeps the switch read-only for other roles and refuses their checks by permission", async () => {
    const user = userEvent.setup();
    await renderWithApp(<AssistSettingsSection />, { role: "manager", prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    await screen.findByTestId("assist-mode");
    expect(screen.getByRole("switch", { name: "Allow Jev suggestions" })).toBeDisabled();
    expect(screen.getByText("Only a role with the Manage settings permission can change this switch.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run check" }));
    // The server-side permission check answers before any switch is consulted; the page treats it like any other refusal.
    expect(await screen.findByTestId("assist-check-unavailable")).toHaveTextContent("settings.manage");
    expect(screen.queryByTestId("assist-check")).not.toBeInTheDocument();
  });
});
