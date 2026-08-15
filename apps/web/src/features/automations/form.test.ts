import { describe, expect, it } from "vitest";
import type { AutomationTriggerKey } from "@/lib/domain/types";
import { automationTriggerFieldValue, automationTriggerParameterLabel, automationTriggerParams, hasValidAutomationTriggerParams } from "./form";

describe("automation rule form parameters", () => {
  it("keeps expired-membership thresholds as days when a rule is edited", () => {
    const trigger = "membership_expired" satisfies AutomationTriggerKey;
    expect(automationTriggerParameterLabel(trigger)).toBe("Days after expiry");
    expect(automationTriggerFieldValue(trigger, { daysAfter: 3 })).toBe("3");
    expect(automationTriggerParams(trigger, "3")).toEqual({ daysAfter: 3 });
  });

  it("supports multiple expiry checkpoints and rejects incomplete thresholds", () => {
    expect(automationTriggerParams("membership_expiring", "14, 3, 14")).toEqual({ daysBefore: [14, 3] });
    expect(hasValidAutomationTriggerParams("membership_expiring", "14, 3")).toBe(true);
    expect(hasValidAutomationTriggerParams("membership_expiring", "nope")).toBe(false);
  });

  it("allows a membership that expired today to use a zero-day threshold", () => {
    expect(hasValidAutomationTriggerParams("membership_expired", "0")).toBe(true);
    expect(automationTriggerParams("membership_expired", "0")).toEqual({ daysAfter: 0 });
  });
});
