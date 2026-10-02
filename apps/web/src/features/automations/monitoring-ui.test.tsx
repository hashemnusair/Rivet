import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationNextRun, automationRuleState } from "./monitoring-ui";

describe("automation rule state", () => {
  it("separates saved configuration from the global delivery pause", () => {
    expect(automationRuleState({ enabled: true }, true)).toEqual({ label: "on · on hold", variant: "warning" });
    expect(automationRuleState({ enabled: true }, false)).toEqual({ label: "on", variant: "success" });
    expect(automationRuleState({ enabled: false }, true)).toEqual({ label: "off", variant: "neutral" });
    expect(automationNextRun({ enabled: false }, true)).toBe("Turned off");
    expect(automationNextRun({ enabled: true }, true)).toBe("Waiting for the pause to end");
    expect(automationNextRun({ enabled: true }, false)).toBe("Waiting for the next run");
  });

  it("renders the state and execution badges in plain words", () => {
    render(<><AutomationRuleStateBadge rule={{ enabled: true }} globallyPaused /><AutomationExecutionBadge status="skipped_duplicate" /><AutomationExecutionBadge status="success" /><AutomationExecutionBadge status="queued" /><AutomationExecutionBadge status="failed" /></>);
    expect(screen.getByText("on · on hold")).toBeInTheDocument();
    expect(screen.getByText("skipped · already done")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText("waiting")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
