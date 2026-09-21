import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { AssistSimulation } from "@/lib/domain/types";
import { AssistSuggestion, JudgmentSummary } from "./assist-suggestion";
import { confidenceBand, describeJudgment } from "./assist-judgment";
import { useAssistJudgment } from "./use-assist-judgment";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useParams: () => ({}), usePathname: () => "/settings" }));

afterEach(() => resetApiForTests());

/** A page fragment the way a feature would use the pattern: the record stays usable whatever Jev says. */
function RecordPanel({ simulate, questionKey = "foundation.ticket_route" }: { simulate?: AssistSimulation; questionKey?: string }) {
  const suggestion = useAssistJudgment({ questionKey, subject: simulate ? { simulate } : {} });
  return (
    <div>
      <button type="button">Log contact</button>
      <AssistSuggestion suggestion={suggestion} title="Suggested team" render={(result) => <JudgmentSummary result={result} />} actions={(result) => <button type="button">Route to {result.judgment.kind === "choice" ? result.judgment.choice : "team"}</button>} fallback={<p>No suggestion</p>} />
    </div>
  );
}

/** Lets a test change the subject the way a page does when the person moves to another record. */
function SubjectSwitcher({ initial }: { initial?: AssistSimulation }) {
  const [simulate, setSimulate] = useState<AssistSimulation | undefined>(initial);
  return (
    <div>
      <button type="button" onClick={() => setSimulate(undefined)}>Use normal subject</button>
      <RecordPanel simulate={simulate} />
    </div>
  );
}

describe("AssistSuggestion with useAssistJudgment", () => {
  it("renders only the fallback while the gym has suggestions switched off", async () => {
    await renderWithApp(<RecordPanel />);
    expect(await screen.findByText("No suggestion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log contact" })).toBeEnabled();
    expect(screen.queryByTestId("assist-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assist-suggestion-loading")).not.toBeInTheDocument();
  });

  it("shows the judgment, its confidence and the feature's action once the gym allows suggestions", async () => {
    await renderWithApp(<RecordPanel />, { prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    const card = await screen.findByTestId("assist-suggestion");
    expect(card).toHaveTextContent("Jev suggestion");
    expect(card).toHaveTextContent("Preview answer");
    expect(card).toHaveTextContent("High confidence");
    expect(card).toHaveTextContent("billing: Charges, receipts, refunds and outstanding balances (94%)");
    expect(screen.getByRole("button", { name: "Route to billing" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Suggestion only.");
    expect(screen.queryByText("No suggestion")).not.toBeInTheDocument();
  });

  it("dismisses without touching the record", async () => {
    const user = userEvent.setup();
    await renderWithApp(<RecordPanel />, { prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    await screen.findByTestId("assist-suggestion");
    await user.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
    expect(screen.queryByTestId("assist-suggestion")).not.toBeInTheDocument();
    expect(await screen.findByText("No suggestion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log contact" })).toBeEnabled();
  });

  it("falls back to an inline note with a retry when the answer is unusable, and recovers on retry", async () => {
    const user = userEvent.setup();
    await renderWithApp(<SubjectSwitcher initial="timeout" />, { prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    const note = await screen.findByTestId("assist-suggestion-unavailable");
    expect(note).toHaveTextContent("Continue as usual; nothing here depends on it.");
    expect(screen.queryByTestId("assist-suggestion")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log contact" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use normal subject" }));
    await screen.findByTestId("assist-suggestion");
    await user.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
    expect(await screen.findByText("No suggestion")).toBeInTheDocument();
  });

  it("ignores the answer to a superseded subject", async () => {
    const user = userEvent.setup();
    await renderWithApp(<SubjectSwitcher initial="provider_error" />, { latencyMs: 40, prepare: async (api) => { await api.updateAssistPreference({ enabled: true }); } });
    // The first subject's answer (an outage) is still in flight when the subject changes.
    await user.click(await screen.findByRole("button", { name: "Use normal subject" }));
    await screen.findByTestId("assist-suggestion", undefined, { timeout: 3_000 });
    await waitFor(() => expect(screen.queryByTestId("assist-suggestion-unavailable")).not.toBeInTheDocument());
  });
});

describe("judgment copy", () => {
  it("reads each kind of judgment for people", () => {
    expect(describeJudgment("foundation.refund_detected", { kind: "boolean", probability: 0.97 })).toBe("Likely yes (97%)");
    expect(describeJudgment("foundation.refund_detected", { kind: "boolean", probability: 0.1 })).toBe("Likely no (90%)");
    expect(describeJudgment("foundation.note_urgency", { kind: "score", score: 2.9, level: 3, levelCount: 4, probabilities: { "3": 0.91 } })).toBe("Immediate: a person is waiting or money is at risk right now (score 2.90 of 3)");
    expect(describeJudgment("foundation.plan_fit", { kind: "choice", choice: "plan_b", probabilities: { plan_b: 0.86 } })).toBe("plan_b (86%)");
  });

  it("bands confidence by the model's own confidence or the decisiveness of the answer", () => {
    expect(confidenceBand({ kind: "boolean", probability: 0.97, confidence: 0.93 })).toMatchObject({ label: "High confidence", value: 0.93 });
    expect(confidenceBand({ kind: "boolean", probability: 0.62 })).toMatchObject({ label: "Low confidence" });
    expect(confidenceBand({ kind: "choice", choice: "a", probabilities: { a: 0.7, b: 0.3 } })).toMatchObject({ label: "Medium confidence", tone: "warning" });
  });
});
