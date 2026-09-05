import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationNextRun, automationRuleState } from "./monitoring-ui";

describe("automation rule state", () => {
  it("separates saved configuration from the global delivery pause", () => {
    expect(automationRuleState({ enabled: true }, true)).toEqual({ label: "enabled · held", variant: "warning" });
    expect(automationRuleState({ enabled: true }, false)).toEqual({ label: "enabled", variant: "success" });
    expect(automationRuleState({ enabled: false }, true)).toEqual({ label: "paused", variant: "neutral" });
    expect(automationNextRun({ enabled: false }, true)).toBe("Paused in saved configuration");
    expect(automationNextRun({ enabled: true }, true)).toBe("Held by the global pause");
    expect(automationNextRun({ enabled: true }, false)).toBe("Awaiting scheduler");
  });

  it("renders the state and execution badges in plain words", () => {
    render(<><AutomationRuleStateBadge rule={{ enabled: true }} globallyPaused /><AutomationExecutionBadge status="skipped_duplicate" /><AutomationExecutionBadge status="success" /><AutomationExecutionBadge status="queued" /><AutomationExecutionBadge status="failed" /></>);
    expect(screen.getByText("enabled · held")).toBeInTheDocument();
    expect(screen.getByText("suppressed · duplicate")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
