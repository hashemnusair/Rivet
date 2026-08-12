import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./field";
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
