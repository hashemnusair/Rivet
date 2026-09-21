import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { HighlightedMessageBody } from "./support-passages";
import { SupportClosureCheck } from "./support-closure-check";
import { SupportTriagePanel } from "./support-triage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/platform/support", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
afterEach(() => resetApiForTests());

const SEEDED_CASE = "SUP-219";

async function seededCase(api: MockGymOSApi, caseId = SEEDED_CASE): Promise<PlatformSupportCase> {
  const snapshot = await api.getPlatformSnapshot();
  const supportCase = snapshot.supportCases.find((item) => item.id === caseId);
  if (!supportCase) throw new Error(`seed should contain ${caseId}`);
  return supportCase;
}

const remember = (supportCase: PlatformSupportCase) => window.sessionStorage.setItem("test.case", JSON.stringify(supportCase));
const stored = (): PlatformSupportCase => JSON.parse(window.sessionStorage.getItem("test.case") ?? "{}") as PlatformSupportCase;

function TriageProbe({ onInsert }: { onInsert: (text: string) => void }) {
  return <SupportTriagePanel supportCase={stored()} onInsertClarification={onInsert} />;
}

function ClosureProbe({ onLocate, summary = "" }: { onLocate: (passage: { id: string }) => void; summary?: string }) {
  return <SupportClosureCheck supportCase={stored()} summaryDraft={summary} onLocate={onLocate} />;
}

describe("support triage for the platform inbox", () => {
  it("suggests a category with an existing destination, the recorded invoice and no clarification when the case already answers it, by keyboard", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    await renderWithApp(<TriageProbe onInsert={onInsert} />, { prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); remember(await seededCase(api)); } });
    const run = await screen.findByTestId("support-triage-run");
    run.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("support-category-label")).toHaveTextContent("Invoice dispute");
    await waitFor(() => expect(screen.getByTestId("support-destination")).toHaveAttribute("href", `/platform/billing?invoice=RV-1046&case=${SEEDED_CASE}`));
    expect(screen.getByTestId("support-invoice-match")).toHaveTextContent("RV-1046");
    expect(await screen.findByTestId("support-clarification-none")).toBeInTheDocument();
    expect(screen.queryByTestId("support-clarification-insert")).not.toBeInTheDocument();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("offers at most one prepared clarification and only inserts it into the reply the operator writes", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const { api } = await renderWithApp(<TriageProbe onInsert={onInsert} />, {
      prepare: async (mock) => {
        await mock.updateAssistPreference({ enabled: true });
        const session = await mock.getSession();
        const created = await mock.createSupportCase({ email: session.user.email, subject: "Double charge", body: "We paid an invoice but it still shows open. Please check.", priority: "normal", requestType: "general" });
        remember(await seededCase(mock, created.id));
      },
    });
    await user.click(await screen.findByTestId("support-triage-run"));
    expect(await screen.findByTestId("support-category-label")).toHaveTextContent("Invoice dispute");
    expect(await screen.findByTestId("support-invoice-none")).toBeInTheDocument();
    const clarification = await screen.findByTestId("support-clarification-text");
    expect(clarification).toHaveTextContent("invoice number");
    await user.click(screen.getByTestId("support-clarification-insert"));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert.mock.calls[0]?.[0]).toContain("invoice number");
    // Nothing was sent, and the case is untouched.
    const snapshot = await api.getPlatformSnapshot();
    const supportCase = snapshot.supportCases.find((item) => item.id === stored().id)!;
    expect(supportCase.status).toBe("open");
    expect(supportCase.messages).toHaveLength(1);
  });

  it("renders nothing while the gym's switch is off", async () => {
    await renderWithApp(<TriageProbe onInsert={vi.fn()} />, { prepare: async (api) => { remember(await seededCase(api)); } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(screen.queryByTestId("support-triage")).not.toBeInTheDocument();
  });
});

describe("checks before closing", () => {
  it("quotes the unanswered request and the unsupported claim by passage, links them to the conversation, and closes nothing", async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const { api } = await renderWithApp(<ClosureProbe onLocate={onLocate} />, { prepare: async (mock) => { await mock.updateAssistPreference({ enabled: true }); remember(await seededCase(mock)); } });
    await user.click(await screen.findByTestId("support-closure-run"));
    const requests = await screen.findByTestId("support-unanswered-findings");
    const requestItems = within(requests).getAllByTestId("support-unanswered-findings-item");
    expect(requestItems).toHaveLength(1);
    expect(requestItems[0]).toHaveTextContent("move our billing date to the 1st of each month");
    expect(requestItems[0]).toHaveAttribute("data-passage-id", "SUP-MSG-219-1:2");
    const claims = await screen.findByTestId("support-claim-findings");
    const claimItems = within(claims).getAllByTestId("support-claim-findings-item");
    expect(claimItems).toHaveLength(1);
    expect(claimItems[0]).toHaveTextContent("Enterprise plan");
    expect(within(claimItems[0]!).getByTestId("support-claim-evidence")).toHaveTextContent("the recorded plan is Pro, not Enterprise");
    await user.click(within(requestItems[0]!).getByRole("button", { name: "Show in conversation" }));
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({ id: "SUP-MSG-219-1:2" }));
    const snapshot = await api.getPlatformSnapshot();
    const untouched = snapshot.supportCases.find((item) => item.id === SEEDED_CASE);
    expect(untouched?.status).toBe("waiting");
    expect(untouched?.resolutionSummary).toBeUndefined();
    expect(untouched?.messages).toHaveLength(2);
  });

  it("counts the summary being written as an answer", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ClosureProbe onLocate={vi.fn()} summary="Refunded the duplicate and moved the billing date to the 1st of each month." />, { prepare: async (mock) => { await mock.updateAssistPreference({ enabled: true }); remember(await seededCase(mock)); } });
    await user.click(await screen.findByTestId("support-closure-run"));
    expect(await screen.findByTestId("support-unanswered-clear")).toBeInTheDocument();
  });
});

describe("highlighted message bodies", () => {
  it("marks only passages whose text is still in the body", () => {
    const body = "First sentence. Second sentence. Third.";
    render(<HighlightedMessageBody messageId="m1" body={body} highlights={[
      { id: "m1:1", messageId: "m1", authorType: "gym", authorName: "Owner", createdAt: "", index: 1, text: "Second sentence." },
      { id: "m1:9", messageId: "m1", authorType: "gym", authorName: "Owner", createdAt: "", index: 9, text: "Not there anymore." },
      { id: "m2:0", messageId: "m2", authorType: "gym", authorName: "Owner", createdAt: "", index: 0, text: "First sentence." },
    ]} />);
    const marks = screen.getAllByTestId("support-passage-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute("id", "support-passage-m1:1");
    expect(marks[0]).toHaveTextContent("Second sentence.");
  });
});
