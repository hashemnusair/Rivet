import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorState, StatePanel } from "./states";

describe("StatePanel", () => {
  it.each(["inline", "section", "page"] as const)("renders the %s layout explicitly", (layout) => {
    render(<StatePanel layout={layout} title={`${layout} state`} description="Useful context." />);
    expect(screen.getByRole("status")).toHaveAttribute("data-state-layout", layout);
  });

  it("announces retryable failures assertively", () => {
    render(<ErrorState title="Connection interrupted" onRetry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("keeps compact as a compatibility alias for section states", () => {
    render(<StatePanel compact title="No rows" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-state-layout", "section");
  });
});
