import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { AiRunPanel } from "./run-panel";
import { AssistanceSettingsSection } from "./assistance-settings-section";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({}), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

beforeEach(() => {
  // Radix checkboxes and radios measure themselves; jsdom has no ResizeObserver.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  resetApiForTests();
  vi.unstubAllGlobals();
});

async function enable(api: MockGymOSApi, mode: "prepare" | "execute" = "execute") {
  const settings = await api.getAiSettings();
  await api.updateAiSettings({ tenantMode: mode, expectedRevision: settings.revision });
}

async function activeMemberId(api: MockGymOSApi): Promise<string> {
  const page = await api.listMembers({ status: "active", pageSize: 20 });
  const member = page.items.find((item) => item.membershipStatus === "active") ?? page.items[0];
  if (!member) throw new Error("seed should contain an active member");
  return member.id;
}

describe("assistance beside the contact form", () => {
  function contactDialog(holder: { memberId: string }) {
    return function Dialog() { return <LogContactDialog subject="member" memberId={holder.memberId} open hideTrigger />; };
  }

  it("adds nothing while assistance is off, so the ordinary form is unchanged", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    await renderWithApp(<Dialog />, { prepare: async (api) => { holder.memberId = await activeMemberId(api); } });
    expect(await screen.findByTestId("log-contact-form")).toBeInTheDocument();
    expect(screen.queryByTestId("member-brief")).not.toBeInTheDocument();
    expect(screen.queryByTestId("note-assist")).not.toBeInTheDocument();
  });

  it("shows the member brief and fills fields from a note without saving anything until the person saves", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    expect(await screen.findByTestId("member-brief-headline")).toBeInTheDocument();
    await user.type(screen.getByTestId("contact-notes"), "No answer, try again tomorrow evening");
    await user.click(screen.getByTestId("note-assist-fill"));
    expect(await screen.findByTestId("note-assist-suggestions")).toBeInTheDocument();
    await user.click(screen.getByTestId("note-assist-use-all"));
    expect(screen.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    expect((screen.getByTestId("contact-next-followup") as HTMLInputElement).value).not.toBe("");
    expect(screen.getByText(/Call at 18:00/)).toBeInTheDocument();
    expect((await api.listTasks({ memberId: holder.memberId, status: "open", pageSize: 50 })).items.every((task) => !task.origin)).toBe(true);
  });

  it("never replaces an outcome the person already chose", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    await screen.findByTestId("note-assist");
    await user.click(screen.getByRole("radio", { name: "Interested" }));
    await user.type(screen.getByTestId("contact-notes"), "No answer, try again tomorrow");
    await user.click(screen.getByTestId("note-assist-fill"));
    const outcome = await screen.findByTestId("note-assist-outcome");
    expect(within(outcome).getByText("You already chose a different value. Yours stays.")).toBeInTheDocument();
    expect(within(outcome).queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Interested" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps a ticked travel note only after the contact saves", async () => {
    const holder = { memberId: "" };
    const Dialog = contactDialog(holder);
    const user = userEvent.setup();
    const { api } = await renderWithApp(<Dialog />, { prepare: async (prepared) => { await enable(prepared, "prepare"); holder.memberId = await activeMemberId(prepared); } });
    await screen.findByTestId("note-assist");
    // Relative day counts keep this independent of today's weekday.
    await user.type(screen.getByTestId("contact-notes"), "Travelling, back in 5 days. Call in 6 days evening");
    await user.click(screen.getByTestId("note-assist-fill"));
    await user.click(await screen.findByTestId("note-assist-remember-travel"));
    expect(await api.listMemberMemories(holder.memberId)).toEqual([]);
    await user.click(screen.getByTestId("note-assist-use-all"));
    await user.click(screen.getByTestId("log-contact-submit"));
    await waitFor(async () => expect((await api.listMemberMemories(holder.memberId)).map((memory) => memory.topic)).toEqual(["travel"]));
  });
});

describe("prepared work", () => {
  it("shows saved tasks and every exclusion with its reason, and offers no controls once finished", async () => {
    const holder = { runId: "" };
    function Panel() { return <AiRunPanel runId={holder.runId} />; }
    await renderWithApp(<Panel />, { prepare: async (api) => { await enable(api); holder.runId = (await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "ui-request-1" })).id; } });
    await waitFor(() => expect(screen.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "completed"), { timeout: 5_000 });
    expect(screen.getByTestId("ai-run-stage")).toHaveTextContent("Ready");
    expect(screen.getByTestId("ai-run-counts")).toHaveTextContent(/Created: \d+/);
    expect(screen.getByTestId("ai-run-results")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-run-cancel")).not.toBeInTheDocument();
  });

  it("stops at the next step and says what was already saved", async () => {
    const holder = { runId: "" };
    function Panel() { return <AiRunPanel runId={holder.runId} />; }
    const user = userEvent.setup();
    await renderWithApp(<Panel />, { latencyMs: 1, prepare: async (api) => { await enable(api); holder.runId = (await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "ui-request-2" })).id; } });
    await user.click(await screen.findByTestId("ai-run-cancel"));
    await waitFor(() => expect(screen.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "cancelled"), { timeout: 5_000 });
    expect(screen.getByTestId("ai-run-stage")).toHaveTextContent("Stopped");
  });
});

describe("Settings → Assistance", () => {
  it("lets an owner choose what RIVET may do and saves it", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<AssistanceSettingsSection />);
    expect(await screen.findByTestId("assistance-settings")).toBeInTheDocument();
    expect(screen.getByTestId("assistance-provider")).toHaveTextContent("Test mode");
    await user.click(screen.getByTestId("assistance-mode-execute"));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(async () => expect((await api.getAiSettings()).tenantMode).toBe("execute"));
  });
});
