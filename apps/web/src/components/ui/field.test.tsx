import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field, FieldGrid } from "./field";
import { Input } from "./input";

describe("Field label association", () => {
  it("uses a child's existing id ahead of htmlFor", async () => {
    const user = userEvent.setup();
    render(<Field label="Member email" htmlFor="fallback-id"><Input id="existing-id" /></Field>);

    const label = screen.getByText("Member email");
    expect(label).toHaveAttribute("for", "existing-id");
    await user.click(label);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("generates and forwards an id for a trusted form control", async () => {
    const user = userEvent.setup();
    render(<Field label="Gym name"><Input /></Field>);

    const label = screen.getByText("Gym name");
    const input = screen.getByRole("textbox");
    expect(label).toHaveAttribute("for", input.getAttribute("id"));
    await user.click(label);
    expect(input).toHaveFocus();
  });

  it("does not invent a label target for an untrusted custom control", () => {
    const onChange = vi.fn();
    function CustomControl({ value }: { value: string; onChange: () => void }) {
      return <div data-testid="custom-control" data-value={value} />;
    }

    render(<Field label="Custom picker"><CustomControl value="one" onChange={onChange} /></Field>);

    expect(screen.getByText("Custom picker")).not.toHaveAttribute("for");
    expect(screen.getByTestId("custom-control")).not.toHaveAttribute("id");
  });
});

describe("FieldGrid", () => {
  it("reserves a shared two-line label rhythm from the selected breakpoint", () => {
    render(
      <FieldGrid className="sm:grid-cols-3">
        <Field label="Short"><Input /></Field>
        <Field label="A label that can wrap"><Input /></Field>
      </FieldGrid>,
    );

    const grid = screen.getByText("Short").closest('[data-slot="field-grid"]');
    expect(grid).toHaveClass("grid", "sm:grid-cols-3");
    expect(grid?.className).toContain("sm:[&>[data-slot=field]>[data-slot=field-label]]:min-h-[2lh]");
    expect(screen.getByText("Short")).toHaveAttribute("data-slot", "field-label");
  });

  it("can align an always-multicolumn group without waiting for a breakpoint", () => {
    render(
      <FieldGrid alignFrom="base" className="grid-cols-2">
        <Field label="Amount"><Input /></Field>
        <Field label="Payment method"><Input /></Field>
      </FieldGrid>,
    );

    const grid = screen.getByText("Amount").closest('[data-slot="field-grid"]');
    expect(grid?.className).toContain("[&>[data-slot=field]>[data-slot=field-label]]:min-h-[2lh]");
  });
});
