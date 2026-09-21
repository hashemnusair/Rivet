import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CommandPalette } from "./command-palette";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.scrollIntoView = () => undefined;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

afterEach(() => {
  resetApiForTests();
  push.mockClear();
});

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };
const askGroup = () => screen.getByText("Ask Jev").closest("[cmdk-group]") as HTMLElement;

describe("command palette intent assistance", () => {
  it("keeps the palette unchanged while suggestions are off, apart from catalogue places in the fast search", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />);
    await user.type(screen.getByRole("combobox", { name: "Global search" }), "refund");
    expect(await screen.findByText("Places")).toBeInTheDocument();
    expect(screen.getByText("Settings: Roles & permissions")).toBeInTheDocument();
    expect(screen.queryByText("Ask Jev")).not.toBeInTheDocument();
  });

  it("asks only on a deliberate selection, keeps the typed draft, and opens the permitted setting the person chooses", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />, { prepare: enableAssist });
    const judge = vi.spyOn(api, "requestAssistJudgment");
    const input = screen.getByRole("combobox", { name: "Global search" });
    await user.type(input, "Where do I change who can refund?");
    const ask = await screen.findByText(/Ask where to go for/);
    expect(judge).not.toHaveBeenCalled();
    await user.click(ask);
    const suggestion = await screen.findByText("Open Settings: Roles & permissions");
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ questionKey: "navigation.intent", subject: { query: "Where do I change who can refund?", path: "/dashboard" } }));
    expect(input).toHaveValue("Where do I change who can refund?");
    expect(within(askGroup()).getByText("High confidence")).toBeInTheDocument();
    await user.click(suggestion);
    expect(push).toHaveBeenCalledWith("/settings?section=roles");
  });

  it("clarifies an ambiguous request between existing workflows instead of guessing", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />, { prepare: enableAssist });
    await user.type(screen.getByRole("combobox", { name: "Global search" }), "Record a payment");
    await user.click(await screen.findByText(/Ask where to go for/));
    expect(await screen.findByText("Which payment do you mean?")).toBeInTheDocument();
    const group = askGroup();
    expect(within(group).getByText("Collect a member payment")).toBeInTheDocument();
    expect(within(group).getByText("Record a supplier payment")).toBeInTheDocument();
    await user.click(within(group).getByText("Record a supplier payment"));
    expect(push).toHaveBeenCalledWith("/operations/payables");
  });

  it("says so when nothing matches and never offers a destination the role cannot open", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />, { role: "receptionist", prepare: async (api) => { await api.switchDemoRole("owner"); await enableAssist(api); await api.switchDemoRole("receptionist"); } });
    await user.type(screen.getByRole("combobox", { name: "Global search" }), "Where do I change who can refund?");
    await user.click(await screen.findByText(/Ask where to go for/));
    await waitFor(() => expect(askGroup()).not.toHaveTextContent("Asking Jev"));
    expect(screen.queryByText("Open Settings: Roles & permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings: Roles & permissions")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("combobox", { name: "Global search" }));
    await user.type(screen.getByRole("combobox", { name: "Global search" }), "what is the capital of france");
    await user.click(await screen.findByText(/Ask where to go for/));
    expect(await screen.findByText(/No page, report, form or setting in RIVET matches/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to keyword results when the model fails, and can ask again", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />, { prepare: enableAssist });
    vi.spyOn(api, "requestAssistJudgment").mockRejectedValueOnce(new Error("gateway down"));
    await user.type(screen.getByRole("combobox", { name: "Global search" }), "refund");
    await user.click(await screen.findByText(/Ask where to go for/));
    expect(await screen.findByText(/Keyword results still work/)).toBeInTheDocument();
    expect(screen.getByText("Settings: Roles & permissions")).toBeInTheDocument();
    await user.click(screen.getByText("Ask again"));
    expect(await screen.findByText("Open Settings: Roles & permissions")).toBeInTheDocument();
  });
});
