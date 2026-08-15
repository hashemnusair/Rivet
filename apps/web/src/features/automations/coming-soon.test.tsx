import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutomationComingSoon } from "./coming-soon";

describe("AutomationComingSoon", () => {
  it("clearly pauses the automation workspace without exposing rule controls", () => {
    render(<AutomationComingSoon />);

    expect(screen.getByRole("heading", { name: "Automations are paused for now" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New rule" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
