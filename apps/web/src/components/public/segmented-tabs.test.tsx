import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedTabs } from "./segmented-tabs";

function Harness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return (
    <SegmentedTabs
      label="Sections"
      value={value}
      onChange={setValue}
      items={[{ value: "a", label: "Alpha" }, { value: "b", label: <span>β</span>, name: "Beta" }, { value: "c", label: "Gamma" }]}
    />
  );
}

describe("SegmentedTabs", () => {
  it("exposes one tablist with the shared underline selection and accessible names", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("tab", { name: "Beta" })).toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves the selection and focus with the arrow keys and wraps at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
  });

  it("selects on tap without needing hover", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  });
});
