import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("keeps password-manager metadata and exposes a keyboard-friendly reveal toggle", async () => {
    const user = userEvent.setup();
    render(
      <Field label="Password" htmlFor="password" required>
        <PasswordInput id="password" autoComplete="new-password" />
      </Field>,
    );

    const input = screen.getByLabelText(/Password/);
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(toggle).toHaveAttribute("aria-controls", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
